(
  set -e -o pipefail
  date '+%Y-%m-%dT%H:%M:%S%z' | tee "$EVIDENCE/time.txt"
  hostname | tee "$EVIDENCE/host.txt"
  git rev-parse HEAD | tee "$EVIDENCE/source-commit.txt"
  git diff --exit-code 35e1809 HEAD -- api/ k8s/base/api-deployment.yaml k8s/base/api-service.yaml k8s/jobs/ scripts/create-report-job.py > "$EVIDENCE/api-source-diff.txt"
  kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/api --timeout=180s | tee "$EVIDENCE/api-rollout.txt"
  kubectl --context kind-venue-lab2 -n venue-booking get pods -l app.kubernetes.io/component=api -o wide | tee "$EVIDENCE/api-pods.txt"
  kubectl --context kind-venue-lab2 -n venue-booking get pod database-0 -o wide | tee "$EVIDENCE/database.txt"
  kubectl --context kind-venue-lab2 -n venue-booking get pvc | tee "$EVIDENCE/pvc.txt"
)
