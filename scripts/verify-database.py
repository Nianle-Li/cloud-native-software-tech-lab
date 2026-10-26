#!/usr/bin/env python3
"""Verify the real PostgreSQL/Flyway setup without the unfinished API.

Requires Python 3 and a running Docker engine. Uses an isolated Compose project,
starts only database, and runs Flyway as a disposable tool container. Containers
are stopped afterwards; the verification named volume is retained for inspection.
"""

import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
FLYWAY_IMAGE = 'redgate/flyway:11.20.0'
# This CLI image has no arm64 manifest; Docker Desktop can emulate amd64.
FLYWAY_PLATFORM = 'linux/amd64'


def main():
    project = f'lab1-db-check-{uuid.uuid4().hex[:8]}'
    env = dict(os.environ)
    for key in ('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'FRONTEND_PORT'):
        env.pop(key, None)
    password = secrets.token_hex(24)
    env['FLYWAY_PASSWORD'] = password

    def run(args, sql=None):
        result = subprocess.run(args, cwd=ROOT, env=env, input=sql,
                                text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError((result.stdout + result.stderr).replace(password, '[REDACTED]'))
        return result.stdout.strip()

    with tempfile.TemporaryDirectory(prefix='lab1-db-check-') as directory:
        env_file = Path(directory) / 'verification.env'
        env_file.write_text(f'POSTGRES_DB=booking_check\nPOSTGRES_USER=booking_check\n'
                            f'POSTGRES_PASSWORD={password}\nFRONTEND_PORT=8080\n')
        env_file.chmod(0o600)
        compose = ['docker', 'compose', '-f', str(ROOT / 'compose.yaml'),
                   '--project-name', project, '--env-file', str(env_file)]
        flyway = ['docker', 'run', '--rm', '--platform', FLYWAY_PLATFORM,
                  '--network', f'{project}_default',
                  '-e', 'FLYWAY_URL=jdbc:postgresql://database:5432/booking_check',
                  '-e', 'FLYWAY_USER=booking_check', '-e', 'FLYWAY_PASSWORD',
                  '--mount', f'type=bind,source={ROOT / "api/src/main/resources/db/migration"},target=/flyway/sql,readonly',
                  FLYWAY_IMAGE]

        def query(sql):
            return run(compose + ['exec', '-T', 'database', 'psql', '-X', '-v',
                                  'ON_ERROR_STOP=1', '-U', 'booking_check', '-d',
                                  'booking_check', '-At'], sql)

        try:
            run(compose + ['config', '--quiet'])
            print(f'Verification project: {project}', flush=True)
            run(compose + ['up', '-d', '--wait', '--wait-timeout', '120', 'database'])
            state = json.loads(run(['docker', 'inspect', run(compose + ['ps', '-q', 'database'])]))[0]
            assert state['State']['Health']['Status'] == 'healthy'
            assert not state['HostConfig']['PortBindings']
            print('PASS: database is healthy; no host port is published.', flush=True)
            print('PostgreSQL: ' + query('SHOW server_version;'), flush=True)
            print('Pulling temporary Flyway CLI image (linux/amd64).', flush=True)
            run(['docker', 'pull', '--platform', FLYWAY_PLATFORM, FLYWAY_IMAGE])
            for image in ('postgres:16.15-bookworm', FLYWAY_IMAGE):
                print('Image: ' + image + ' ' + run(['docker', 'image', 'inspect', image,
                                                   '--format', '{{json .RepoDigests}}']), flush=True)

            print(run(flyway + ['migrate']), flush=True)
            history_sql = 'SELECT version, description, checksum, success FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank;'
            history = query(history_sql)
            assert len(history.splitlines()) == 2
            assert history.splitlines()[0].startswith('1|') and history.splitlines()[1].startswith('2|')
            assert all(line.endswith('|t') for line in history.splitlines())
            assert query("SELECT count(*), count(*) FILTER (WHERE status = 'OPEN'), count(*) FILTER (WHERE status = 'CLOSED') FROM venues;") == '3|2|1'
            assert query('SELECT count(*) FROM reservations;') == '0'
            assert query("SELECT count(*) FROM pg_indexes WHERE tablename = 'reservations' AND indexname = 'idx_reservations_conflict';") == '1'
            print('PASS: migrations V1/V2 applied; three seed venues, no reservations, conflict index exists.', flush=True)
            print(run(flyway + ['validate']), flush=True)
            print(run(flyway + ['migrate']), flush=True)
            assert query(history_sql) == history
            assert query('SELECT count(*) FROM venues;') == '3'
            print('PASS: validate and second migrate succeed; migration history and seed count unchanged.', flush=True)

            cases = []
            venue = "INSERT INTO venues (name, location, capacity, open_time, close_time) VALUES ({name}, {location}, {capacity}, {start}, {end});"
            valid_venue = dict(name="'验证场地'", location="'验证位置'", capacity='8', start="TIME '08:00'", end="TIME '22:00'")
            for label, changes, error in [
                ('null venue name', {'name': 'NULL'}, 'not_null_violation'),
                ('blank venue name', {'name': "E' \\t\\n'"}, 'check_violation'),
                ('blank location', {'location': "E'\\t'"}, 'check_violation'),
                ('long venue name', {'name': "repeat('名', 101)"}, 'string_data_right_truncation'),
                ('long location', {'location': "repeat('地', 201)"}, 'string_data_right_truncation'),
                ('zero capacity', {'capacity': '0'}, 'check_violation'),
                ('reversed opening hours', {'start': "TIME '23:00'"}, 'check_violation'),
                ('equal opening hours', {'end': "TIME '08:00'"}, 'check_violation'),
            ]:
                cases.append((label, venue.format(**(valid_venue | changes)), error))
            cases.append(('invalid venue status', "UPDATE venues SET status = 'INVALID' WHERE id = (SELECT min(id) FROM venues);", 'check_violation'))
            reservation = "INSERT INTO reservations (venue_id, booked_by, reservation_date, start_time, end_time, attendee_count, purpose, status, cancelled_at) VALUES ({venue_id}, {booked_by}, DATE '2030-01-01', {start}, {end}, {count}, {purpose}, {status}, {cancelled});"
            valid_reservation = dict(venue_id='(SELECT min(id) FROM venues)', booked_by="'验证小组'", start="TIME '10:00'", end="TIME '11:00'", count='2', purpose="'验证用途'", status="'ACTIVE'", cancelled='NULL')
            for label, changes, error in [
                ('missing venue', {'venue_id': '-1'}, 'foreign_key_violation'),
                ('null venue', {'venue_id': 'NULL'}, 'not_null_violation'),
                ('blank booked_by', {'booked_by': "E' \\t'"}, 'check_violation'),
                ('blank purpose', {'purpose': "E'\\n'"}, 'check_violation'),
                ('long booked_by', {'booked_by': "repeat('人', 101)"}, 'string_data_right_truncation'),
                ('long purpose', {'purpose': "repeat('用', 501)"}, 'string_data_right_truncation'),
                ('zero attendees', {'count': '0'}, 'check_violation'),
                ('reversed reservation hours', {'start': "TIME '12:00'"}, 'check_violation'),
                ('equal reservation hours', {'end': "TIME '10:00'"}, 'check_violation'),
                ('invalid reservation status', {'status': "'INVALID'"}, 'check_violation'),
                ('active with cancellation timestamp', {'cancelled': 'CURRENT_TIMESTAMP'}, 'check_violation'),
                ('cancelled without timestamp', {'status': "'CANCELLED'"}, 'check_violation'),
            ]:
                cases.append((label, reservation.format(**(valid_reservation | changes)), error))

            sql = ['BEGIN;']
            for label, statement, error in cases:
                sql.append(f"DO $$ BEGIN BEGIN {statement} RAISE EXCEPTION 'Expected rejection: {label}'; EXCEPTION WHEN {error} THEN NULL; END; END $$;")
            # Valid inserts and logical cancellation use defaults and generated IDs.
            sql.append("""DO $$
DECLARE v BIGINT; r BIGINT;
BEGIN
    INSERT INTO venues (name, location, capacity, open_time, close_time)
    VALUES (repeat('名', 100), repeat('地', 200), 8, '08:00', '22:00') RETURNING id INTO v;
    IF v <= (SELECT max(id) FROM venues WHERE id <> v) OR
       (SELECT status FROM venues WHERE id = v) <> 'OPEN' THEN
        RAISE EXCEPTION 'Identity or default venue status failed';
    END IF;
    INSERT INTO reservations (venue_id, booked_by, reservation_date, start_time, end_time, attendee_count, purpose)
    VALUES (v, repeat('人', 100), '2030-01-01', '10:00', '11:00', 8, repeat('用', 500)) RETURNING id INTO r;
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = r AND status = 'ACTIVE' AND created_at IS NOT NULL AND cancelled_at IS NULL) THEN
        RAISE EXCEPTION 'Reservation defaults failed';
    END IF;
    BEGIN
        DELETE FROM venues WHERE id = v;
        RAISE EXCEPTION 'Referenced venue deletion must fail';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    UPDATE reservations SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP WHERE id = r;
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = r AND status = 'CANCELLED' AND cancelled_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Logical cancellation failed';
    END IF;
END $$;""")
            sql.append('ROLLBACK;')
            query('\n'.join(sql))
            assert query('SELECT count(*) FROM venues;') == '3'
            assert query('SELECT count(*) FROM reservations;') == '0'
            print(f'PASS: {len(cases)} invalid writes rejected with expected SQLSTATE categories.', flush=True)
            print('PASS: boundary text lengths, generated IDs, defaults, valid reservation, logical cancellation and foreign-key deletion protection.', flush=True)
            print('PASS: test writes rolled back; seed data retained. Identity sequences may have advanced.', flush=True)
        finally:
            # Keep the named volume; do not use down -v, including on failure.
            run(compose + ['down'])
            print(f'Containers stopped. Retained verification volume: {project}_postgres_data', flush=True)


if __name__ == '__main__':
    main()
