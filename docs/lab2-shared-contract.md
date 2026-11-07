# Lab 2 并行开发公共契约

状态：并行开发的统一设计基线，**不代表已经实现或实测**。任务书要求与业务目标见 [Lab 2 需求与实现契约](lab2-contract.md)；职责和顺序见 [三人分工](lab2-team-plan.md)；完成证据见[验收清单](lab2-acceptance.md)。任务书决定必须完成什么，主契约决定本组业务语义，本文固定跨成员接口与实现选择；三者若有冲突，先澄清并同步。本组方案变更时，先同步本文和主契约，再改代码、清单与测试。

## 1. 开工前先固定什么

| 类别 | 必须固定的内容 | 可以随后确认的内容 |
| --- | --- | --- |
| 业务与 API | 报告数据口径、JSON 字段、状态和错误码；现有七个业务接口继续兼容 | 页面视觉细节、报告中图表样式 |
| 任务执行 | 报告镜像启动命令、环境变量、任务 ID、退出码、同一 ID 重试规则、正式/演示日期模式 | 演示的具体触发时刻 |
| 组件连接 | 命名空间、Service 名称/端口、ConfigMap/Secret 名称与键、标签选择器 | 镜像加载命令、StorageClass 名称和资源配额数值 |
| 验证 | 谁提供固定响应样例、谁提供测试数据库、谁提供集群入口；证据记录格式 | 最终截图排版与报告文字 |

“必须固定的内容”确定后，页面可用固定 JSON 样例开发，报告程序可用本地数据库开发，集群资源也可独立准备。集群发行版、镜像装载和存储驱动未知时，不阻止这三条开发线；它们只阻止最终清单定值与真实集群验收。

## 2. 跨组件接口：当前采用的约定

### 2.1 资源、端口与服务发现

| 资源 | 工作负载与副本 | 稳定入口 | 消费方 |
| --- | --- | --- | --- |
| 前端 | `frontend` Deployment，初始 1 副本 | `frontend` Service，`80 → 80`；本地可端口转发 | 浏览器 |
| API | `api` Deployment，初始 2 副本 | `api` ClusterIP Service，`8080 → 8080` | 前端 Nginx、集群内测试客户端 |
| 数据库 | `database` StatefulSet，1 副本 | `database` ClusterIP Service，`5432 → 5432`；`database-headless` 提供 Pod 稳定身份 | API、报告 Job |
| 报告任务 | Job/CronJob 创建的短时 Pod | 不建 Service | 从 `database` 读取并写入结果 |
| 节点检查 | `node-check` DaemonSet | 不建 Service | 通过日志和 Pod 节点分布验收 |

命名空间统一为 `venue-booking`，资源和 Pod 使用 `app.kubernetes.io/name: venue-booking` 与 `app.kubernetes.io/component: frontend|api|database|report|node-check` 两级标签；Service 的 selector 只匹配对应组件，不误选 Job 或其他 Pod。前端浏览器请求继续使用同源 `/api`，Nginx 转发到 `api:8080` 并保留路径和查询参数。集群内依赖不写 Pod IP，数据库不对外发布。StatefulSet 的无头 Service 和 `volumeClaimTemplates` 分别提供稳定网络身份与每 Pod 的 PVC，存储是否可用仍取决于实验集群。[Kubernetes StatefulSet 文档](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)

常规资源清单位于 `k8s/base/`，一次性 Job 模板位于 `k8s/jobs/`，临时演示覆盖清单位于 `k8s/demo/`。正式 CronJob 在 `k8s/base/`，演示时才应用同名覆盖清单，结束后恢复正式配置。真实 Secret 由部署环境创建；README 按命名空间与配置、数据库、API、前端与任务的依赖顺序说明部署，不对整个 `k8s/` 目录执行 `kubectl apply`。

`kubectl port-forward service/api` 会选中一个 Pod 建立转发会话，因此**不能**用该会话中的多次请求证明 Service 在两个 API 副本间分发。双副本证据应由集群内客户端经 `api` Service 发起独立连接，并保存不同 `instance_id` 响应及对应 Pod 日志。[kubectl port-forward 文档](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/)

### 2.2 镜像、配置与凭据

| 名称 | 内容与读取约定 | 边界 |
| --- | --- | --- |
| `venue-config` ConfigMap | `POSTGRES_DB=venue_booking`、`PGDATA=/var/lib/postgresql/data/pgdata`、`SPRING_DATASOURCE_URL=jdbc:postgresql://database:5432/venue_booking` 等非敏感值 | C 负责清单；API、数据库和报告任务使用一致的数据库名及 Service 地址；数据库 PVC 挂载于 `/var/lib/postgresql/data` |
| `venue-db-credentials` Secret | `POSTGRES_USER`、`POSTGRES_PASSWORD`；API/报告容器映射为 `SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD` | C 负责创建说明；真实值由部署环境创建，不进 Git、日志或截图 |
| `frontend-nginx` ConfigMap | Kubernetes 专用 Nginx 配置 | A 负责清单；不沿用 Docker 的 `127.0.0.11` resolver |
| 镜像标识 | 前端、API、`node-check` 使用同一轮可追踪的固定版本标签或摘要；Job/CronJob 复用 API 镜像 | A 确认前端与节点检查所需镜像和工具，B 确认 API/报告镜像，C 核对各节点能拉取或装载；`imagePullPolicy` 与实际集群一致 |

Kubernetes Secret 的 Base64 编码不提供保密性；谁能读取 Secret、真实值如何创建、是否启用静态加密都由实验环境决定。[Kubernetes Secret 最佳实践](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)

各清单负责人提供容器端口、启动命令、预计资源消耗和可用探针端点；C 汇总节点容量与 StorageClass 实测值，A/B 再核对各自清单的 requests/limits 和探针。`node-check` 镜像必须实际包含所选 DNS 查询工具；不能只凭镜像名假定工具存在。

### 2.3 HTTP 与页面

- Lab 1 原有七个业务接口、`snake_case` JSON、预约时间与冲突规则不变；新增接口为 `GET /api/instance` 和 `GET /api/reports/{job_id}`，具体响应见主契约第 3–4 节。
- `job_id` 遵守正则 `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`。报告响应的 `status`、日期范围、时间戳、`error_summary` 与 `items` 必须按样例实现；时间戳使用带偏移的 ISO 8601 字符串并统一输出北京时间 `+08:00`，明细按 `venue_id` 升序返回，使页面与测试有确定顺序。无效 ID 返回 `400 VALIDATION_ERROR`，不存在返回 `404 REPORT_NOT_FOUND`。
- A、B 以主契约的成功 JSON 和下表作为共同的固定响应样例；B 如需调整字段或状态，须先同步契约，A 随后更新类型、响应校验和测试。HTTP 错误体沿用 `{"error":{"code":"...","message":"..."}}`，`message` 应可读且不包含数据库密码、SQL 或堆栈信息。

| 查询结果 | HTTP 与 `status` | 固定字段及页面处理 |
| --- | --- | --- |
| 运行中 | `200`、`RUNNING` | 返回 `job_id/source/start_date/end_date/started_at`；`finished_at/generated_at/error_summary` 为 `null`，`items=[]`；页面显示等待和刷新入口。 |
| 成功 | `200`、`SUCCEEDED` | `finished_at/generated_at` 非空、`error_summary=null`，`items` 含全部场地并按 `venue_id` 排序；无预约场地的两个统计值均为 0。 |
| 可捕获失败 | `200`、`FAILED` | `finished_at` 非空，`generated_at=null`，`error_summary` 为已脱敏的非空摘要，`items=[]`；页面显示失败。 |
| 没有运行记录 | `404`、`REPORT_NOT_FOUND` | 返回统一错误体；页面说明数据库暂无记录，并提示可核对 Kubernetes Job。 |
| ID 格式错误 | `400`、`VALIDATION_ERROR` | 返回统一错误体；页面在请求前也校验同一规则。 |

`started_at` 仅在数据库已写入运行记录时有值；若任务在此之前异常退出，按 404 处理。`FAILED` 表示最近一次已捕获的执行失败，Kubernetes Job 若尚有重试机会，记录之后仍可能转为 `RUNNING` 或 `SUCCEEDED`。断网、超时或不符合上述结构的 JSON 由页面单独显示查询失败，不推断报告状态。

运行中响应示例：

```json
{"job_id":"venue-report-20261106-001","source":"MANUAL","start_date":"2026-11-01","end_date":"2026-11-06","status":"RUNNING","started_at":"2026-11-07T00:10:00+08:00","finished_at":null,"generated_at":null,"error_summary":null,"items":[]}
```

可捕获失败响应示例：

```json
{"job_id":"venue-report-20261106-001","source":"MANUAL","start_date":"2026-11-01","end_date":"2026-11-06","status":"FAILED","started_at":"2026-11-07T00:10:00+08:00","finished_at":"2026-11-07T00:10:03+08:00","generated_at":null,"error_summary":"报告生成失败，请查看 Job 日志","items":[]}
```

数据库没有运行记录时返回 `404` 与 `{"error":{"code":"REPORT_NOT_FOUND","message":"暂无报告运行记录"}}`；无效 ID 返回 `400` 与相同结构的 `VALIDATION_ERROR` 错误。主契约中的成功响应示例与上述示例使用相同字段全集。

- 前端只提供一个 `#/reports` 页面：成员从手动 Job 触发命令或 Kubernetes Job 列表取得 ID，输入后调用 `GET /api/reports/{job_id}` 并在同页展示结果；README 说明取得 ID 的方法。页面只读，不列出全部 Job、不创建 Job、不访问 Kubernetes API。`RUNNING`、`SUCCEEDED`、`FAILED`、404、断网和异常 JSON 均有明确反馈；不凭等待时长推断 Job 最终状态。页面可按固定响应样例开发，待真实 API 可用后再联调。浏览器端到端测试可先用模拟响应，最终须在 Kubernetes 入口复跑并区分两种证据。
- API 的 `GET /api/instance` 仅返回可核对的实例标识；`POD_NAME` 由 Downward API 注入，本地运行可使用主机名回退。不能把该标识当作业务数据或认证信息。[Kubernetes Downward API 文档](https://kubernetes.io/docs/concepts/workloads/pods/downward-api/)

### 2.4 报告口径、存储与执行

- `start_date`、`end_date` 是北京时间自然日闭区间；只按 `reservation_date` 过滤状态为 `ACTIVE` 的预约。所有场地均有一行，包含零值场地；每条预约时长为 `end_time - start_time` 的分钟数。累计值称“已预约分钟数”，不声称实际到场使用率。场地名称随报告保存快照，避免事后查询时名称变化影响历史结果。
- B 新增 Flyway 迁移定义 `report_runs` 与 `report_items`；C 复核主键、外键、唯一约束和 PVC 生命周期。`job_id` 唯一，明细以 `(job_id, venue_id)` 唯一；次数与分钟数使用足够范围的非负整数列。开始、成功和可捕获失败写入运行记录。对**同一个 `job_id`** 的重试：来源/范围一致且已成功则直接成功退出；参数冲突则非零退出且不覆盖旧结果；原记录为 `FAILED` 或残留 `RUNNING` 时可重新计算。每轮重试更新 `started_at`，清空旧的 `finished_at/generated_at/error_summary`，先提交 `RUNNING`；统计读取使用同一数据库快照或等价的单条聚合查询，再在一个事务中替换该 ID 的明细并写入 `SUCCEEDED` 与 `generated_at`。可捕获失败写入 `FAILED` 与脱敏摘要。Job 的 `parallelism`、`completions` 均为 1，Pod 模板的 `restartPolicy` 为 `Never`；数据库锁/唯一约束仍须保护潜在的重复执行。旧 V1–V3 迁移不得修改。
- Job 的 Kubernetes 名称即 `REPORT_JOB_ID`，从 Job Pod 的 `batch.kubernetes.io/job-name` 标签通过 Downward API 注入。`REPORT_SOURCE` 取 `MANUAL` 或 `SCHEDULED`：手动任务必须提供 `REPORT_START_DATE` 与 `REPORT_END_DATE`，不设置 `REPORT_WINDOW_MODE`；定时任务不传起止日期，设置 `REPORT_WINDOW_MODE=PREVIOUS_DAY`（正式）或 `TODAY`（短周期演示），程序按北京时间计算相应自然日，两端日期相同。定时任务同一 `job_id` 若已有运行记录，重试**先读取记录**并复用首次持久化的日期范围，不因重试改变口径。缺少或冲突的参数按配置错误失败；若日期参数无效或数据库不可达，程序可能无法写入运行记录，此时以 Job 状态和日志留证。现有 API 镜像的 Dockerfile 已设置 `ENTRYPOINT ["java", "-jar", "/app/app.jar"]`，Job/CronJob 容器只设置 `args: ["--spring.main.web-application-type=none", "--report.run=true"]`，不再重复填写完整 Java 命令；若以后改动镜像 ENTRYPOINT，B 同步更新 A 的 CronJob 清单。成功退出 0，失败退出非零；需验证报告模式不会启动长期运行的 HTTP 服务。Job Pod 不需要 Service 或 Kubernetes 管理员凭据，并设置 `automountServiceAccountToken: false`。[Kubernetes Job 标签](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- 正式 CronJob 名为 `venue-report-daily`，采用 `schedule: "10 0 * * *"`、`timeZone: Asia/Shanghai`、`concurrencyPolicy: Forbid`、`startingDeadlineSeconds: 600`、`successfulJobsHistoryLimit: 3`、`failedJobsHistoryLimit: 2`；Job 模板使用 `backoffLimit: 1`、`activeDeadlineSeconds: 1800`、`REPORT_WINDOW_MODE=PREVIOUS_DAY`。短周期演示采用同名 CronJob 的临时覆盖，将周期改为每 2 分钟、模式改为 `TODAY`；先通过业务 API 创建当天测试预约，核对至少两次自动报告中的非零与零值场地，验收后恢复正式周期。现有业务 API 不允许创建过去日期的预约，故演示模式明确区别于正式统计窗口，执行时间选在远离北京时间午夜的时段。正式任务的调度时限保证它即使迟到或重试，仍在计划日期当天结束；缺失的调度不会被伪造成成功。`Forbid` 只限制**同一个 CronJob** 创建的 Job，不覆盖手动 Job；Kubernetes 也不保证恰好执行一次，因此同 ID 写入仍须幂等。[Kubernetes CronJob 文档](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)
- 数据库中的 `RUNNING/SUCCEEDED/FAILED` 描述执行程序已持久化的状态。Pod 被强制终止时，数据库记录可能停在 `RUNNING`；Kubernetes Job 状态、事件和日志负责证明这类终止。API 不拥有集群管理权限，因此不能凭数据库超时自动断言 Job 已失败；页面提供手动刷新，对长时间不变的 `RUNNING` 提示由维护者核对 Job，不展示伪造成功或失败。
- 如果 Pod 在写入 `report_runs` 前就退出，API 可能返回 `404 REPORT_NOT_FOUND`，但 Kubernetes Job 仍存在。这里的 `404` 只表示数据库没有该运行记录，不能作为 Job 不存在的证明；验收时需同时核对 Job 状态与日志。

### 2.5 节点任务与测试数据

`node-check` 每个符合调度条件的节点一个 Pod，从 Downward API 取得 `NODE_NAME`、`HOST_IP`，定期记录时间和对 `kubernetes.default.svc` 的 DNS 检查。它不依赖预约 API，也不挂载宿主机目录或使用特权；Pod 内部资源使用量不冒充节点指标。测试需对照可调度节点、DaemonSet 期望/就绪数及每个 Pod 的节点名。[Kubernetes Downward API 字段](https://kubernetes.io/docs/concepts/workloads/pods/downward-api/)

真实业务回归会创建持久数据，而现有 API 不提供删除场地/预约的接口。独立开发使用本地测试数据库；真实集群验收统一使用 `venue-booking` 命名空间，在测试数据中加入唯一批次标识，记录场地/预约 ID、时间与状态，并在报告核对时纳入这些记录。不能在未说明数据来源的情况下，把多次测试后的数据库当成空库；验收过程不得删除有真实证据的 PVC。

## 3. 已确定的设计选择与环境适配

以下选择是本组实现基线，A/B/C 按同一语义开发。环境实测值由 C 记录，A/B 核对其对各自资源的影响；不把未知环境值写成已验证事实。

| 范围 | 确定方案 | 理由与验收边界 |
| --- | --- | --- |
| 同窗口重复报告 | **每个不同 `job_id` 保存独立快照**；同一 ID 及同一来源/日期范围重复运行保持幂等。允许同一日期窗口有多个不同 ID 的报告，不设“每日唯一发布”键。 | 保留手动重跑和 CronJob 重复调度的可追踪记录；按 `job_id` 查询，报告中明确多个快照可能因后来预约/取消而不同。`Forbid` 负责防同一 CronJob 的重叠，同 ID 的数据库约束负责防重复明细。 |
| 异常终态 | 可捕获失败由执行程序写入 `FAILED`；Pod 强制终止、无法连接数据库或尚未写入记录时，以 Kubernetes Job 状态/事件/日志为准。API 只返回数据库已知状态，残留 `RUNNING` 和 404 均不推断 Job 终态。 | 满足任务 ID、开始及成功/失败的可追踪要求，同时不为 API/任务增设 Kubernetes 读取权限。验收需各覆盖一次成功和可捕获失败；异常终止用 Job 状态与页面提示演示。 |
| 正式与演示窗口 | 正式任务北京时间每日 00:10，`REPORT_WINDOW_MODE=PREVIOUS_DAY`；演示临时改为每 2 分钟、`REPORT_WINDOW_MODE=TODAY`，结束后恢复。两者均用同一报告程序和统计口径；`startingDeadlineSeconds: 600`、Job `activeDeadlineSeconds: 1800`、`backoffLimit: 1`。已有同 ID 记录时重试复用范围。 | 正式 Job 最晚在 00:20 创建，半小时内停止，避免首次落库前跨午夜导致统计日漂移。演示用当天通过 API 建立的预约核对非零值，避免为了生成测试数据直接改数据库；报告分别标注两种周期与日期模式。 |
| 时区与版本 | 基准清单使用 `spec.timeZone: Asia/Shanghai`；C 先核对集群支持情况。 | 该字段自 Kubernetes v1.27 稳定；若实验集群更旧，C 记录控制平面时区，A 提交等价的环境适配清单并验证实际触发时刻，不静默删除时区字段。[Kubernetes CronJob 文档](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/) |
| 数据库账号 | 本次实验 API、Flyway 与报告 Job 复用 `venue-db-credentials` 中的数据库账号；真实值仅在部署环境创建。Pod 默认不需要 Kubernetes API 凭据，显式关闭 ServiceAccount token 自动挂载。 | 避免新增初始化角色流程影响从空环境部署；报告如实说明账号共用，不宣称数据库最小权限。 |
| 迁移顺序 | 沿用 API 启动时执行 Flyway：数据库就绪后部署 API 两副本，确认迁移和两个 Pod 就绪，再启动手动 Job、CronJob。 | 保留现有构建和迁移入口；Flyway 对 PostgreSQL 使用锁协调并发迁移。若实测启动失败，先保留日志分析，不让报告 Job 抢先访问尚未建好的表。[Flyway PostgreSQL 锁文档](https://documentation.red-gate.com/flyway/reference/database-driver-reference/postgresql-database) |
| 健康检查 | API 显式启用 Actuator probes；startup/liveness 使用 `/actuator/health/liveness`，readiness 使用 `/actuator/health/readiness`，不把数据库检查加入 liveness。数据库用 `pg_isready`，前端检查本地 HTTP。阈值由 C 根据实测启动时间和节点容量定值。 | 避免数据库短时故障触发所有 API 副本反复重启；readiness 默认不包含外部依赖，因此数据库可用性仍须在联调中通过业务请求核验。[Spring Boot 3.4 探针说明](https://docs.spring.io/spring-boot/3.4/reference/actuator/endpoints.html) |
| 验收数据 | 独立开发用本地测试库；真实集群在 `venue-booking` 中使用唯一批次标识并记录 ID、时间、状态及预期统计值。 | 让业务回归、Job 结果与 PVC 重建证据对应同一部署，避免多份环境或遗留数据混淆。 |

**环境适配只填事实：**C 在部署前记录发行版/版本、可调度节点及污点、CPU/内存、StorageClass/PVC 访问模式、镜像拉取或装载方式、实际命名空间与访问入口；A/B 根据这些值调整各自清单中的镜像标识、资源额度和探针阈值。若没有动态供卷能力，C 选择课程环境支持且可验证 Pod 重建后数据保留的持久卷方案，并同步部署步骤。单节点环境只证明单节点 DaemonSet 覆盖；若 `timeZone` 不支持，按上表生成并验证适配清单。改变本节已确定的业务语义时，先共同修订契约、响应样例和验收项，再修改代码。

## 4. 联调与变更规则

1. **独立阶段**：A 用固定报告 JSON 完成页面、前端清单、CronJob/DaemonSet；B 用测试数据库完成 API、迁移、报告程序和 Job；C 准备集群、数据库、配置和部署检查。CronJob 可先静态检查，真实触发待报告镜像可用。
2. **集成顺序**：C 提供数据库、PVC、ConfigMap/Secret 与 Services → B 验证迁移、双 API Pod、手动 Job → A 验证前端、浏览器回归和 CronJob。DaemonSet 的调度与 DNS 检查可独立验证。
3. **完成证据**：每项保存集群/命名空间、镜像版本、资源名、命令、时间、响应或日志；业务成功、统计正确、多副本、持久化和节点覆盖分别核对。`kubectl apply` 成功或 Pod 处于 Running 不代替业务验收。
4. **契约变更**：提出者说明变更原因与影响面；受影响成员核对字段、清单、测试和报告；更新主契约与本文后再修改实现。共享文件按分工文档协作，避免并行覆盖。
