#!/bin/sh
set -eu

script=/work/node-check/check.sh
mkdir -p /tmp/node-check-test-bin
cat > /tmp/node-check-test-bin/nslookup <<'EOF'
#!/bin/sh
printf 'mock lookup: %s\n' "$1"
printf '%s\n' "$1" >> /tmp/node-check-test-queries
[ "$MOCK_DNS_RESULT" = ok ]
EOF
chmod +x /tmp/node-check-test-bin/nslookup
PATH="/tmp/node-check-test-bin:$PATH"
export PATH

NODE_NAME=venue-lab2-worker
HOST_IP=10.0.0.2
MOCK_DNS_RESULT=ok
export NODE_NAME HOST_IP MOCK_DNS_RESULT
success=$(sh "$script" --once)
printf '%s\n' "$success" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z node=venue-lab2-worker host_ip=10\.0\.0\.2 dns=ok target=kubernetes\.default\.svc$'
printf '%s\n' "$success" | grep -q 'mock lookup: kubernetes.default.svc'
[ "$(wc -l < /tmp/node-check-test-queries)" -eq 1 ]

MOCK_DNS_RESULT=fail
export MOCK_DNS_RESULT
if sh "$script" --once > /tmp/node-check-test-failure; then
  echo 'failed DNS lookup must return nonzero in --once mode' >&2
  exit 1
fi
grep -q 'dns=failed target=kubernetes.default.svc' /tmp/node-check-test-failure
[ "$(wc -l < /tmp/node-check-test-queries)" -eq 2 ]

unset NODE_NAME
if sh "$script" --once > /dev/null 2>&1; then
  echo 'missing NODE_NAME must fail' >&2
  exit 1
fi
echo 'PASS: node identity, DNS success/failure, one-shot exit codes and missing identity'
