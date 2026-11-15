# 手动报告 Job

本组共同验收使用 kind 集群 `venue-lab2`、context `kind-venue-lab2`、命名空间 `venue-booking`。C 先部署数据库、ConfigMap 和 Secret，并在承载 kind 的 Docker 环境构建或接收 API 镜像、装载到命名集群；B 再部署 API 并确认两副本就绪，最后创建手动 Job。装载的镜像标签必须与 `k8s/base/api-deployment.yaml` 和 A 的 CronJob 完全一致。Job 复用该镜像，不含数据库凭据。每次镜像内容变更使用新标签。

```sh
kind load docker-image venue-booking-api:lab2-20261113 --name venue-lab2
python3 scripts/create-report-job.py 2026-11-01 2026-11-06 --image venue-booking-api:lab2-20261113
```

脚本默认显式使用 `--context kind-venue-lab2`，输出 `job_id`。查询 `kubectl --context kind-venue-lab2 -n venue-booking get job <job_id>` 和 `kubectl --context kind-venue-lab2 -n venue-booking logs job/<job_id>`；前端就绪后在 `#/reports` 输入同一个 ID 查看持久化结果。`--dry-run` 只打印可检查的 Job 清单；个人开发集群可另传 `--context` 和 `--namespace`，但共同验收只认 `kind-venue-lab2`。

重试相同 ID 时，保留数据库记录，删除原 Job 对象后用 `--name <job_id>` 重建，日期与来源必须一致。此操作会删除原 Job 的 Pod，需先保存日志证据；**不要删除数据库记录或 PVC**。旧 Job 仍存在时，同名 Job 无法重新创建。
