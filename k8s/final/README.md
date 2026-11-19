# Lab 2 最终展示环境

在 kind 集群 `venue-lab2` 中使用独立的 `venue-booking-final` 命名空间。该空间复用 `k8s/base/` 的资源配置，并拥有独立的 Secret、数据库 StatefulSet 和 PVC，保证展示数据与其他命名空间隔离。

以下命令在承载共同集群的机器上、仓库根目录执行。先确认工作树包含最终前端源码，且节点已装载与清单一致的 API、前端、节点检查和 PostgreSQL 镜像。ARM64 镜像的构建及装载方式见上级部署说明；前端使用 `venue-booking-frontend:lab2-report-query-02`，API 使用 `venue-booking-api:lab2-20261113`，节点检查使用 `venue-booking-node-check:lab2-20261116-01`。镜像内容改变时必须换新标签并同步清单。

## 部署

`k8s/final/` 引用现有清单，`kubectl kustomize` 需要显式允许读取上级目录。生成的 YAML 应检查所有有命名空间的资源均为 `venue-booking-final`，且正式 CronJob 为 `10 0 * * *`、`PREVIOUS_DAY`。

```sh
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 get storageclass
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/final > /tmp/venue-booking-final.yaml
kubectl apply -f k8s/final/namespace.yaml
python3 scripts/create-k8s-db-secret.py --namespace venue-booking-final
kubectl --context kind-venue-lab2 apply --dry-run=server -f /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 apply -f /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status statefulset/database --timeout=180s
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status deployment/api --timeout=180s
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status deployment/frontend --timeout=120s
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status daemonset/node-check --timeout=120s
```

在另一终端运行端口转发：

```sh
kubectl --context kind-venue-lab2 -n venue-booking-final port-forward service/frontend 8080:80
```

浏览器访问 `http://127.0.0.1:8080/`。先查询 `/api/venues` 和 `/api/reservations`：全新数据库应只有 Flyway 初始化的三个场地，且无预约。展示数据脚本会再次检查这一条件，拒绝向旧测试数据库继续写入。

```sh
python3 scripts/seed-final-display.py --base-url http://127.0.0.1:8080
```

脚本输出一次性报告日期、定时报告日期和资源 ID。它新增“排练室 D”“小型会议室 E”，使页面展示五个可读场地、七条预约（六条有效、一条已取消）。一次性报告的预期统计为羽毛球馆 A 2 次/150 分钟、多功能教室 B 1 次/120 分钟、排练室 D 2 次/150 分钟，另外两个场地为零。定时演示的预期统计为小型会议室 E 1 次/60 分钟，另外四个场地为零。

## 报告与核对

使用脚本输出的 `manual_report_date` 作为下面两个日期参数，创建一次性 Job；成功后在 `#/reports` 输入返回的 Job ID。

```sh
python3 scripts/create-report-job.py YYYY-MM-DD YYYY-MM-DD --context kind-venue-lab2 --namespace venue-booking-final --image venue-booking-api:lab2-20261113
kubectl --context kind-venue-lab2 -n venue-booking-final get jobs -o wide
```

定时演示只能在脚本输出的 `scheduled_report_date` 当天进行。若脚本在北京时间 16:00 后运行，它将预约安排在次日；届时再切换短周期清单。观察至少两个自动 Job 后，立即恢复正式清单：

```sh
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/final/demo | kubectl --context kind-venue-lab2 apply -f -
kubectl --context kind-venue-lab2 -n venue-booking-final get jobs -l app.kubernetes.io/component=report -o wide
kubectl --context kind-venue-lab2 apply -f /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 -n venue-booking-final get cronjob venue-report-daily -o wide
```

最终核对五个场地、七条预约、手动与自动报告的非零/零值明细、两个 API Pod、数据库 PVC、前端页面，以及 DaemonSet 在两个 worker 上各有一个就绪 Pod、两份日志均为 `dns=ok`。报告截图与运行结果应取自同一展示环境。会新增随机场地的浏览器回归应在独立测试环境执行。

下面的核对脚本接收实际的三个 Job ID，检查报告数值、CronJob 父资源、正式调度、数据库 PVC 和两个节点的 DNS 日志。执行前保持上述端口转发：

```sh
python3 scripts/verify-final-display.py \
  --manual-job YOUR_MANUAL_JOB_ID \
  --scheduled-jobs YOUR_FIRST_SCHEDULED_JOB_ID YOUR_SECOND_SCHEDULED_JOB_ID
```

运行前将三个 `YOUR_...` 值替换为本命名空间实际生成的 Job 名称。

本流程仅管理 `venue-booking-final` 命名空间，不删除其他命名空间的数据或 PVC。
