#!/usr/bin/env python3
"""Check database DNS/authentication and optionally restart its StatefulSet Pod.

Creates a temporary client Pod on the other worker and a uniquely named probe
schema. Removes only that client and probe schema; never deletes PVCs or Secrets.
Does not apply Flyway migrations or create/modify business records.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', default='kind-venue-lab2')
    parser.add_argument('--namespace', default='venue-booking')
    parser.add_argument('--restart-database', action='store_true',
                        help='Delete database-0 once, wait for recovery and verify retained data')
    parser.add_argument('--output', type=Path,
                        default=ROOT / '.lab2-evidence/database-infrastructure.json')
    args = parser.parse_args()
    base = ['kubectl', '--context', args.context]
    scoped = base + ['-n', args.namespace]
    token = uuid.uuid4().hex[:12]
    client, schema = 'database-check-' + token, 'c_infrastructure_' + token
    evidence = {'checked_at_utc': datetime.now(timezone.utc).isoformat(),
                'context': args.context, 'namespace': args.namespace,
                'source_commit': None, 'checks': [], 'restart_requested': args.restart_database,
                'scope': 'Database infrastructure only; business/Flyway/API acceptance pending'}

    def run(command, stdin=None):
        result = subprocess.run(command, input=stdin, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout.strip()

    def obj(kind, name):
        return json.loads(run(scoped + ['get', kind, name, '-o', 'json']))

    def passed(label):
        evidence['checks'].append(label)
        print('PASS: ' + label, flush=True)

    def query(sql, host='database'):
        # Credentials already come from Secret refs inside the client Pod.
        return run(scoped + ['exec', '-i', client, '--', 'psql', '-X', '-w', '-At',
                             '-v', 'ON_ERROR_STOP=1', '-h', host], sql)

    evidence['source_commit'] = run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
    evidence['config_files'] = {
        str(p.relative_to(ROOT)): p.read_text() for p in [
            ROOT / 'k8s/base/namespace.yaml', ROOT / 'k8s/base/configmap.yaml',
            ROOT / 'k8s/base/database-services.yaml', ROOT / 'k8s/base/database-statefulset.yaml']}
    before = obj('pod', 'database-0')
    assert any(c['type'] == 'Ready' and c['status'] == 'True' for c in before['status']['conditions'])
    assert before['spec']['automountServiceAccountToken'] is False
    nodes = json.loads(run(base + ['get', 'nodes', '-o', 'json']))['items']
    other = next(n['metadata']['name'] for n in nodes
                 if 'node-role.kubernetes.io/control-plane' not in n['metadata']['labels']
                 and n['metadata']['name'] != before['spec']['nodeName'])
    claim = next(v['persistentVolumeClaim']['claimName'] for v in before['spec']['volumes']
                 if 'persistentVolumeClaim' in v)
    pvc_before = obj('pvc', claim)
    assert pvc_before['status']['phase'] == 'Bound'
    evidence['pod_before'] = before
    evidence['pvc_before'] = pvc_before
    evidence['pv'] = json.loads(run(base + ['get', 'pv', pvc_before['spec']['volumeName'], '-o', 'json']))
    # Only request Secret metadata, never its data/stringData.
    secret_meta = scoped + ['get', 'secret', 'venue-db-credentials', '-o',
                            'jsonpath={.metadata.uid}/{.metadata.resourceVersion}']
    evidence['secret_metadata_before'] = run(secret_meta)
    client_spec = {
        'apiVersion': 'v1', 'kind': 'Pod',
        'metadata': {'name': client, 'namespace': args.namespace,
                     'labels': {'app.kubernetes.io/name': 'venue-booking',
                                'app.kubernetes.io/component': 'database-check'}},
        'spec': {'automountServiceAccountToken': False, 'restartPolicy': 'Never',
                 'nodeSelector': {'kubernetes.io/hostname': other},
                 'containers': [{'name': 'client', 'image': before['spec']['containers'][0]['image'],
                     'imagePullPolicy': 'IfNotPresent', 'command': ['sleep', '600'],
                     'resources': {'requests': {'cpu': '10m', 'memory': '32Mi'},
                                   'limits': {'cpu': '100m', 'memory': '128Mi'}},
                     'env': [
                         {'name': 'PGDATABASE', 'valueFrom': {'configMapKeyRef': {
                             'name': 'venue-config', 'key': 'POSTGRES_DB'}}},
                         {'name': 'PGUSER', 'valueFrom': {'secretKeyRef': {
                             'name': 'venue-db-credentials', 'key': 'POSTGRES_USER'}}},
                         {'name': 'PGPASSWORD', 'valueFrom': {'secretKeyRef': {
                             'name': 'venue-db-credentials', 'key': 'POSTGRES_PASSWORD'}}},
                         {'name': 'PGCONNECT_TIMEOUT', 'value': '10'}]}]}}
    client_created = schema_created = False
    try:
        print(run(scoped + ['create', '-f', '-'], json.dumps(client_spec)), flush=True)
        client_created = True
        run(scoped + ['wait', '--for=condition=Ready', 'pod/' + client, '--timeout=60s'])
        evidence['client_node'] = other
        evidence['dns'] = run(scoped + ['exec', client, '--', 'getent', 'hosts',
            'database', 'database-headless',
            'database-0.database-headless.' + args.namespace + '.svc.cluster.local'])
        evidence['connection'] = json.loads(query("SELECT json_build_object('database',current_database(),'version',current_setting('server_version'),'data_directory',current_setting('data_directory'),'server_address',inet_server_addr());"))
        passed('Authenticated PostgreSQL via database Service from the other worker')
        assert query('SELECT 1;', 'database-headless') == '1'
        passed('Headless Service and stable database Pod DNS resolve and accept connections')
        passed('PVC is Bound and database Pod disables ServiceAccount token automount')
        evidence['business_tables_before'] = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
        query(f'CREATE SCHEMA {schema};')
        schema_created = True
        query(f"CREATE TABLE {schema}.proof (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO {schema}.proof VALUES (1, '{token}');")
        assert query(f'SELECT value FROM {schema}.proof WHERE id=1;') == token
        passed('Unique infrastructure probe row written through Service')
        if args.restart_database:
            print(run(scoped + ['delete', 'pod', 'database-0', '--wait=true', '--timeout=60s']), flush=True)
            run(scoped + ['rollout', 'status', 'statefulset/database', '--timeout=120s'])
            after = obj('pod', 'database-0')
            pvc_after = obj('pvc', claim)
            assert before['metadata']['uid'] != after['metadata']['uid']
            assert pvc_before['metadata']['uid'] == pvc_after['metadata']['uid']
            assert pvc_before['spec']['volumeName'] == pvc_after['spec']['volumeName']
            assert pvc_after['status']['phase'] == 'Bound'
            assert query(f'SELECT value FROM {schema}.proof WHERE id=1;') == token
            evidence['pod_after'], evidence['pvc_after'] = after, pvc_after
            passed('StatefulSet recreates database-0 with a new Pod UID and same PVC/PV')
            passed('Probe row survives PostgreSQL Pod recreation and is readable via Service')
        assert evidence['business_tables_before'] == query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
        assert evidence['secret_metadata_before'] == run(secret_meta)
        passed('Public business table list and Secret resourceVersion unchanged')
        evidence['services'] = json.loads(run(scoped + ['get', 'svc', 'database', 'database-headless', '-o', 'json']))
        evidence['endpointslices'] = json.loads(run(scoped + ['get', 'endpointslice', '-l',
            'kubernetes.io/service-name=database', '-o', 'json']))
        for service in evidence['services']['items']:
            assert service['spec']['type'] == 'ClusterIP'
        passed('Both database Services are internal ClusterIP Services')
    finally:
        # Probe SQL is deliberately outside Flyway/public business schemas.
        try:
            if schema_created:
                query(f'DROP SCHEMA {schema} CASCADE;')
                assert query(f"SELECT count(*) FROM pg_namespace WHERE nspname='{schema}';") == '0'
                evidence['probe_schema_removed'] = True
        finally:
            if client_created:
                print(run(scoped + ['delete', 'pod', client, '--wait=true', '--timeout=60s']), flush=True)
                evidence['client_removed'] = True
    evidence['status'] = 'PASS'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    print(f"{len(evidence['checks'])} checks passed. Evidence: {args.output}", flush=True)


if __name__ == '__main__':
    main()
