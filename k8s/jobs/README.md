# 手动报告 Job

先由 C 部署数据库、ConfigMap 和 Secret，再部署 B 的 API 并确认两副本就绪。构建并装载与 `k8s/base/api-deployment.yaml` 相同标签的 API 镜像；Job 复用该镜像，不含数据库凭据。

```sh
python3 scripts/create-report-job.py 2026-11-01 2026-11-06 --image venue-booking-api:lab2-20261113
```

脚本输出 `job_id`。查询 `kubectl -n venue-booking get job <job_id>` 和 `kubectl -n venue-booking logs job/<job_id>`；前端就绪后在 `#/reports` 输入同一个 ID 查看持久化结果。`--dry-run` 只打印可检查的 Job 清单；集群命名空间和镜像标签若不同，可传入 `--namespace` 与 `--image`。

重试相同 ID 时，保留数据库记录，删除原 Job 对象后用 `--name <job_id>` 重建，日期与来源必须一致。此操作会删除原 Job 的 Pod，需先保存日志证据；**不要删除数据库记录或 PVC**。旧 Job 仍存在时，同名 Job 无法重新创建。
