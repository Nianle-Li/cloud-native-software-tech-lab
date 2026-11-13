# Lab 2 需求与实现契约

状态：开发约定，尚非部署或验收记录。适用于本仓库的 Kubernetes 阶段；Lab 1 的业务接口和规则继续有效。要求来源为课程提供的《云原生软件技术-Lab2-场地预约系统Kubernetes工作负载编排.pdf》；工作负载概念参考课程《云原生软件技术05-容器编排Kubernetes.pdf》。课程文件不属于本仓库公共基线，成员通过课程渠道取得。任务书要求高于本文的方案选择。跨成员接口及确定的实现选择见 [并行开发公共契约](lab2-shared-contract.md)。改变公开接口、数据口径或资源拓扑时，同步修改实现、测试、本文及实验报告。

## 1. 必须满足的实验要求

| 范围 | 可验收结果 |
| --- | --- |
| 环境 | 记录实际 Kubernetes 发行版与版本、节点数和节点信息、镜像构建与装载方式。 |
| 业务迁移 | 保留场地列表/详情与创建、预约创建与冲突检查、预约列表/详情与取消；Compose 仍可复现 Lab 1。 |
| 工作负载 | 实际部署并解释 Deployment、StatefulSet；完成一次性 Job、定时 CronJob、节点级 DaemonSet 的实践与验证。 |
| 服务与配置 | 内部依赖通过 Service/DNS 访问；至少一个 ConfigMap、一个 Secret；不提交真实凭据，不把数据库端口无必要地对外暴露。 |
| 存储与扩展 | 用 PVC 或实验环境等价机制保留数据库数据；一个适合水平扩展的服务运行多个 Pod，证明不同副本实际处理请求。 |
| 交付 | 提交一份与真实配置及输出一致的实验报告，包含架构图、资源清单及理由、主要业务用例、三类任务结果、分工与问题解决；同时提交源码或仓库链接；按任务书在 **2026-11-23** 前提交至 elearning。 |

## 2. 本仓库的目标架构

| 组件 | 资源及副本 | 访问与状态 | 选择依据 |
| --- | --- | --- | --- |
| `frontend` | Deployment，初始 1 副本 | `frontend` Service 供浏览器或端口转发访问；Nginx 将同源 `/api/` 代理至 `api` Service | 静态页面和反向代理无业务持久状态；可扩展，但课程验证优先给 API 两副本。 |
| `api` | Deployment，初始 **2 副本** | `api` ClusterIP Service；从 ConfigMap/Secret 读数据库连接；不使用 Pod 本地业务数据 | 无状态 HTTP 层可水平扩展；预约冲突最终由共享数据库事务和场地行锁保证。 |
| `database` | StatefulSet，**1 副本** | `database-headless` 为 StatefulSet 提供稳定 Pod 身份，`database` ClusterIP Service 供 API/任务访问；PostgreSQL 使用 PVC | 需要持久数据和稳定身份；直接复制单主库 Pod 会产生写入/数据一致性问题，不按 API 的策略扩容。 |
| `report` | Job / CronJob | 使用同一个报告执行程序与数据库 Service；任务 Pod 不创建 Service | 一次性或周期性执行，结果持久保存而非留在 Job Pod 文件系统。 |
| `node-check` | DaemonSet | 每个符合调度条件的节点一个 Pod；无需 Service | 持续输出节点身份与检查结果，供节点级任务和调度验证。 |

目标命名空间为 `venue-booking`。常规资源清单放在 `k8s/base/`，手动 Job 模板放在 `k8s/jobs/`，短周期 CronJob 覆盖清单放在 `k8s/demo/`；真实 Secret 只由部署环境创建，不放入清单目录。README 按依赖关系列出应用顺序，**不对整个 `k8s/` 目录直接执行 `kubectl apply`**，以免误创建手动 Job 或启用演示周期。资源名称与本表保持一致；若环境不允许创建命名空间，则在记录实际命名空间的前提下调整。`frontend` 对外访问采用 `kubectl port-forward service/frontend 8080:80` 作为通用实验方式；如使用 NodePort/Ingress，需说明实际控制器和入口。`api`、`database` 不因演示而发布到集群外。集群内连接使用 Service 名称，不写 Pod IP。

以下名称和端口已作为三人并行开发的统一基线；调整任一项都要通知依赖方并修改清单与文档。

| 对象 | 约定 |
| --- | --- |
| Service | `frontend:80 → Pod:80`；`api:8080 → Pod:8080`；`database:5432 → Pod:5432`；`database-headless` 为 StatefulSet 的无头 Service。 |
| ConfigMap | `venue-config` 存 `POSTGRES_DB=venue_booking`、`PGDATA=/var/lib/postgresql/data/pgdata`、`SPRING_DATASOURCE_URL=jdbc:postgresql://database:5432/venue_booking` 等非敏感值；`frontend-nginx` 存 Kubernetes 专用代理配置。 |
| Secret | `venue-db-credentials` 存 `POSTGRES_USER`、`POSTGRES_PASSWORD`；API/报告容器分别将它们映射到 `SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD`。Git 不存真实 Secret。 |
| 镜像 | 同一轮部署使用可追踪的固定版本标签或摘要；报告容器复用该轮 API 镜像，Job/CronJob 不另复制一套业务统计逻辑；`node-check` 镜像须含实际使用的 DNS 工具。 |

### 容器与配置边界

- 复用现有前后端 Dockerfile 和 PostgreSQL 镜像；为实验环境构建、标记并加载可定位版本的镜像，清单引用可用的标签或摘要，不依赖节点本地偶然存在的 `latest`。
- 前端镜像现有 `frontend/nginx.conf` 使用 Docker 内部 DNS `127.0.0.11`。Kubernetes 部署须提供独立 Nginx 配置，保留 `/api` 原始路径和查询参数，目标为 `api:8080` Service；验证前端 Pod 能启动且代理请求能到达 API。静态 Service 名称可在 Nginx 启动时解析，Service 应先创建；若采用动态解析，则使用集群实际 DNS 地址，不写死 Docker 地址。
- ConfigMap 存放非敏感的数据库名/主机、运行环境、报告周期或 Nginx 配置；Secret 存放数据库账号/密码。Secret 清单只提交模板或生成说明，真实值在本地或部署环境注入。Kubernetes Secret 的编码不等于加密，不在日志、截图或报告中泄露其值。
- 数据库 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD` 与 API 的 `SPRING_DATASOURCE_*` 对齐；JDBC 主机使用 `database` Service。API、Flyway 与报告 Job 共用本次实验的数据库账号，真实值只在部署环境创建；不宣称数据库权限已分离。Flyway 继续是表结构唯一来源，已执行迁移新增版本，不改写旧版本。数据库就绪后让 API 两副本完成迁移与就绪，再启动报告 Job/CronJob；多副本启动行为须实测。
- 资源清单为持续运行 Pod 设置合理的 CPU/内存 requests、limits 和就绪/存活检查；数据库使用 `pg_isready`。API 显式启用 Actuator probes，startup/liveness 指向 `/actuator/health/liveness`，readiness 指向 `/actuator/health/readiness`，不把数据库检查放入 liveness；数据库可用性仍须以业务请求核对。阈值以实际环境测定，不把未测过的数值写成性能结论。无需 Kubernetes API 的 Pod 关闭 ServiceAccount token 自动挂载。
- PostgreSQL 16 容器将 PVC 挂载于 `/var/lib/postgresql/data`，并设置 `PGDATA=/var/lib/postgresql/data/pgdata`，使数据库文件位于卷内子目录，避免卷根目录自带文件影响首次初始化。StatefulSet 的 `volumeClaimTemplates` 为该 Pod 绑定独立 PVC，Pod 重建后复用同一声明。记录实际 StorageClass、容量、访问模式和 PVC 绑定情况；单节点本地卷不自动等于跨节点或跨机器灾备。删除 Pod 后查询原有场地/预约，证明数据保留；不通过删除 PVC 做日常重启。[PostgreSQL 官方镜像说明](https://github.com/docker-library/docs/blob/master/postgres/content.md)

## 3. 业务兼容与多副本证明

Lab 1 的七个业务接口、`snake_case` JSON、`ACTIVE/CANCELLED` 语义、`Asia/Shanghai` 时间规则、错误格式保持兼容，详见 [Lab 1 报告第 3 节](lab1-report.md#3-后端-api-与业务逻辑)。前端继续调用相对路径 `/api`。多副本运行时，创建预约仍须在数据库事务内锁定场地行、检查重叠并写入；两个 API Pod 并发提交同一时段，只能一个成功，另一个得到冲突响应。

为可重复证明请求确实到达不同 API Pod，新增只读 `GET /api/instance`，返回 `200` 与 `{"instance_id":"<pod-name>"}`；值由 Downward API 注入 `POD_NAME`，本地 Compose 运行时可回退到容器主机名。集群内测试客户端经 `api` Service 连续建立独立连接请求，保存至少两个不同实例标识；同时记录两个 Pod 的名称、就绪状态和相关日志。`kubectl port-forward service/api` 会选择单个 Pod，不能用该会话中的重复请求证明 Service 对两个副本分流。

## 4. 场地利用率报告契约

### 数据口径

- 报告范围为 `start_date`、`end_date` 两个 `YYYY-MM-DD` 日期，均包含端点；要求 `start_date <= end_date`。按 `reservation_date` 筛选，日期与定时窗口均按 `Asia/Shanghai` 解释。
- 仅统计生成时状态为 `ACTIVE` 的预约；`CANCELLED` 不算有效使用预约。每个场地均输出一行，包括 0 次预约的场地。`reservation_count` 为预约条数，`reserved_minutes` 为每条 `end_time - start_time` 的分钟数之和。字段表示**已预约**时长，不声称实际到场或使用率百分比。
- 生成时间点后的新增或取消不会自动改写既有成功报告；报告保留 `generated_at` 和范围。**每个不同 `job_id` 产生独立快照**，同一日期范围允许多个报告；同一 ID 重试不得重复明细或改变已成功的结果。定时同窗口再次触发时保留新的 Job ID，报告中说明多个快照可能不同。

### 执行与持久化

- 同一个执行程序由 Job 和 CronJob 调用。一次性 Job 从 `REPORT_START_DATE`、`REPORT_END_DATE` 环境变量获得日期范围；定时任务不传起止日期，正式任务用 `REPORT_WINDOW_MODE=PREVIOUS_DAY` 计算北京时间前一自然日，短周期演示用 `REPORT_WINDOW_MODE=TODAY` 统计当天，两种模式共享统计口径；同一 `job_id` 重试先读取已持久化的范围。来源由 `REPORT_SOURCE=MANUAL/SCHEDULED` 指定；缺失或无效参数须非零退出并在 Job 状态/日志留痕，已成功建立运行记录的可捕获失败还须保存脱敏的错误摘要。正式周期为北京时间每日 00:10，`concurrencyPolicy: Forbid`、`startingDeadlineSeconds: 600`、Job `backoffLimit: 1` 和 `activeDeadlineSeconds: 1800`；短周期演示临时覆盖同名 CronJob 为每 2 分钟并在验收后恢复正式周期。集群版本不支持 `timeZone: Asia/Shanghai` 时按[公共契约第 3 节](lab2-shared-contract.md#3-已确定的设计选择与环境适配)提供并验证环境适配清单。
- Kubernetes Job 名称作为 `job_id`，从 Pod 的 `batch.kubernetes.io/job-name` 标签注入 `REPORT_JOB_ID`；每次运行使用唯一名称。报告容器复用 API 镜像：镜像 ENTRYPOINT 已是 `java -jar /app/app.jar`，Job/CronJob 容器通过 `args: ["--spring.main.web-application-type=none", "--report.run=true"]` 进入一次性执行模式；成功退出码为 0，失败为非零。这也是后端交给清单编写者的启动接口。Job Pod 不接收 HTTP 流量，也不需要 Service 或集群级管理权限，通过数据库 Service 读取预约与场地；设置 `automountServiceAccountToken: false`。
- 新 Flyway 迁移建立 `report_runs`（`job_id` 唯一、来源 `MANUAL/SCHEDULED`、范围、`status`、开始/结束时间、错误摘要）和 `report_items`（`job_id + venue_id` 唯一、场地名称快照、次数、分钟数）等价结构。执行开始记 `RUNNING`；统计须基于一致的数据库快照或等价的单条聚合查询；成功以事务保存全部明细并记 `SUCCEEDED`；可捕获失败记 `FAILED`，并以非零退出码让 Job 失败。对同一 `job_id` 的重试须幂等，来源/范围冲突须失败且不覆盖旧结果。`FAILED` 可能仍有 Kubernetes 重试机会；Pod 被强制终止时以 Kubernetes Job 状态及日志辅助判断，不能把残留 `RUNNING` 误报为成功。
- 提供 `GET /api/reports/{job_id}` 读取报告运行状态、范围、时间和全部场地明细；不存在返回 `404`，待完成或失败时不返回伪造明细。报告结果持久保存在数据库 PVC 中，删除已完成 Job Pod 后仍能通过 API 查询。手动创建 Job 的参数化方式和命令写入 README，不能把模板占位符直接当真实凭据提交。
- CronJob 保留有限的成功/失败 Job 历史。Forbid 只防止同一 CronJob 同时运行，不保证跨手动 Job 的全局去重，也不能替代报告程序的幂等写入。相同 `job_id` 的重复执行由数据约束与事务防止重复明细。报告应验证至少两次自动触发，且任务来源、时间窗口、Kubernetes Job 名称与数据库记录对应。

报告查询响应保持现有 API 的 `snake_case` 风格，约定如下。`job_id` 匹配 `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`；前端与后端使用同一校验规则。`started_at`、`finished_at`、`generated_at` 未发生时为 `null`，发生后统一输出带 `+08:00` 偏移的 ISO 8601 字符串；`error_summary` 仅在已知失败时为非空字符串，`items` 在未成功时为空数组。无效 `job_id` 返回 `400 VALIDATION_ERROR`，不存在返回 `404 REPORT_NOT_FOUND`；错误体沿用现有 `{"error":{"code":"...","message":"..."}}` 结构。

```json
{
  "job_id": "venue-report-20261106-001",
  "source": "MANUAL",
  "start_date": "2026-11-01",
  "end_date": "2026-11-06",
  "status": "SUCCEEDED",
  "started_at": "2026-11-07T00:10:00+08:00",
  "finished_at": "2026-11-07T00:10:03+08:00",
  "generated_at": "2026-11-07T00:10:03+08:00",
  "error_summary": null,
  "items": [
    {"venue_id": 1, "venue_name": "示例场地", "reservation_count": 2, "reserved_minutes": 180}
  ]
}
```

### 报告查询展示（本组附加方案）

任务书要求报告有可查询或可追踪的唯一标识、执行状态和持久化结果，并未要求新增前端页面。本组为便于展示和核对，提供一个只读的 `#/reports` 页面：成员从手动触发命令的输出或 Kubernetes Job 列表取得 `job_id`，在页面输入后调用 `GET /api/reports/{job_id}`，并在**同一页面**显示来源、日期范围、数据库已知状态、时间和各场地预约次数/分钟数。README 应写明取得 Job ID 的方法。页面不列出全部 Job、不创建 Job，也不需要浏览器访问 Kubernetes API。

`RUNNING` 显示等待和手动刷新，并提示长时间不变时由维护者核对 Job；`FAILED` 显示已记录的失败摘要，并说明任务可能仍会重试；`SUCCEEDED` 显示全部明细，包括零值场地。`404` 只表示数据库没有该运行记录，不证明 Kubernetes Job 不存在；断网和无效响应单独提示查询失败。页面不根据等待时长推断最终状态。前端先用约定的 JSON 样例完成类型、响应校验和交互测试，再与真实 API 联调。

## 5. DaemonSet 与资源证据

`node-check` 采用独立于预约业务的只读节点检查：在每个符合条件的节点定期记录由 Downward API 注入的 `NODE_NAME`、`HOST_IP`、时间，并检查集群内 `kubernetes.default.svc` 的 DNS 解析结果。它验证每节点都有检查进程及从该节点的 Pod 到集群 DNS 的连通性，**不把 Pod 内部资源指标冒称节点指标**。不挂载宿主机敏感目录、不授予特权或多余 RBAC。DNS 失败与节点自身故障须分开说明。单节点环境只能证明该节点运行了一个 Pod；要证明跨节点覆盖，需有多个可调度节点或如实说明环境限制。

验收证据至少包含：`kubectl get nodes -o wide`、命名空间资源与 Pod 分布、Service/Endpoints、PVC/PV、两个 API Pod 的实例响应、Job/CronJob 的运行状态及对应报告查询、DaemonSet 期望数/就绪数与各节点 Pod、数据库 Pod 重建前后业务记录。所有命令和截图应注明同一集群与命名空间，不把计划、模拟输出或其他环境结果写成实测。
