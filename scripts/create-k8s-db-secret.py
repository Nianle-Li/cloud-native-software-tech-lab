#!/usr/bin/env python3
"""Create initial database credentials in Kubernetes without printing/saving them.

Existing Secret is kept unchanged. This is not a password rotation tool.
"""

import argparse
import json
import secrets
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', default='kind-venue-lab2')
    parser.add_argument('--namespace', default='venue-booking')
    args = parser.parse_args()
    base = ['kubectl', '--context', args.context, '-n', args.namespace]
    existing = subprocess.run(base + ['get', 'secret', 'venue-db-credentials',
                                      '--ignore-not-found', '-o', 'name'],
                              text=True, capture_output=True)
    if existing.returncode:
        sys.exit('Cannot check Secret; verify context, namespace and permissions.')
    if existing.stdout.strip():
        print('venue-db-credentials already exists; credentials kept unchanged.')
        return
    claim = subprocess.run(base + ['get', 'pvc', 'postgres-data-database-0',
                                   '--ignore-not-found', '-o', 'name'],
                           text=True, capture_output=True)
    if claim.returncode:
        sys.exit('Cannot check existing database PVC; no credentials were created.')
    if claim.stdout.strip():
        sys.exit('Database PVC exists but Secret is missing; restore the original credentials instead of generating new ones.')
    # Database initialization accepts these once; subsequent runs retain the Secret.
    secret = {'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
              'metadata': {'name': 'venue-db-credentials', 'namespace': args.namespace,
                           'labels': {'app.kubernetes.io/name': 'venue-booking',
                                      'app.kubernetes.io/component': 'database'}},
              'stringData': {'POSTGRES_USER': 'venue_booking',
                             'POSTGRES_PASSWORD': secrets.token_urlsafe(32)}}
    result = subprocess.run(base + ['create', '-f', '-', '-o', 'name'],
                            input=json.dumps(secret), text=True, capture_output=True)
    if result.returncode:
        # Do not echo raw API errors that might contain the submitted Secret.
        sys.exit('Secret creation failed; no existing credentials were overwritten.')
    print('venue-db-credentials created; password is stored only in Kubernetes Secret.')


if __name__ == '__main__':
    main()
