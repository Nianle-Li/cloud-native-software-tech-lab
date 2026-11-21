# 手动报告 Job

本页只说明 `venue-booking` 专项验收命名空间的手动 Job。目标集群的记录中，最终展示 `venue-booking-final` 已有成功的手动报告；若资源仍在，查看时不要重新创建 Job，全新部署时按[最终展示说明](../final/README.md)操作。两个命名空间均位于 kind 集群 `venue-lab2`，context 为 `kind-venue-lab2`，但报告 ID 和数据库互不相通。先部署数据库、ConfigMap、Secret 和 API，再创建手动 Job。装载的镜像标签必须与 API Deployment 和 CronJob 一致。Job 复用 API 镜像，数据库凭据从各自命名空间的 Secret 注入；镜像内容变更时使用新标签。

```sh
python3 scripts/create-report-job.py YYYY-MM-DD YYYY-MM-DD --context kind-venue-lab2 --namespace venue-booking --image venue-booking-api:lab2-20261113
```

将两个日期占位值替换为本命名空间实际有预约数据的起止日期，并先确认同标签 API 镜像已装载到 kind 节点。脚本输出 `job_id`。查询 `kubectl --context kind-venue-lab2 -n venue-booking get job <job_id>` 和 `kubectl --context kind-venue-lab2 -n venue-booking logs job/<job_id>`；前端就绪后在 `#/reports` 输入同一个 ID 查看持久化结果。`--dry-run` 只打印可检查的 Job 清单；个人开发集群可另传 `--context` 和 `--namespace`。

重试相同 ID 时，保留数据库记录，删除原 Job 对象后用 `--name <job_id>` 重建，日期与来源必须一致。此操作会删除原 Job 的 Pod，需先保存日志证据；**不要删除数据库记录或 PVC**。旧 Job 仍存在时，同名 Job 无法重新创建。
