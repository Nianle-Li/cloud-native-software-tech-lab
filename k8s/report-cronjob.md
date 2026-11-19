# 定时报告 CronJob

正式清单为 [`base/report-cronjob.yaml`](base/report-cronjob.yaml)：北京时间
每日 00:10 统计前一自然日。演示清单为
[`demo/report-cronjob.yaml`](demo/report-cronjob.yaml)：每 2 分钟统计当天。
两份清单使用同一个 `venue-report-daily` CronJob；演示结束后必须恢复正式
清单。静态测试比较两份清单，要求它们仅在 `schedule` 与
`REPORT_WINDOW_MODE` 上不同。测试需要 PyYAML；若当前 Python 环境尚未安装，
先运行 `python3 -m pip install PyYAML`，再执行：

```sh
python3 scripts/test_lab2_cronjob.py
```

短周期演示应核对至少两次自动创建的 Job、来源和统计结果，再恢复正式每日
配置。最终展示命名空间的操作见[最终展示环境说明](final/README.md)，
实际结果见[Lab 2 报告](../docs/lab2-report.md)。

CronJob 与 API Deployment、手动 Job 使用相同 API 镜像，当前标签为
`venue-booking-api:lab2-20261113`。B 更换 API 镜像后，先对齐三处标签并在
共同 kind 集群装载，随后运行上述测试；不得让定时任务使用旧版报告程序。
每个定时 Job 从 Kubernetes Job 名称取得 `REPORT_JOB_ID`，来源固定为
`SCHEDULED`，不传手动日期参数。容器仅追加报告模式参数，复用 API 镜像
的 Java ENTRYPOINT。数据库账号由集群 Secret 注入，不写进清单。

## 部署前检查与正式任务

先确认 C 的数据库/PVC 已就绪，B 的 API 两副本已完成迁移，且手动 Job
能够生成可查询报告；再在承载共同集群的机器上执行：

```sh
kubectl --context kind-venue-lab2 -n venue-booking apply --dry-run=server \
  -f k8s/base/report-cronjob.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/report-cronjob.yaml
kubectl --context kind-venue-lab2 -n venue-booking get cronjob venue-report-daily -o wide
```

正式任务在下一个北京时间 00:10 执行，不能把清单应用成功当成已触发。
`Forbid` 只避免此 CronJob 的任务重叠；同 ID 的幂等仍由报告程序保证。

## 短周期演示与恢复

在远离北京时间午夜的时段，先经业务 API 创建当天的测试预约，记录场地和
预约 ID。然后应用演示清单，观察至少两个不同的自动 Job：

```sh
kubectl --context kind-venue-lab2 -n venue-booking apply --dry-run=server \
  -f k8s/demo/report-cronjob.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/demo/report-cronjob.yaml
kubectl --context kind-venue-lab2 -n venue-booking get cronjob venue-report-daily -o wide
kubectl --context kind-venue-lab2 -n venue-booking get jobs -l app.kubernetes.io/component=report -o wide
```

对每个 Job 用 `kubectl --context kind-venue-lab2 -n venue-booking logs job/<job_id>`
查看执行结果，并在前端 `#/reports` 输入同一个 Job 名称，
核对 `SCHEDULED`、当天日期、非零与零值场地。任务失败或页面 `404` 时，
同时检查 Job 状态、Pod 事件和日志，不能从数据库缺少记录推断 Job 不存在。
演示结束后立即恢复并核对正式配置：

```sh
kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/report-cronjob.yaml
kubectl --context kind-venue-lab2 -n venue-booking get cronjob venue-report-daily -o yaml
```

实际验收时记录同一集群中的 Job 名称、触发时间、来源、范围、报告结果和日志；
只有清单静态检查结果不能证明定时任务已经触发。
