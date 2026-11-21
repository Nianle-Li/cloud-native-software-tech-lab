# Lab 2 最终展示环境

在目标 kind 集群 `venue-lab2` 中，`venue-booking-final` 是最终展示的完整系统。它通过 `k8s/final/kustomization.yaml` 复用 `k8s/base/` 的资源配置，拥有独立的 Secret、数据库和 PVC。`venue-booking` 是同一集群中的专项验收环境，供并发、重试和数据库 Pod 重建等会改变数据的检查使用；两个命名空间的报告和业务数据不能混用。

以下命令在承载该集群的机器上、从仓库根目录执行。先核对 `kubectl` context、节点架构和 StorageClass；本次目标集群为 ARM64，镜像构建及装载见 [kind 与镜像说明](../kind/README.md)和[数据库镜像说明](../README.md#1-核对环境与数据库镜像)。当前清单引用前端 `venue-booking-frontend:lab2-report-query-02`、API `venue-booking-api:lab2-20261113`、节点检查 `venue-booking-node-check:lab2-20261116-01`、数据库 `postgres:16.15-bookworm`。确认四种镜像已装载到目标 kind 节点；从不同内容重新构建时必须换标签，并同步相关清单、手动 Job 命令和核对脚本。不得以同名标签覆盖已部署镜像。

## 已部署环境：只读查看

目标集群的验收记录包含 `venue-booking-final` 的固定业务数据和报告。若该部署仍在运行，只查看最终效果时先核对目标 context、资源和 PVC，然后端口转发；无需再次创建命名空间、Secret、业务数据或 Job，也无需切换 CronJob 调度：

```sh
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 -n venue-booking-final get deploy,sts,ds,cronjob,job,svc,pvc,pods -o wide
kubectl --context kind-venue-lab2 -n venue-booking-final port-forward service/frontend 8080:80
```

在承载集群的主机上打开 `http://127.0.0.1:8080/`，从 Job 列表取得本命名空间的实际 Job ID，在 `#/reports` 查询。端口转发会占用当前终端。若命名空间不存在，才按下面的全新部署流程准备；若命名空间存在但资源缺失或状态异常，先核对 Secret、PVC、Pod、事件与日志，不运行初始化脚本覆盖现有数据。

## 全新部署

此节只适用于尚不存在 `venue-booking-final` 的集群。`k8s/final/` 引用上级清单，`kubectl kustomize` 需要显式允许读取上级目录。生成的 YAML 应检查所有有命名空间的资源均为 `venue-booking-final`，且正式 CronJob 为 `10 0 * * *`、`PREVIOUS_DAY`。运行数据脚本需要 Python 3.10 或更新版本；目标集群的核对记录使用 Python 3.12。

先检查目标集群及命名空间：

```sh
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 get storageclass
kubectl --context kind-venue-lab2 get namespace venue-booking-final --ignore-not-found
```

若 `venue-booking-final` 已存在，应使用上节的只读流程；不要运行以下初始化命令，也不要删除命名空间或 PVC。确认命名空间尚不存在后，再部署：

```sh
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/final > /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 apply -f k8s/final/namespace.yaml
python3 scripts/create-k8s-db-secret.py --context kind-venue-lab2 --namespace venue-booking-final
kubectl --context kind-venue-lab2 apply --dry-run=server -f /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 apply -f /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status statefulset/database --timeout=180s
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status deployment/api --timeout=180s
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status deployment/frontend --timeout=120s
kubectl --context kind-venue-lab2 -n venue-booking-final rollout status daemonset/node-check --timeout=120s
```

资源就绪后，在另一终端运行端口转发：

```sh
kubectl --context kind-venue-lab2 -n venue-booking-final port-forward service/frontend 8080:80
```

浏览器访问 `http://127.0.0.1:8080/`。先查询 `/api/venues` 和 `/api/reservations`：全新数据库应只有 Flyway 初始化的三个场地，且无预约。展示数据脚本会再次检查这一条件，拒绝向旧测试数据库继续写入。以下种子脚本和 Job 命令只在新建环境中运行；已有展示环境不要重复执行。

```sh
python3 scripts/seed-final-display.py --base-url http://127.0.0.1:8080 --context kind-venue-lab2 --namespace venue-booking-final
```

仅在新建的独立数据库中运行一次。脚本会写入业务数据；若中途失败，应先检查已写入记录，不要清空 PVC 或直接重跑。

脚本输出一次性报告日期、定时报告日期和资源 ID。它新增“排练室 D”“小型会议室 E”，使页面展示五个可读场地、七条预约（六条有效、一条已取消）。一次性报告的预期统计为羽毛球馆 A 2 次/150 分钟、多功能教室 B 1 次/120 分钟、排练室 D 2 次/150 分钟，另外两个场地为零。定时演示的预期统计为小型会议室 E 1 次/60 分钟，另外四个场地为零。

## 报告与核对

使用脚本输出的 `manual_report_date` 作为下面两个日期参数，创建一次性 Job；成功后在 `#/reports` 输入返回的 Job ID。

```sh
python3 scripts/create-report-job.py YYYY-MM-DD YYYY-MM-DD --context kind-venue-lab2 --namespace venue-booking-final --image venue-booking-api:lab2-20261113
kubectl --context kind-venue-lab2 -n venue-booking-final get jobs -o wide
```

定时演示只能在脚本输出的 `scheduled_report_date` 当天进行。若脚本在北京时间 16:00 后运行，它将预约安排在次日；届时再切换短周期清单。短周期覆盖只用于全新环境的验收，不用于日常查看。先应用演示配置，等待两个不同的自动 Job 出现：

```sh
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/final/demo | kubectl --context kind-venue-lab2 apply -f -
kubectl --context kind-venue-lab2 -n venue-booking-final get jobs -l app.kubernetes.io/component=report -o wide
```

对两个新 Job 分别确认 `Complete`、父资源为 `venue-report-daily`，并用 `kubectl --context kind-venue-lab2 -n venue-booking-final logs job/<job_id>` 核对日志；在页面和 API 中核对 `SCHEDULED`、当天日期、非零与零值统计。**完成两次核对后**恢复正式配置；若演示失败或中断，也立即恢复：

```sh
kubectl --context kind-venue-lab2 apply -f /tmp/venue-booking-final.yaml
kubectl --context kind-venue-lab2 -n venue-booking-final get cronjob venue-report-daily -o yaml
```

恢复后应看到 `schedule: 10 0 * * *`、`timeZone: Asia/Shanghai`、`REPORT_WINDOW_MODE=PREVIOUS_DAY` 和 `concurrencyPolicy: Forbid`。短周期自动触发与正式配置恢复分别留证，不能把正式配置核对说成跨日自动触发实测。

最终核对五个场地、七条预约、手动与自动报告的非零/零值明细、两个 API Pod、数据库 PVC、前端页面，以及 DaemonSet 在两个 worker 上各有一个就绪 Pod、两份日志均为 `dns=ok`。用于证明最终展示结果的截图、API 响应和日志应对应本命名空间；其他业务界面补充图只说明交互，不替代本命名空间的运行证据。会新增随机场地的浏览器回归应在隔离的专项验收环境执行。

下面的核对脚本接收实际的三个 Job ID，检查报告数值、CronJob 父资源、正式调度、数据库 PVC 和两个节点的 DNS 日志。执行前保持上述端口转发：

```sh
python3 scripts/verify-final-display.py \
  --context kind-venue-lab2 --namespace venue-booking-final \
  --manual-job YOUR_MANUAL_JOB_ID \
  --scheduled-jobs YOUR_FIRST_SCHEDULED_JOB_ID YOUR_SECOND_SCHEDULED_JOB_ID
```

运行前将三个 `YOUR_...` 值替换为本命名空间实际生成的 Job 名称。

本流程仅管理 `venue-booking-final` 命名空间。专项验收命令见 [Kubernetes 专项验收说明](../README.md)，逐项结果与证据见 [最终验收记录](../../docs/lab2/acceptance.md)；不要删除任一命名空间的数据或 PVC 来重跑验收。
