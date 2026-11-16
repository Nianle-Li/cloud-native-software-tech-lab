#!/bin/sh
set -eu

: "${NODE_NAME:?NODE_NAME is required}"
: "${HOST_IP:?HOST_IP is required}"

check_dns() {
  checked_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  if lookup_output=$(nslookup kubernetes.default.svc 2>&1); then
    printf '%s node=%s host_ip=%s dns=ok target=kubernetes.default.svc\n' "$checked_at" "$NODE_NAME" "$HOST_IP"
    printf '%s\n' "$lookup_output"
  else
    printf '%s node=%s host_ip=%s dns=failed target=kubernetes.default.svc\n' "$checked_at" "$NODE_NAME" "$HOST_IP"
    printf '%s\n' "$lookup_output"
    return 1
  fi
}

case "${1:-}" in
  --once) check_dns ;;
  '') while :; do check_dns || :; sleep 30; done ;;
  *) echo 'usage: check.sh [--once]' >&2; exit 2 ;;
esac
