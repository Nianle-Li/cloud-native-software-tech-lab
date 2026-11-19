(
  set -e -o pipefail
  kubectl --context kind-venue-lab2 -n venue-booking port-forward service/api 18080:8080 > "$EVIDENCE/report-port-forward.txt" 2>&1 &
  PF_REPORT=$!
  trap 'kill "$PF_REPORT" 2>/dev/null || true' EXIT
  python3 scripts/create-report-job.py 2026-11-16 2026-11-16 --image venue-booking-api:lab2-20261113 | tee "$EVIDENCE/report-create.txt"
  JOB_ID="$(sed -n 's/^job_id=//p' "$EVIDENCE/report-create.txt")"
  test -n "$JOB_ID"
  kubectl --context kind-venue-lab2 -n venue-booking wait --for=condition=complete "job/$JOB_ID" --timeout=180s | tee "$EVIDENCE/report-first-wait.txt"
  kubectl --context kind-venue-lab2 -n venue-booking get job "$JOB_ID" -o json > "$EVIDENCE/report-first-job.json"
  kubectl --context kind-venue-lab2 -n venue-booking get pods -l "batch.kubernetes.io/job-name=$JOB_ID" -o json > "$EVIDENCE/report-first-pods.json"
  kubectl --context kind-venue-lab2 -n venue-booking logs "job/$JOB_ID" > "$EVIDENCE/report-first.txt"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18080/api/reports/$JOB_ID" > "$EVIDENCE/report-before.json"
  kubectl --context kind-venue-lab2 -n venue-booking delete job "$JOB_ID" --cascade=foreground --wait=true | tee "$EVIDENCE/report-delete.txt"
  test -z "$(kubectl --context kind-venue-lab2 -n venue-booking get pods -l "batch.kubernetes.io/job-name=$JOB_ID" -o name)"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18080/api/reports/$JOB_ID" > "$EVIDENCE/report-after-pod-delete.json"
  cmp "$EVIDENCE/report-before.json" "$EVIDENCE/report-after-pod-delete.json"
  python3 scripts/create-report-job.py 2026-11-16 2026-11-16 --image venue-booking-api:lab2-20261113 --name "$JOB_ID" | tee "$EVIDENCE/report-recreate.txt"
  kubectl --context kind-venue-lab2 -n venue-booking wait --for=condition=complete "job/$JOB_ID" --timeout=180s | tee "$EVIDENCE/report-retry-wait.txt"
  kubectl --context kind-venue-lab2 -n venue-booking get job "$JOB_ID" -o json > "$EVIDENCE/report-retry-job.json"
  kubectl --context kind-venue-lab2 -n venue-booking get pods -l "batch.kubernetes.io/job-name=$JOB_ID" -o json > "$EVIDENCE/report-retry-pods.json"
  kubectl --context kind-venue-lab2 -n venue-booking logs "job/$JOB_ID" > "$EVIDENCE/report-retry.txt"
  curl --noproxy '*' --fail --silent --show-error "http://127.0.0.1:18080/api/reports/$JOB_ID" > "$EVIDENCE/report-after-retry.json"
  cmp "$EVIDENCE/report-before.json" "$EVIDENCE/report-after-retry.json"
  printf 'job_id=%s snapshot_unchanged=yes\n' "$JOB_ID" | tee "$EVIDENCE/report-result.txt"
)
