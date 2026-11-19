# 手动报告 Job

本页说明原有 `venue-booking` 命名空间的手动 Job；最终展示使用独立的 `venue-booking-final`，请按[最终展示部署说明](../final/README.md)创建 Job，避免写入原有验收数据。两个命名空间均使用 kind 集群 `venue-lab2` 和 context `kind-venue-lab2`。先部署数据库、ConfigMap、Secret 和 API，再创建手动 Job。装载的镜像标签必须与 `k8s/base/api-deployment.yaml` 和 CronJob 一致。Job 复用 API 镜像，不含数据库凭据；镜像内容变更时使用新标签。

```sh
kind load docker-image venue-booking-api:lab2-20261113 --name venue-lab2
python3 scripts/create-report-job.py 2026-11-01 2026-11-06 --context kind-venue-lab2 --namespace venue-booking --image venue-booking-api:lab2-20261113
```

上例日期仅演示参数格式，执行时应改为实际有预约数据的日期范围。脚本输出 `job_id`。查询 `kubectl --context kind-venue-lab2 -n venue-booking get job <job_id>` 和 `kubectl --context kind-venue-lab2 -n venue-booking logs job/<job_id>`；前端就绪后在 `#/reports` 输入同一个 ID 查看持久化结果。`--dry-run` 只打印可检查的 Job 清单；个人开发集群可另传 `--context` 和 `--namespace`。

重试相同 ID 时，保留数据库记录，删除原 Job 对象后用 `--name <job_id>` 重建，日期与来源必须一致。此操作会删除原 Job 的 Pod，需先保存日志证据；**不要删除数据库记录或 PVC**。旧 Job 仍存在时，同名 Job 无法重新创建。
