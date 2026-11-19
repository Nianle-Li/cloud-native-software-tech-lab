export VENUE_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["venue_id"])' "$EVIDENCE/business-ids.json")"
export RESERVATION_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["reservation_id"])' "$EVIDENCE/business-ids.json")"
export JOB_ID="$(sed -n 's/^job_id=\([^ ]*\).*/\1/p' "$EVIDENCE/report-result.txt")"
(
  set -e -o pipefail
  test -n "$VENUE_ID" && test -n "$RESERVATION_ID" && test -n "$JOB_ID"
  kubectl --context kind-venue-lab2 -n venue-booking port-forward service/api 18083:8080 > "$EVIDENCE/persistence-port-forward.txt" 2>&1 &
  PF_PERSIST=$!
  trap 'kill "$PF_PERSIST" 2>/dev/null || true' EXIT
  READY=0
  for attempt in {1..60}; do
    if curl --noproxy '*' --fail --silent "http://127.0.0.1:18083/api/venues/$VENUE_ID" > /dev/null; then READY=1; break; fi
    sleep 1
  done
  test "$READY" -eq 1
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18083/api/venues/$VENUE_ID" > "$EVIDENCE/venue-before.json"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18083/api/reservations/$RESERVATION_ID" > "$EVIDENCE/reservation-before.json"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18083/api/reports/$JOB_ID" > "$EVIDENCE/report-persistence-before.json"
  kubectl --context kind-venue-lab2 -n venue-booking get pod database-0 -o json > "$EVIDENCE/database-pod-before.json"
  kubectl --context kind-venue-lab2 -n venue-booking get pvc postgres-data-database-0 -o json > "$EVIDENCE/database-pvc-before.json"
  kubectl --context kind-venue-lab2 -n venue-booking delete pod database-0 --wait=true | tee "$EVIDENCE/database-pod-delete.txt"
  kubectl --context kind-venue-lab2 -n venue-booking rollout status statefulset/database --timeout=180s | tee "$EVIDENCE/database-rollout.txt"
  kubectl --context kind-venue-lab2 -n venue-booking get pod database-0 -o json > "$EVIDENCE/database-pod-after.json"
  kubectl --context kind-venue-lab2 -n venue-booking get pvc postgres-data-database-0 -o json > "$EVIDENCE/database-pvc-after.json"
  READY=0
  for attempt in {1..60}; do
    if curl --noproxy '*' --fail --silent "http://127.0.0.1:18083/api/venues/$VENUE_ID" > /dev/null; then READY=1; break; fi
    sleep 1
  done
  test "$READY" -eq 1
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18083/api/venues/$VENUE_ID" > "$EVIDENCE/venue-after.json"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18083/api/reservations/$RESERVATION_ID" > "$EVIDENCE/reservation-after.json"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18083/api/reports/$JOB_ID" > "$EVIDENCE/report-persistence-after.json"
  cmp "$EVIDENCE/venue-before.json" "$EVIDENCE/venue-after.json"
  cmp "$EVIDENCE/reservation-before.json" "$EVIDENCE/reservation-after.json"
  cmp "$EVIDENCE/report-persistence-before.json" "$EVIDENCE/report-persistence-after.json"
  python3 - "$EVIDENCE" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
before_pod = json.loads((root / 'database-pod-before.json').read_text())
after_pod = json.loads((root / 'database-pod-after.json').read_text())
before_pvc = json.loads((root / 'database-pvc-before.json').read_text())
after_pvc = json.loads((root / 'database-pvc-after.json').read_text())
assert before_pod['metadata']['uid'] != after_pod['metadata']['uid']
assert before_pvc['metadata']['uid'] == after_pvc['metadata']['uid']
assert after_pvc['status']['phase'] == 'Bound'
print('database_pod_uid_changed=yes pvc_uid_unchanged=yes business_responses_unchanged=yes')
PY
)
