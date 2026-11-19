#!/usr/bin/env python3
"""Independently verify B's immutable Git migration snapshot in disposable PostgreSQL.

Requires Docker and the PostgreSQL/Flyway images used by Lab 1. Does not merge the
source branch or touch Compose/Kubernetes data. Database storage is temporary.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = 'api/src/main/resources/db/migration'
POSTGRES = 'postgres:16.15-bookworm'
FLYWAY = 'redgate/flyway:11.20.0'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='origin/feature/backend')
    parser.add_argument('--output', type=Path, default=ROOT / '.lab2-evidence/v4-verification.json')
    args = parser.parse_args()
    password = secrets.token_hex(24)
    env = dict(os.environ, POSTGRES_PASSWORD=password, FLYWAY_PASSWORD=password)

    def run(command, sql=None):
        result = subprocess.run(command, cwd=ROOT, env=env, input=sql,
                                text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError((result.stdout + result.stderr).replace(password, '[REDACTED]'))
        return result.stdout.strip()

    commit = run(['git', 'rev-parse', '--verify', args.ref + '^{commit}'])
    paths = run(['git', 'ls-tree', '-r', '--name-only', commit, MIGRATIONS]).splitlines()
    assert len(paths) == 4, 'Expected exactly V1–V4; review this verifier for newer migrations'
    token = uuid.uuid4().hex[:10]
    network, container = 'lab2-schema-' + token, 'lab2-schema-db-' + token
    checks = []
    evidence = {'checked_at_utc': datetime.now(timezone.utc).isoformat(),
                'source_ref': args.ref, 'source_commit': commit, 'migration_sha256': {},
                'checks': checks, 'scope': 'isolated PostgreSQL/Flyway; not Kubernetes acceptance'}

    def passed(label):
        checks.append(label)
        print('PASS: ' + label, flush=True)

    def query(database, sql):
        return run(['docker', 'exec', '-i', container, 'psql', '-X', '-At',
                    '-v', 'ON_ERROR_STOP=1', '-U', 'schema_check', '-d', database], sql)

    with tempfile.TemporaryDirectory(prefix='lab2-schema-') as directory:
        for path in paths:
            content = run(['git', 'show', f'{commit}:{path}']) + '\n'
            if Path(path).name.startswith(('V1__', 'V2__', 'V3__')):
                assert content == (ROOT / path).read_text(), f'Existing migration changed: {path}'
            (Path(directory) / Path(path).name).write_text(content)
            evidence['migration_sha256'][Path(path).name] = hashlib.sha256(content.encode()).hexdigest()
        passed('B snapshot preserves existing V1–V3 migration files')
        network_created = container_created = False
        try:
            run(['docker', 'network', 'create', network]); network_created = True
            run(['docker', 'run', '-d', '--pull=never', '--name', container,
                 '--network', network, '--network-alias', 'database',
                 '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=schema_check',
                 '-e', 'POSTGRES_DB=fresh', '--tmpfs', '/var/lib/postgresql/data',
                 '--health-cmd=pg_isready -U schema_check -d fresh',
                 '--health-interval=1s', '--health-timeout=3s', '--health-retries=60', POSTGRES])
            container_created = True
            # Health polling is bounded; Docker commands themselves provide the delay.
            import time
            for _ in range(60):
                state = run(['docker', 'inspect', container, '--format', '{{.State.Health.Status}}'])
                if state == 'healthy':
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Temporary PostgreSQL did not become healthy')
            evidence['postgres_version'] = query('fresh', 'SHOW server_version;')
            evidence['images'] = {image: json.loads(run(['docker', 'image', 'inspect', image,
                '--format', '{{json .RepoDigests}}'])) for image in (POSTGRES, FLYWAY)}

            def migrate(database, *options):
                return run(['docker', 'run', '--rm', '--pull=never', '--platform', 'linux/amd64',
                            '--network', network, '-e', 'FLYWAY_PASSWORD',
                            '-e', 'FLYWAY_USER=schema_check',
                            '-e', f'FLYWAY_URL=jdbc:postgresql://database:5432/{database}',
                            '--mount', f'type=bind,source={directory},target=/flyway/sql,readonly',
                            FLYWAY, *options])

            evidence['fresh_migrate'] = migrate('fresh', 'migrate')
            history_sql = 'SELECT version, checksum, success FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank;'
            history = query('fresh', history_sql)
            assert [line.split('|')[0] for line in history.splitlines()] == ['1', '2', '3', '4']
            assert all(line.endswith('|t') for line in history.splitlines())
            passed('Empty database applies V1–V4 successfully')
            migrate('fresh', 'validate'); migrate('fresh', 'migrate')
            assert query('fresh', history_sql) == history
            passed('Flyway validation and repeated migration preserve history')

            query('fresh', 'CREATE DATABASE upgrade;')
            migrate('upgrade', '-target=3', 'migrate')
            query('upgrade', """INSERT INTO reservations
                (venue_id, booked_by, reservation_date, start_time, end_time, attendee_count, purpose)
                VALUES (1, 'C migration check', '2030-01-01', '10:00', '11:00', 1, 'preserve');""")
            snapshot_sql = "SELECT json_build_object('venues',(SELECT json_agg(v ORDER BY id) FROM venues v),'reservations',(SELECT json_agg(r ORDER BY id) FROM reservations r));"
            before = query('upgrade', snapshot_sql)
            migrate('upgrade', 'migrate')
            assert query('upgrade', snapshot_sql) == before
            assert query('upgrade', 'SELECT (SELECT count(*) FROM report_runs), (SELECT count(*) FROM report_items);') == '0|0'
            passed('V3 → V4 preserves all venue/reservation rows and creates empty report tables')

            constraints = query('fresh', """SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
                FROM pg_constraint WHERE conrelid IN ('report_runs'::regclass,'report_items'::regclass)
                ORDER BY conrelid::regclass::text, conname;""")
            evidence['constraints'] = constraints.splitlines()
            # Dedicated venue has no reservations: deletion failures must come from V4.
            query('fresh', """INSERT INTO venues (name,location,capacity,open_time,close_time)
                VALUES ('report-only venue','check',1,'08:00','22:00');""")
            venue = '(SELECT max(id) FROM venues)'
            values = dict(job_id="'check-report'", source="'MANUAL'", start_date="DATE '2030-01-01'",
                          end_date="DATE '2030-01-01'", status="'RUNNING'", started_at='now()',
                          finished_at='NULL', generated_at='NULL', error_summary='NULL')

            def insert(table, fields):
                return f"INSERT INTO {table} ({','.join(fields)}) VALUES ({','.join(fields.values())});"

            def reject(label, statement, state, constraint=None):
                # Check exact SQLSTATE and constraint name, not merely any SQL error.
                names = (constraint,) if isinstance(constraint, str) else constraint
                expected = (" OR actual_constraint NOT IN (" +
                            ','.join(f"'{name}'" for name in names) + ')') if names else ''
                query('fresh', f"""DO $$ DECLARE actual_state text; actual_constraint text;
                    BEGIN
                      BEGIN
                        {statement}
                      EXCEPTION WHEN OTHERS THEN
                        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE,
                            actual_constraint = CONSTRAINT_NAME;
                        IF actual_state <> '{state}'{expected} THEN RAISE; END IF;
                        RETURN;
                      END;
                      RAISE EXCEPTION 'Expected rejection did not occur';
                    END $$;""")
                passed(label)

            for field in ('job_id','source','start_date','end_date','status','started_at'):
                reject('report_runs NOT NULL: ' + field, insert('report_runs', values | {field:'NULL'}), '23502')
            for value in ("''", "'INVALID_ID'", "'-bad'", "'bad-'", "'bad.id'", "repeat('a',64)"):
                reject('Reject invalid job_id ' + value, insert('report_runs', values | {'job_id':value}),
                       '22001' if '64' in value else '23514', None if '64' in value else 'ck_report_runs_job_id')
            for field, value, name in [('source',"'OTHER'",'source'),
                ('end_date',"DATE '2029-12-31'",'date_range'),('status',"'UNKNOWN'",'status')]:
                # Invalid status violates both CHECKs; PostgreSQL may report either.
                expected = ('ck_report_runs_status', 'ck_report_runs_lifecycle') if field == 'status' else 'ck_report_runs_' + name
                reject('Reject invalid ' + field, insert('report_runs', values | {field:value}),
                       '23514', expected)
            lifecycle = [
                {'finished_at':'now()'}, {'generated_at':'now()'}, {'error_summary':"'bad'"},
                {'status':"'SUCCEEDED'"},
                {'status':"'SUCCEEDED'",'finished_at':'now()'},
                {'status':"'SUCCEEDED'",'generated_at':'now()'},
                {'status':"'SUCCEEDED'",'finished_at':'now()','generated_at':'now()','error_summary':"'bad'"},
                {'status':"'FAILED'"},
                {'status':"'FAILED'",'finished_at':'now()'},
                {'status':"'FAILED'",'finished_at':'now()','error_summary':"''"},
                {'status':"'FAILED'",'finished_at':'now()','error_summary':"'   '"},
                {'status':"'FAILED'",'finished_at':'now()','generated_at':'now()','error_summary':"'bad'"},
            ]
            for index, change in enumerate(lifecycle, 1):
                reject(f'Reject inconsistent lifecycle #{index}', insert('report_runs',values | change),
                       '23514','ck_report_runs_lifecycle')
            for job in ('a', 'a-b', 'a'*63):
                query('fresh', insert('report_runs', values | {'job_id':f"'{job}'"}))
            passed('Accept job_id lengths 1/63 and interior hyphens, equal date range')
            query('fresh', insert('report_runs',values))
            reject('Duplicate report job_id',insert('report_runs',values),'23505','report_runs_pkey')
            for status, change in [('SUCCEEDED',{'finished_at':'now()','generated_at':'now()'}),
                                   ('FAILED',{'finished_at':'now()','error_summary':"'safe summary'"})]:
                query('fresh',insert('report_runs',values | {'job_id':f"'valid-{status.lower()}'",'status':f"'{status}'"} | change))
            passed('Accept valid RUNNING/SUCCEEDED/FAILED lifecycle rows')
            item = dict(job_id="'check-report'",venue_id=venue,venue_name="'snapshot name'",
                        reservation_count='0',reserved_minutes='0')
            for field in item:
                reject('report_items NOT NULL: ' + field,insert('report_items',item | {field:'NULL'}),'23502')
            reject('Missing report parent',insert('report_items',item | {'job_id':"'missing'"}),
                   '23503','fk_report_items_run')
            reject('Missing venue parent',insert('report_items',item | {'venue_id':'-1'}),
                   '23503','fk_report_items_venue')
            for field, name in [('reservation_count','count'),('reserved_minutes','minutes')]:
                reject('Negative ' + field,insert('report_items',item | {field:'-1'}),
                       '23514','ck_report_items_' + name)
            reject('Oversized venue name snapshot',insert('report_items',item | {'venue_name':"repeat('a',101)"}),'22001')
            query('fresh',insert('report_items',item))
            passed('Accept zero count/minutes with valid parent records')
            reject('Duplicate (job_id, venue_id)',insert('report_items',item),'23505','pk_report_items')
            reject('Referenced report deletion protected',"DELETE FROM report_runs WHERE job_id='check-report';",'23503','fk_report_items_run')
            reject('Referenced venue deletion protected',f'DELETE FROM venues WHERE id={venue};','23503','fk_report_items_venue')
            reject('Referenced report key update protected',"UPDATE report_runs SET job_id='changed' WHERE job_id='check-report';",'23503','fk_report_items_run')
            reject('Referenced venue key update protected',f'UPDATE venues SET id=-1 WHERE id={venue};','23503','fk_report_items_venue')
            query('fresh',insert('report_items',item | {'job_id':"'valid-succeeded'",'reservation_count':'2','reserved_minutes':'90'}))
            passed('Different reports may reference the same venue')
            query('fresh',f"UPDATE venues SET name='renamed' WHERE id={venue};")
            assert query('fresh',"SELECT venue_name FROM report_items WHERE job_id='check-report';") == 'snapshot name'
            passed('Venue rename preserves historical venue_name snapshot')
            evidence['status'] = 'PASS'
        finally:
            if container_created:
                run(['docker','rm','-f','-v',container])
            if network_created:
                run(['docker','network','rm',network])
            print('Temporary database and network removed.',flush=True)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    print(f'{len(checks)} checks passed. Evidence: {args.output}',flush=True)


if __name__ == '__main__':
    main()
