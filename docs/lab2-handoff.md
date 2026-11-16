# Lab 2 交接记录

本文件是 A、B、C 的唯一交接记录。每次进入下一阶段前，交付方先更新自己的交付区，执行方完成后再更新对应的执行回传区。聊天消息可以提醒成员，但不能替代本文件中的记录。

## 使用规则

- A/B 更新交付信息：源码提交、镜像标签、完整执行命令、依赖条件、预期结果和需要 C 回传的输出。
- C 更新执行回传：执行时间、成功或失败、实际日志/证据位置及待处理问题；没有执行的项目写“未执行”，不要填计划结果。
- 每次交接使用新日期和唯一批次标识；不要覆盖已经完成的历史记录。
- 代码提交、镜像标签、清单引用必须互相对应。镜像内容变化必须使用新标签，不能覆盖旧标签后继续使用 `IfNotPresent`。
- 共同集群记录统一使用 `cluster=venue-lab2`、`context=kind-venue-lab2`、`namespace=venue-booking`。真实 Secret 值、密码和令牌不得写入此文件。

## 交接模板

### A/B 交付区

```text
交付时间：<Asia/Shanghai 时间>
交付成员：<A 或 B>
交付内容：<例如 API 双副本 / 手动报告 Job / CronJob>
源码版本：branch=<...> commit=<...> merged_to_develop=yes/no
镜像：name=<...> tag=<...> platform=<linux/arm64|linux/amd64> source_commit=<...>
清单/脚本：<文件路径>
依赖条件：<集群、资源、ConfigMap、Secret、上游交付>
执行命令：<从仓库根目录按顺序列出完整命令>
预期结果：<成功条件>
请 C 回传：<状态、日志位置、Pod/Job 名称、API 响应、数据库/迁移版本等>
```

### C 执行回传区

```text
执行时间：<Asia/Shanghai 时间>
执行成员：C
环境：host=<...> cluster=venue-lab2 context=kind-venue-lab2 namespace=venue-booking
实际执行：<实际执行的命令或脚本>
结果：SUCCESS / FAILED / PARTIAL / NOT_RUN
资源状态：<rollout、Pod 名称/节点/READY、PVC、Service、Job 状态>
日志/证据位置：<文件路径、命令输出或截图路径>
待处理问题：<没有则写“无”>
下一步负责人：<A/B/C>
```

## B → C：API 双副本和手动报告 Job

### B 交付区（待 C 执行）

交付时间：2026-11-16（Asia/Shanghai）

交付成员：B

交付内容：API Deployment/Service、Flyway V4、报告查询 API、手动报告 Job

源码版本：`feature/backend`，commit `70c266e`，已合入 `develop`

镜像：`venue-booking-api:lab2-20261113`，目标平台 `linux/arm64`；API Deployment、正式 CronJob、演示 CronJob 和手动 Job 必须使用同一标签

清单/脚本：

- `k8s/base/api-service.yaml`
- `k8s/base/api-deployment.yaml`
- `api/src/main/resources/db/migration/V4__create_report_tables.sql`
- `scripts/create-report-job.py`
- `k8s/jobs/venue-report-manual.yaml.tpl`

依赖条件：C 已在 `venue-lab2` 提供 `venue-booking`、`venue-config`、`venue-db-credentials`、`database:5432` Service、数据库 StatefulSet 和 Bound PVC；API 启动负责执行 Flyway V1–V4。

执行命令：

```sh
docker build --platform linux/arm64 --provenance=false --load \
  -t venue-booking-api:lab2-20261113 api
kind load docker-image venue-booking-api:lab2-20261113 --name venue-lab2

kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/api-service.yaml \
  -f k8s/base/api-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking \
  rollout status deployment/api --timeout=180s
kubectl --context kind-venue-lab2 -n venue-booking \
  get pods -l app.kubernetes.io/component=api -o wide

python3 scripts/create-report-job.py \
  2026-11-01 2026-11-06 \
  --image venue-booking-api:lab2-20261113
```

预期结果：两个 API Pod 为 `1/1 Running`，Deployment rollout 成功；API 日志显示 Flyway 已完成或已验证 V1–V4；手动 Job 退出码为 0，数据库中报告状态为 `SUCCEEDED`，每个场地都有一行明细。

请 C 回传：

- API Deployment rollout 输出；
- 两个 API Pod 的名称、节点、READY 状态和镜像 ID；
- Flyway V1–V4 的实际版本输出或 API 启动日志；
- 手动 Job 名称（即 `job_id`）、Job 状态和完整日志位置；
- `GET /api/reports/{job_id}` 的响应；
- 失败时的 `describe`、events、相关 Pod 日志和待处理问题。

### C 执行回传区（b-execution-20261116-113439）

执行时间：`2026-11-16T11:34:39.567758+08:00` 至 `2026-11-16T11:36:05.703683+08:00`（Asia/Shanghai）。

执行成员：C；按 B 的指令代执行，交由 B 核对结果。

环境：host=`wukediedeMacBook-Pro.local`，cluster=`venue-lab2`，context=`kind-venue-lab2`，namespace=`venue-booking`。

结果：**SUCCESS**（仅指本批 API 双副本、Flyway 与手动报告 Job 的交接条件满足）。

源码：实际检出 `ca6412b`，已验证 API、API 清单、手动 Job 模板/脚本与 B 指定的 `70c266e` 无差异；本批未改业务代码。

实际执行：依次执行交付区的 ARM64 构建、kind 装载、API apply/rollout、指定日期手动 Job；补充服务内报告查询、只读 SQL 核对及独立连接的实例标识检查。完整命令、退出码和日志索引见 [execution.json](assets/lab2/b-execution-20261116-113439/execution.json)。

构建与镜像：`venue-booking-api:lab2-20261113`，`linux/arm64`；[完整构建输出](assets/lab2/b-execution-20261116-113439/api-build.txt)、[kind 装载输出](assets/lab2/b-execution-20261116-113439/kind-load.txt)；三个节点的镜像检查分别保存在同批目录。构建按原 Dockerfile 跳过测试，不记为重新跑过后端测试。

镜像摘要：`sha256:c98babd1c4abe2cf630c446edc5c8fe788cf6453fda5001c347fc380275d587b`。

**API rollout 与两个 Pod**

rollout 输出：[api-rollout.txt](assets/lab2/b-execution-20261116-113439/api-rollout.txt)；Pod 原始输出：[api-pods-wide.txt](assets/lab2/b-execution-20261116-113439/api-pods-wide.txt)。

| Pod | 节点 | READY / 状态 | imageID |
| --- | --- | --- | --- |
| `api-d866875dd-jtlfr` | `venue-lab2-worker` | 1/1 Running | `docker.io/library/import-2026-11-16@sha256:49f3eabfc4eb9d320e3d22ba3b5044def48ac4858eef87c3727d09bdf1ae1a0e` |
| `api-d866875dd-ndq66` | `venue-lab2-worker2` | 1/1 Running | `docker.io/library/import-2026-11-16@sha256:49f3eabfc4eb9d320e3d22ba3b5044def48ac4858eef87c3727d09bdf1ae1a0e` |

两个 Pod 均引用 `venue-booking-api:lab2-20261113`。经集群内 `api` Service 新建独立连接，依次取得 `api-d866875dd-ndq66`, `api-d866875dd-ndq66`, `api-d866875dd-jtlfr`，覆盖两个就绪副本；未使用 port-forward 证明分流。原始响应为本批 `instance-0.txt` 至 `instance-2.txt`。

**Flyway V1–V4**

| 版本 | success |
| --- | --- |
| 1 | true |
| 2 | true |
| 3 | true |
| 4 | true |

数据库实际查询：[flyway-version.txt](assets/lab2/b-execution-20261116-113439/flyway-version.txt)（SQL：[flyway-version.sql](assets/lab2/b-execution-20261116-113439/flyway-version.sql)）；两个 Pod 的完整启动日志：[api-startup-0.txt](assets/lab2/b-execution-20261116-113439/api-startup-0.txt)、[api-startup-1.txt](assets/lab2/b-execution-20261116-113439/api-startup-1.txt)。

**手动报告 Job**

- `job_id`：`venue-report-manual-20261116033534-9f4175`。
- 参数：`2026-11-01` 至 `2026-11-06`；来源 `MANUAL`。
- Kubernetes：`Complete`，1/1；报告容器退出码 `0`。
- 创建输出：[manual-job-create.txt](assets/lab2/b-execution-20261116-113439/manual-job-create.txt)；等待输出：[manual-job-wait.txt](assets/lab2/b-execution-20261116-113439/manual-job-wait.txt)；完整日志：[manual-job-log.txt](assets/lab2/b-execution-20261116-113439/manual-job-log.txt)。
- Job 与 Pod 原始状态：[manual-job-json.txt](assets/lab2/b-execution-20261116-113439/manual-job-json.txt)、[manual-job-pods.json](assets/lab2/b-execution-20261116-113439/manual-job-pods.json)。

**报告查询响应**

`GET /api/reports/venue-report-manual-20261116033534-9f4175`：**HTTP 200**。完整 HTTP 响应：[report-http-response.txt](assets/lab2/b-execution-20261116-113439/report-http-response.txt)；JSON：[report-response.json](assets/lab2/b-execution-20261116-113439/report-response.json)。

```json
{
  "job_id": "venue-report-manual-20261116033534-9f4175",
  "source": "MANUAL",
  "start_date": "2026-11-01",
  "end_date": "2026-11-06",
  "status": "SUCCEEDED",
  "started_at": "2026-11-16T11:36:00.517134+08:00",
  "finished_at": "2026-11-16T11:36:00.771154+08:00",
  "generated_at": "2026-11-16T11:36:00.771154+08:00",
  "error_summary": null,
  "items": [
    {
      "venue_id": 1,
      "venue_name": "羽毛球馆 A",
      "reservation_count": 0,
      "reserved_minutes": 0
    },
    {
      "venue_id": 2,
      "venue_name": "多功能教室 B",
      "reservation_count": 0,
      "reserved_minutes": 0
    },
    {
      "venue_id": 3,
      "venue_name": "会议室 C",
      "reservation_count": 0,
      "reserved_minutes": 0
    }
  ]
}
```

另以只读 SQL 核对相同日期窗口的聚合，三条明细与接口完全一致：[report-sql-cross-check.txt](assets/lab2/b-execution-20261116-113439/report-sql-cross-check.txt)。本窗口只有三个种子场地、无有效预约，所有统计为零；本批不声称验证了非零/取消统计、报告失败重试、预约并发冲突或浏览器流程。

**资源保留与后续**

- 数据库持续 Ready、PVC Bound，PVC UID 未变化，Secret UID/resourceVersion 未变化；未删除数据库 Pod、PVC、Secret 或集群。
- 最终资源状态：[final-status.txt](assets/lab2/b-execution-20261116-113439/final-status.txt)。API 两副本和已完成 Job/报告保留供 A/B 联调。
- 未部署前端、DaemonSet、正式/演示 CronJob。
- 待处理问题：本批无失败；非零业务数据和完整回归属于后续验收。
- 下一步负责人：B 核对本次回传；A 以同一 API 标签和成功 Job ID 接入前端报告页，再按前置条件验证 CronJob/DaemonSet；C 协助执行。

## A → C：前端、CronJob 和 DaemonSet 执行回传

本节由 C 按 A 已合入的说明代执行并追加；前面的 B 交付与执行记录保留原文。

执行依据：[前端说明](../k8s/frontend.md)、[节点检查说明](../k8s/node-check.md)、[CronJob 说明](../k8s/report-cronjob.md)。源码基线 `2e00bf1`，执行分支 `integration/lab2-a`；本批未修改 A/B 业务代码、Dockerfile、清单或测试代码。

环境：host=`wukediedeMacBook-Pro.local`，cluster=`venue-lab2`，context=`kind-venue-lab2`，namespace=`venue-booking`。

### 尝试批次与问题记录

| 批次 | 结果与原因 | 完整记录 |
| --- | --- | --- |
| `a-execution-20261116-122248` | PARTIAL：Command failed: node-check-build；Command failed: frontend-final-logs | [execution.json](assets/lab2/a-execution-20261116-122248/execution.json) |
| `a-execution-20261116-122516` | PARTIAL：Command failed: node-check-rollout；Command failed: frontend-final-logs | [execution.json](assets/lab2/a-execution-20261116-122516/execution.json) |
| `a-execution-20261116-122736` | PARTIAL：Command failed: node-check-rollout；DaemonSet: 2 Pods scheduled but 0 Ready; short DNS name NXDOMAIN, full kubernetes.default.svc.cluster.local resolves on both workers. A fix required.；Frontend port-forward did not become ready | [execution.json](assets/lab2/a-execution-20261116-122736/execution.json) |
| `a-execution-20261116-123004` | PARTIAL：Command failed: node-check-rollout；DaemonSet: 2 Pods scheduled but 0 Ready; short DNS name NXDOMAIN, full kubernetes.default.svc.cluster.local resolves on both workers. A fix required. | [execution.json](assets/lab2/a-execution-20261116-123004/execution.json) |

首轮 Docker Hub 认证超时，经单独重试拉取固定 `busybox:1.37.0` 后恢复；前端预构建日志附在本批目录。另一次验证工具的 localhost 请求受系统代理影响，直连测试返回 HTTP 200；后续仅在验证进程禁用 localhost 代理并重试，没有修改系统代理配置。C 为浏览器运行器下载并校验官方 Node v24.15.0 到 `/tmp`，未替换系统 Node。

### 本次最终回传（a-execution-20261116-123004）

执行时间：`2026-11-16T12:30:04.505325+08:00` 至 `2026-11-16T12:34:40.119075+08:00`（Asia/Shanghai）。

结果：**PARTIAL**。DaemonSet 未通过；前端与 CronJob 按下列证据分别记结果，不将部分成功写成整体成功。

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 前端镜像构建、装载、Deployment | PASS | [frontend-build.txt](assets/lab2/a-execution-20261116-123004/frontend-build.txt)、[frontend-load.txt](assets/lab2/a-execution-20261116-123004/frontend-load.txt)、[frontend-rollout.txt](assets/lab2/a-execution-20261116-123004/frontend-rollout.txt) |
| 真实集群浏览器回归 | PASS（2 项） | [browser-cluster-regression.txt](assets/lab2/a-execution-20261116-123004/browser-cluster-regression.txt) |
| CronJob 清单静态契约 | PASS（3 项） | [cronjob-contract.txt](assets/lab2/a-execution-20261116-123004/cronjob-contract.txt) |
| CronJob 两次自动触发及统计 | PASS | [cronjob-observed-jobs.json](assets/lab2/a-execution-20261116-123004/cronjob-observed-jobs.json) |
| 恢复正式调度 | PASS | [cronjob-restore-production.txt](assets/lab2/a-execution-20261116-123004/cronjob-restore-production.txt)、[cronjob-final-json.txt](assets/lab2/a-execution-20261116-123004/cronjob-final-json.txt) |
| DaemonSet 两 worker 覆盖与 DNS | FAILED：2 Pod 已调度，0 Ready | [daemonset-status.txt](assets/lab2/a-execution-20261116-123004/daemonset-status.txt)、[daemonset-pods.txt](assets/lab2/a-execution-20261116-123004/daemonset-pods.txt) |

**镜像与源码**

- API/手动 Job/正式与演示 CronJob 继续共用 `venue-booking-api:lab2-20261113`，未重建或替换 B 的 API。
- 前端：`venue-booking-frontend:lab2-eda8edd`，`linux/arm64`，摘要 `sha256:b419b0651f154ecef2090a38deca1889d2ce65c418b93e0538a91e1e843da8a3`。
- 节点检查：`venue-booking-node-check:lab2-20261115-01`，`linux/arm64`，摘要 `sha256:cece3b67a1b027b893a8f55e2d40d99263e8f360fffe7f886dd5547bf95e3dae`。
- 完整命令、日志索引、各节点镜像检查、实际 Pod imageID：[execution.json](assets/lab2/a-execution-20261116-123004/execution.json)。

**实际业务数据与手动报告**

- 批次日期：`2026-11-16`。
- 正值场地 ID `4`；有效预约 ID `1`，30 分钟。
- 同场地另有预约 ID `2`，已通过 API 取消；不计入有效统计。
- 专用零值场地 ID `5`，没有预约。
- 全部数据通过前端入口的真实 API 创建，没有直接 SQL 写业务表；创建/取消响应保存在本批 `fixture-*.json`。
- 新建同日手动报告 `venue-report-manual-20261116043018-208e0f`，状态 SUCCEEDED，正值场地为 1 次/30 分钟，专用零值场地为 0/0；[fixture-manual-job-log.txt](assets/lab2/a-execution-20261116-123004/fixture-manual-job-log.txt)、[fixture-manual-report.json](assets/lab2/a-execution-20261116-123004/fixture-manual-report.json)。
- 原 B 的历史日期报告和 Job 保留，不覆盖其快照；A 的浏览器回归另建并取消了一个带 `lab2-a-...` 批次标识的未来预约，具体 ID 见浏览器日志。

**CronJob 自动触发与页面核对**

演示开始时间：`2026-11-16T12:30:57.473073+08:00`；使用真实 `*/2 * * * *` 调度、Asia/Shanghai、TODAY、Forbid。自动 Job 通过 ownerReference 对应同一个 CronJob UID，不是手动创建。

| 自动 Job | 创建时间（UTC） | 报告状态/来源/窗口 |
| --- | --- | --- |
| `venue-report-daily-29913392` | 2026-11-16T04:32:00Z | SUCCEEDED / SCHEDULED / 2026-11-16 |
| `venue-report-daily-29913394` | 2026-11-16T04:34:00Z | SUCCEEDED / SCHEDULED / 2026-11-16 |

每个 Job 的完整日志为本批 `<job_id>-logs.txt`，API 返回为 `<job_id>-report.json`。逐份核对有效预约 1 次/30 分钟、取消预约排除、专用零值场地 0/0，并与只读 SQL 聚合比较。
浏览器再次查询手动报告和两份自动报告，核对来源、日期与非零/零值行；结果见 [report-browser-checks.json](assets/lab2/a-execution-20261116-123004/report-browser-checks.json)，页面截图见同批 `report-page-*.png`。

结束后已恢复 `10 0 * * *`、`timeZone: Asia/Shanghai`、`REPORT_WINDOW_MODE=PREVIOUS_DAY`、`concurrencyPolicy: Forbid`，API 镜像标签未变。只验证了恢复后的配置；没有等待正式每日 00:10 的下一次实际触发。

**DaemonSet 失败与需要 A 修复的内容**

两个 Pod 已分别调度到两个 worker，但日志和 readiness 都查询 `kubernetes.default.svc`，在当前 BusyBox 环境返回 NXDOMAIN，因此 DESIRED/CURRENT=2，READY=0。相同两个 Pod 查询 `kubernetes.default.svc.cluster.local` 均成功返回 `10.96.0.1`；这不支持把问题直接归因为整个集群 DNS 或节点网络故障。

- 失败命令：`kubectl --context kind-venue-lab2 -n venue-booking rollout status daemonset/node-check --timeout=120s`（首轮），最新重复检查使用 5s 等待；[node-check-rollout.txt](assets/lab2/a-execution-20261116-123004/node-check-rollout.txt)。
- 脚本日志：[node-check-log-0.txt](assets/lab2/a-execution-20261116-123004/node-check-log-0.txt)、[node-check-log-1.txt](assets/lab2/a-execution-20261116-123004/node-check-log-1.txt)。
- 完整域名解析：[node-check-fqdn-0.txt](assets/lab2/a-execution-20261116-123004/node-check-fqdn-0.txt)、[node-check-fqdn-1.txt](assets/lab2/a-execution-20261116-123004/node-check-fqdn-1.txt)；搜索域见本批 `node-check-resolv-*.txt`。
- describe/events：[daemonset-describe.txt](assets/lab2/a-execution-20261116-123004/daemonset-describe.txt)、[warning-events.txt](assets/lab2/a-execution-20261116-123004/warning-events.txt)。
- 请 A 调整脚本和 readiness 的查询目标，使其在实际集群一致可用（例如使用已验证的完整服务名或显式配置目标），同步相关测试、说明和新镜像标签；不要只改日志脚本而遗漏探针。C 随后只需复测节点任务，不能将当前 0/2 记录为通过。

**保留状态与下一步**

- 数据库、API、前端、正式 CronJob、业务测试记录及报告保留；临时 port-forward 已关闭。PVC UID 和 Secret UID/resourceVersion 未变。
- DaemonSet 仍保留在原代码的失败状态，便于 A 核对，未绕过 readiness 或改业务代码掩盖失败。
- 最终资源状态：[final-status.txt](assets/lab2/a-execution-20261116-123004/final-status.txt)；浏览器运行器及静态检查依赖只在临时目录准备。
- 待处理问题：A 修复 DaemonSet 查询名称与探针后交付新标签；其他失败见各批完整记录。
- 下一步负责人：A 核对前端/CronJob 通过证据并修复 DaemonSet，C 按新提交复测；B/C 后续继续未覆盖的业务持久化、并发及失败重试验收。
