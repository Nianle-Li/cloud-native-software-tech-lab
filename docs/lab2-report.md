# 云原生软件技术 Lab 2 实验报告

## 1. 实验目标与系统概况

本实验将 Lab 1 的场地预约系统部署到 Kubernetes，保留场地管理、预约、冲突检查与取消等业务功能。在此基础上，新增预约统计报告和节点 DNS 检查任务，实践 Job、CronJob 与 DaemonSet。

本组采用 kind 集群。前端与 API 使用 Deployment，数据库使用 StatefulSet；报告任务和节点检查分别采用 Job、CronJob 与 DaemonSet。集群验证表明，前端业务与报告查询可用，CronJob 连续两次自动生成报告，DaemonSet 在两个可调度 worker 上均完成 DNS 检查。前端、CronJob 与 DaemonSet 已达到实验要求中的对应项目。

本组方案将一次性与定时报告统一为可按 Job ID 查询的持久化结果，并在页面呈现非零和零值统计；前端通过集群内 Service 访问 API，节点检查的脚本与就绪探针使用同一 DNS 目标，使页面、任务结果与资源状态便于核对。

### 1.1 Kubernetes 环境、版本、节点与镜像方式（C）

共同验收环境由 C 在 Apple Silicon Mac 上建立，使用 Docker Desktop 提供容器引擎，由独立 kind CLI 创建 `venue-lab2` 集群。所有验收命令显式指定 `--context kind-venue-lab2`，避免误操作其他本地集群。三个节点是同一宿主机中的容器，不代表三台物理机器。

| 项目 | 实际配置 |
| --- | --- |
| 宿主机 | macOS、ARM64，物理内存 18 GiB |
| Docker | Desktop 4.64.0 / Engine 29.2.1，分配 11 CPU、约 7.65 GiB 内存 |
| kind / kubectl | v0.33.0 / v1.34.1 |
| Kubernetes | 三节点均为 v1.34.11，容器运行时为 containerd |
| 节点镜像 | `kindest/node:v1.34.11@sha256:44e222ee2132dab25ff87301682f89eb82c7880ea3a1bf543bfe9708fd08d67d` |
| 常规验收命名空间 | `venue-booking` |
| 最终展示命名空间 | `venue-booking-final`，拥有独立 Secret、数据库和 PVC |

集群配置保存在 [cluster.yaml](../k8s/kind/cluster.yaml)。`venue-lab2-control-plane` 带 `node-role.kubernetes.io/control-plane:NoSchedule` 污点；`venue-lab2-worker` 与 `venue-lab2-worker2` 无污点。初始验证中三个节点均 Ready，业务及节点检查主要在两个 worker 上调度，原始版本、架构和污点见[环境证据](assets/lab2/kind-environment.json)。

自建镜像按 `linux/arm64` 构建，使用可追踪标签，并通过 `kind load docker-image <镜像:标签> --name venue-lab2` 装载到指定集群。使用 `--provenance=false --load` 的单平台构建避免本机多架构缓存导入时缺少内容摘要的问题；装载后核查各节点镜像及实际 Pod imageID，而非仅检查宿主机镜像列表。官方 PostgreSQL 镜像使用选定 ARM64 平台的归档装载。清单使用 `IfNotPresent`，内容改变时必须更换标签。

| 最终展示组件 | 固定镜像标签 |
| --- | --- |
| 前端 | `venue-booking-frontend:lab2-report-query-02` |
| API、手动报告与 CronJob | `venue-booking-api:lab2-20261113` |
| 节点检查 | `venue-booking-node-check:lab2-20261116-01` |
| 数据库 | `postgres:16.15-bookworm` |

最终前端与旧验收前端使用不同标签；各阶段的构建提交、摘要和节点装载记录分别保存，不将同名命名空间或相同标签作为同一次验收的充分证据。

### 1.2 系统架构图与组件通信路径（A、B、C）

```mermaid
flowchart LR
    Browser[浏览器] -->|端口转发| FrontendSvc[frontend Service :80]
    subgraph Cluster[venue-lab2 / venue-booking]
        FrontendSvc --> FrontendPod[frontend Deployment / Nginx]
        FrontendPod -->|同源 /api 代理| ApiSvc[api Service :8080]
        ApiSvc --> ApiPod1[api Pod 1]
        ApiSvc --> ApiPod2[api Pod 2]
        ApiPod1 -->|JDBC| DbSvc[database Service :5432]
        ApiPod2 -->|JDBC| DbSvc
        ManualJob[手动报告 Job] -->|JDBC| DbSvc
        Cron[CronJob 每日 / 演示] --> ScheduledJob[定时报告 Job]
        ScheduledJob -->|JDBC| DbSvc
        DbSvc --> DbPod[database-0 / StatefulSet]
        DbPod --> PVC[PVC / PostgreSQL 数据]
        Config[venue-config ConfigMap] -.-> ApiPod1
        Config -.-> ApiPod2
        Config -.-> ManualJob
        Config -.-> ScheduledJob
        Config -.-> DbPod
        Secret[venue-db-credentials Secret] -.-> ApiPod1
        Secret -.-> ApiPod2
        Secret -.-> ManualJob
        Secret -.-> ScheduledJob
        Secret -.-> DbPod
        Nodes[node-check DaemonSet] --> Worker1[worker 1 DNS 检查]
        Nodes --> Worker2[worker 2 DNS 检查]
    end
```

图示为已验收的 `venue-booking` 工作负载和访问路径：两个 API Pod 与手动/定时 Job 通过数据库 Service 读写同一 PostgreSQL；Job/CronJob 共用 API 镜像，但报告 Pod 不提供 HTTP Service。节点检查独立运行在两个可调度 worker。`venue-booking-final` 是用于最终展示的独立命名空间，须以该命名空间自身的资源、Job 和页面证据复核，不能把上图的历史实测直接移作其验收结果。图与最终提交版由 A、B、C 共同复核。

### 1.3 系统运行与访问方式

系统的常规资源部署在 kind 集群 `venue-lab2` 的 `venue-booking` 命名空间。资源就绪后，在承载集群的主机上执行：

```sh
kubectl --context kind-venue-lab2 -n venue-booking port-forward service/frontend 8080:80
```

随后从该主机的浏览器访问 `http://127.0.0.1:8080/`。前端经 `api` Service 调用业务接口；API 和报告任务通过 `database` Service 访问数据库，内部服务无需直接对外开放。

场地与预约操作在前端完成。一次性报告通过 `scripts/create-report-job.py` 创建 Kubernetes Job，定时报告由 CronJob 自动生成；报告保存后，可在 `#/reports` 页面输入 Job ID 查询。DaemonSet 则在符合调度条件的节点持续执行 DNS 检查。

图 1—4 来自 `venue-booking-demo`，图 5—6 来自 `venue-booking-final`，均展示可读场地数据。常规命名空间 `venue-booking` 的运行记录列于附录 A；各组结果分别对应其所在命名空间。

## 2. Kubernetes 资源设计与系统实现

本章按组件的依赖关系，说明资源选择、访问路径和任务配置。运行结果见第 3 章。

### 2.1 资源清单与选择依据

#### 2.1.1 数据库 StatefulSet、Service、ConfigMap、Secret 与 PVC（C）

| 资源类型 | 名称 | 用途与选择理由 |
| --- | --- | --- |
| Namespace | `venue-booking` / `venue-booking-final` | 分隔常规验收与最终展示的资源和数据；最终配置由 Kustomize 指定命名空间。 |
| StatefulSet | `database`，1 副本 | 管理有状态 PostgreSQL，提供稳定 Pod 身份并关联独立存储；不通过简单增加副本模拟数据库复制。 |
| Service | `database` | ClusterIP，提供内部 `5432` 端口，供 API 与报告任务访问。 |
| Service | `database-headless` | 无头 Service，为 `database-0` 提供稳定的 Pod DNS 身份。 |
| ConfigMap | `venue-config` | 保存数据库名、数据目录和 JDBC Service 地址等非敏感配置。 |
| Secret | `venue-db-credentials` | 保存数据库账号和密码，通过键引用注入容器。 |
| PVC | `postgres-data-database-0` | 由 volumeClaimTemplates 创建，数据库 Pod 重建后复用。 |

Service 的 selector 同时匹配 `app.kubernetes.io/name=venue-booking` 和 `app.kubernetes.io/component=database`，不会误选 API 或报告 Pod。数据库服务不发布 NodePort 或宿主机端口；组件连接使用 `database` Service，配置中不依赖临时 Pod IP。对应实现见[数据库 Services](../k8s/base/database-services.yaml)和[StatefulSet](../k8s/base/database-statefulset.yaml)。

#### 2.1.2 API Deployment、Service 与一次性 Job（B）

| 资源类型 | 资源名称 | 用途与选择理由 |
| --- | --- | --- |
| Deployment | `api` | 运行两个无状态 Spring Boot API Pod；数据库持久化预约和报告，多副本可共同处理请求。 |
| Service | `api` | ClusterIP，`8080 → 8080`；为前端 Nginx 提供稳定的内部访问名称。 |
| Job | `venue-report-manual-<唯一后缀>` | 按给定日期范围执行一次报告后退出；Job 名称同时作为持久化报告的 `job_id`，无需独立 Service。 |

API 与报告 Job 使用同一后端镜像，报告模式通过启动参数选择。报告表由 Flyway V4 迁移创建，不在 Job Pod 内保存结果。

#### 2.1.3 前端与周期、节点任务（A）

| 资源类型 | 资源名称 | 用途与选择理由 |
| --- | --- | --- |
| Deployment | `frontend` | 运行无状态前端与 Nginx 代理，持续提供页面服务。 |
| Service | `frontend` | 为浏览器访问提供稳定入口，端口转发至其 80 端口。 |
| ConfigMap | `frontend-nginx` | 保存集群内的 Nginx 代理配置，使 `/api/` 请求到达 API Service。 |
| CronJob | `venue-report-daily` | 定时执行报告程序；任务完成后退出，无须 Service。 |
| DaemonSet | `node-check` | 在每个可调度节点运行 DNS 检查 Pod，无须 Service。 |

前端和节点检查 Pod 均设置资源请求、上限和就绪探针；前端另设启动与存活探针。两者都不需要 Kubernetes API 凭据，因此关闭 ServiceAccount token 自动挂载。

浏览器通过 `frontend` Service 访问页面，Nginx 再将 `/api/` 请求转发至 `api` Service。组件之间使用稳定的 Service 名称；非敏感配置存于 ConfigMap，数据库凭据由 Secret 提供。

### 2.2 数据库、配置与 PVC 持久化（C）

PostgreSQL 使用 `postgres:16.15-bookworm`。ConfigMap 中的 `POSTGRES_DB=venue_booking` 与 JDBC 地址 `jdbc:postgresql://database:5432/venue_booking` 一致；PVC 挂载于 `/var/lib/postgresql/data`，`PGDATA=/var/lib/postgresql/data/pgdata` 将数据库文件放入卷内子目录。API 和报告任务使用同一数据库 Service 和凭据，业务数据与报告结果均保存在该数据库中。

Secret 由 [create-k8s-db-secret.py](../scripts/create-k8s-db-secret.py) 在内存中生成随机密码，经标准输入创建到指定命名空间；密码不写入仓库、镜像或执行回传。重复执行保留已有 Secret；若 PVC 已存在而 Secret 丢失，脚本拒绝重新随机生成，以免与已初始化数据库的密码不一致。修改初始化环境变量不会自动轮换数据库密码。Secret 的编码不等于加密，本实验共用数据库初始化账号，未实现应用、迁移和报告账号的权限分离。

| 存储项 | 实测配置 |
| --- | --- |
| StorageClass | `standard`，默认类 |
| provisioner | `rancher.io/local-path` |
| 绑定模式 | `WaitForFirstConsumer`，等待 Pod 调度后供卷 |
| PVC | 请求 1Gi、ReadWriteOnce，实际 Bound |
| 回收策略 | StorageClass 为 Delete；StatefulSet 的 whenDeleted/whenScaled 均为 Retain |

StatefulSet 的保留策略避免删除或缩容控制器时自动删除声明，但不保证手动删除 PVC 后仍保留数据。PV 具有本地节点关联，Pod 重建复用原卷；本实验只验证同一集群内 Pod 重建，不宣称跨节点、跨主机或删除 kind 集群后的恢复能力。

数据库 requests 为 100m CPU/128Mi，limits 为 500m CPU/512Mi。startup、readiness、liveness 均用本地 TCP `pg_isready`；另通过其他 worker 的客户端验证 Service/DNS 和真实认证连接。Pod 关闭 ServiceAccount token 自动挂载。资源值是实验配置，不作为吞吐或高可用性能结论。

Flyway 仍是表结构唯一来源，由 API 启动执行，C 不在数据库初始化目录另建业务表。C 在独立临时 PostgreSQL 中核对 B 的 V4：V1–V3 原文件未变、空库迁移和 V3 升级保留数据、报告主键、状态约束、非负统计及外键删除保护等共 52 项通过。其[原始记录](assets/lab2/v4-verification.json)属于独立验证，不替代共同集群中的 Flyway 启动记录。

### 2.3 后端 API、双副本与 Service（B）

`api` Deployment 设为两个副本，容器监听 8080；同名 ClusterIP Service 只选择 API Pod，不暴露数据库端口。浏览器的 `/api` 请求先经前端 Nginx，再由 `api` Service 转发。API 和 Job 使用 `venue-config` 中的 JDBC 地址连接 `database:5432`，用户名与密码由 `venue-db-credentials` Secret 注入，清单没有写入实际凭据或 Pod IP。

API Pod 的 `POD_NAME` 由 Downward API 提供；`GET /api/instance` 返回该标识，用于核对请求到达的副本。startup/liveness 与 readiness 分别访问 Actuator 的 `/actuator/health/liveness` 和 `/actuator/health/readiness`；数据库可用性另以真实业务 API 操作验证。每个 API Pod 请求 100m CPU、256Mi 内存，上限为 500m CPU、512Mi 内存，并关闭不需要的 ServiceAccount token 自动挂载。

数据库就绪后由 API 启动执行 Flyway V1–V4；JPA 使用 `ddl-auto=validate` 检查映射，不另行改写表结构。两个副本共享 PostgreSQL，预约创建在事务中先锁定场地行，再检查有效预约的半开时段重叠并写入；取消也按场地优先的锁顺序执行。这样同一场地时段的并发请求由数据库串行化检查，而不是依赖请求落在哪个 Pod。

### 2.4 前端与报告查询页面（A）

前端保留场地与预约页面，并新增 `#/reports` 查询入口。用户输入 Job ID 后，页面调用 `GET /api/reports/{job_id}`，显示任务状态、统计范围、执行时间及各场地的预约次数和分钟数。零预约场地仍显示为零值。页面只读取已保存的报告，不创建 Job，也不直接访问 Kubernetes API。

| 查询情况 | 页面反馈 |
| --- | --- |
| `RUNNING` | 显示运行中和刷新入口；长时间未更新时提示核对 Job，不自行推断任务结束。 |
| `SUCCEEDED` | 显示报告元数据和全部场地明细，包括零值行。 |
| `FAILED` | 显示错误摘要，并提示 Job 可能继续重试。 |
| 报告不存在、网络中断或响应结构无效 | 分别显示对应提示，避免把查询失败解释为任务失败。 |

页面校验 Job ID，并避免旧请求覆盖新查询结果。运行中、失败及请求异常由前端测试覆盖；集群中另验证了成功报告的实际查询。

Kubernetes 专用 Nginx 配置由 ConfigMap 提供，代理目标为 `api` Service。浏览器通过前端 Service 的端口转发访问系统；API 与数据库无需直接对外开放。

### 2.5 一次性报告 Job（B）

`scripts/create-report-job.py` 根据起止日期和当前 API 镜像生成唯一名称的手动 Job。Job 容器沿用 `java -jar /app/app.jar` 入口，附加 `--spring.main.web-application-type=none`、`--report.run=true`，不启动 HTTP 服务。Pod 标签 `batch.kubernetes.io/job-name` 经 Downward API 注入为 `REPORT_JOB_ID`，另传 `REPORT_SOURCE=MANUAL`、`REPORT_START_DATE` 和 `REPORT_END_DATE`；成功退出码为 0，失败为非零。模板配置 `parallelism=1`、`completions=1`、`backoffLimit=1`、`activeDeadlineSeconds=1800`，关闭 ServiceAccount token 自动挂载。

Flyway V4 新增 `report_runs` 和 `report_items`。每个 `job_id` 对应一条运行记录，每个 `(job_id, venue_id)` 对应一条明细；数据库约束限制状态、来源、日期范围和非负统计值。统计对每个场地都生成一行，只计报告生成时状态为 `ACTIVE` 的预约，以结束时间减开始时间得到 `reserved_minutes`。这一字段表示已预约分钟数，不表示实际到场时长或百分比。

执行程序先持久化 `RUNNING`，再用单条 PostgreSQL 聚合查询取得一致快照，最后在一个事务中写入全部明细与 `SUCCEEDED`。同一 ID 已成功时直接沿用原快照；失败或残留 `RUNNING` 可按同来源和日期范围重试。数据库唯一约束、行锁和 Job 参数共同防止同 ID 的并发执行产生重复明细。可捕获的生成异常会保存脱敏的 `FAILED` 摘要；若进程在写入记录前终止，需结合 Kubernetes Job 状态和日志判断，不能由报告查询接口推断失败。

### 2.6 定时报告 CronJob（A）

`venue-report-daily` 使用与一次性 Job 相同的报告程序。正式配置每日 00:10 统计前一日；短周期配置每 2 分钟统计当天，便于观察自动触发。两种配置只改变调度周期与统计窗口。

| 配置 | 正式模式 | 演示模式 |
| --- | --- | --- |
| `schedule` | `10 0 * * *` | `*/2 * * * *` |
| `timeZone` | `Asia/Shanghai` | `Asia/Shanghai` |
| `REPORT_WINDOW_MODE` | `PREVIOUS_DAY` | `TODAY` |
| `REPORT_SOURCE` | `SCHEDULED` | `SCHEDULED` |

每次触发生成独立 Job，其名称同时作为报告标识。`Forbid` 防止同一 CronJob 的任务重叠；补启动期限、重试次数和执行时长均受到限制。

CronJob Pod 通过 `database` Service 读取预约数据，结果由报告程序持久保存。`Forbid` 只约束同一 CronJob 的并行执行；同一报告任务的重复执行由报告程序处理。

### 2.7 节点 DNS 检查 DaemonSet（A）

`node-check` 采用 DaemonSet，使每个符合调度条件的节点运行一个检查 Pod。脚本定期记录节点名称、宿主机地址和集群 DNS 解析结果；readiness 探针检查同一 DNS 名称，使就绪状态与任务结果一致。该任务无需 Service、特权容器或宿主机目录挂载。

集群中的两个 worker 可调度，control-plane 带 `NoSchedule` 污点。因此本实验的节点覆盖范围为两个 worker。

## 3. 系统使用与实验结果

本章展示业务操作和各类工作负载的运行结果。对应的命令输出与数据记录列于附录。

### 3.1 命名空间资源总览与配置核对（C）

共同集群的常规验收使用 `venue-booking`。资源类型及责任边界为：API 双副本和前端单副本 Deployment、数据库单副本 StatefulSet、报告 Job/CronJob、两个 worker 的 node-check DaemonSet，以及内部 Services、ConfigMaps、Secret 和 PVC。C 先交付数据库与配置，再按 B/A 指令执行部署，保存阶段输出；不同日期的资源快照不合并冒称一次瞬时状态。

11 月 19 日 B/C 补充验收结束时，原命名空间数据库与业务资源的状态保存在[资源快照](assets/lab2/b-acceptance-20261119-182919/final-status.txt)。后端专项结果由 B 章节说明；数据库重建保留数据的结果见 3.4。

同日，C 从 `develop@dfde6c8` 在 `venue-booking-final` 新建独立展示环境，使用 [Kustomize 最终配置](../k8s/final/kustomization.yaml)。渲染后检查所有命名空间资源的目标，server dry-run 通过后部署；数据库、双 API、前端均就绪，DaemonSet 在两个 worker 就绪，PVC Bound。新旧命名空间的 PVC UID/PV 名称不同，旧环境的资源 spec/UID 前后未变；[最终资源快照](assets/lab2/final-display-20261119-185539/final-status.txt)及[执行记录](assets/lab2/final-display-20261119-185539/execution.json)保存了镜像、节点和配置核对结果。

写数据前先确认前端的 `/api/instance` 属于最终命名空间、数据库只有三个初始场地且无预约，再运行一次展示数据脚本。最终为五个场地、七条预约，其中六条 ACTIVE、一条 CANCELLED。手动报告 Job `venue-report-manual-20261119105626-364bf7` 统计 2026-11-21：羽毛球馆 A 2 次/150 分钟、多功能教室 B 1 次/120 分钟、排练室 D 2 次/150 分钟，其余为零，API 与页面一致。

该次脚本在 16:00 后执行，返回定时样例日期 2026-11-20。记录截止时，最终命名空间的两次短周期自动报告与三 Job 联合核对未执行；保留正式每日 00:10、PREVIOUS_DAY 配置。第 3.7 节已有的自动触发证据来自旧验收命名空间，不能直接改记为最终命名空间的结果。最终页面仅作只读核对，前后五场地、七预约内容一致，未在展示库运行随机数据回归。

当前共同环境的[手动报告截图](assets/lab2/final-display-20261119-185539/final-manual-report.png)与报告原有样例图统计相同，但 Job ID 和生成时间不同；图片来源需连同命名空间、宿主机和 Job ID 一起核对，不能仅凭相同场地名称或统计值认定为同一次执行。

### 3.2 场地与预约业务流程（A）

用户可按“浏览或创建场地 → 创建预约 → 查询记录 → 取消预约”的顺序完成业务操作。集群中的浏览器回归覆盖了这一流程，也验证了重复预约同一时段时的冲突反馈。页面请求经前端 Service 到达真实 API。

图 1 展示场地概览；图 2、3 对应同一场地时段的成功预约与再次提交时的冲突反馈；图 4 展示另一笔预约取消后的详情。画面用于说明交互方式；业务回归的原始结果见附录。创建表单、场地详情及预约列表等补充画面见附录 D。

<figure>
  <img src="附件/场地概览.png" alt="场地概览显示五个场地及开放、停用数量" width="75%">
  <figcaption>图 1 场地概览与各场地的状态、位置、开放时段和容量。</figcaption>
</figure>

取消后的预约保留状态和取消时间，便于追溯。

<figure>
  <img src="附件/预约提交成功.png" alt="小型会议室 E 的预约提交成功提示" width="75%">
  <figcaption>图 2 预约创建成功，页面返回预约编号。</figcaption>
</figure>

<figure>
  <img src="附件/重叠时段冲突.png" alt="重复预约同一时段时的冲突提示" width="75%">
  <figcaption>图 3 重复提交已占用时段时，页面显示预约冲突和对应时段。</figcaption>
</figure>

<figure>
  <img src="附件/已取消预约详情.png" alt="已取消预约的详情显示取消状态及时间" width="75%">
  <figcaption>图 4 已取消预约的状态与取消时间。</figcaption>
</figure>

### 3.3 API 双副本、Service 分流与并发预约（B）

在 `venue-booking` 共同集群中，两个 API Pod 均为 `1/1 Ready`，分别位于 `venue-lab2-worker` 和 `venue-lab2-worker2`。先前通过 `api` Service 建立独立连接，`GET /api/instance` 返回过两个不同 Pod 标识，证明同一 Service 能将请求交给两个副本；单个 Service 端口转发连接未被用作分流证据。

2026-11-19 的定向并发验收分别端口转发到两个 API Pod，两个 `/api/instance` 响应与 Pod 名称一一对应。C 创建唯一场地 ID `7`，对 `2026-12-19 10:00–11:00` 同时提交两份相同预约：一个返回 **201**、预约 ID `4`；另一个返回 **409 `TIME_CONFLICT`**。随后查询该场地仅有一条 `ACTIVE` 预约。此结果验证了两个副本同时访问同一数据库时的冲突保护；原始响应和 Pod 分布见附录 B。

### 3.4 数据库 Pod 重建与业务数据保留（C）

11 月 19 日，C 在 `kind-venue-lab2 / venue-booking` 完成真实业务持久化验收。使用 B/C 本批新建场地 ID 7、有效预约 ID 4，以及报告 `venue-report-manual-20261119102922-01fd83`，先通过 API 保存三个对象和数据库 Pod/PVC 状态。确认无活动 Job 后，只删除 `database-0` Pod，由 StatefulSet 复用原 PVC 恢复；数据库就绪后继续以业务请求确认连接恢复，再查询相同 ID。

| 比较项 | 重建前后结果 |
| --- | --- |
| 数据库 Pod UID | 改变，确认实际创建了新 Pod |
| PVC UID、绑定 PV | 保持不变，PVC 为 Bound |
| 场地 ID 7 | 完整 API JSON 一致 |
| 预约 ID 4 | 完整 API JSON 一致，仍为 ACTIVE |
| 指定报告 Job ID | 完整 API JSON 一致，仍为 SUCCEEDED，时间与明细保留 |

比较使用 `cmp`，三个响应均退出 0，Pod/PVC 标识断言通过。原始 [rollout](assets/lab2/b-acceptance-20261119-182919/database-rollout.txt) 与[验证输出](assets/lab2/b-acceptance-20261119-182919/04-business-persistence.txt)记录了恢复过程；响应和前后对象链接见附录 C。Secret 元数据未变化，API/前端未重新部署，未删除 StatefulSet、PVC、PV、Secret、节点或集群。

该结果补充了早期临时探针数据的保留测试，直接证明场地、预约和数据库内报告能在 PostgreSQL Pod 重建后保留；范围是旧验收命名空间，不是最终展示库重建，也不代表数据库复制、跨节点灾备或宿主机故障恢复。

### 3.5 一次性报告 Job 的执行、持久化与失败重试（B）

首次手动 Job `venue-report-manual-20261116033534-9f4175` 在历史日期窗口完成，容器退出码为 0；API 返回 HTTP 200、`SUCCEEDED`，三个当时存在的场地均为零值。后来 A 在同一集群创建了有效与已取消预约。C 于 2026-11-19 使用新 Job `venue-report-manual-20261119102922-01fd83` 统计 `2026-11-16`，B 随后核对原始证据：Job 为 `Complete`、退出码 0，API 返回七条场地明细。场地 ID `4` 为 **1 次、30 分钟**，其余六条为零值；其中已取消预约不计入。报告的日期和统计值对应本次数据库状态，不将旧报告解释为随业务变化自动更新。

为验证幂等，C 保存该 Job 的状态、Pod 日志和完整报告响应，只删除**本轮新建**的 Job 及 Pod，再用相同 ID、来源、日期重建。删除后报告仍可通过 API 查询；重建 Job 再次 `Complete`、退出码 0，前后 JSON（含 `generated_at` 与全部明细）完全一致。只读 SQL 核对该 ID 在数据库中仍只有 1 条 `report_runs`、7 条 `report_items`。数据库 Pod 随后重建，报告响应保持一致；业务数据与 PVC 的前后原始记录见[交接回传](lab2-handoff.md)，由 C 在第 3.4 节归纳。

可捕获异常的 `FAILED →` 同 ID 重试由**隔离的 Testcontainers PostgreSQL 集成测试**验证：在聚合阶段注入异常后，运行记录变为 `FAILED`、错误摘要脱敏、明细为空；随后同 ID 重试成功。`ReportIntegrationTest` 六项全部通过，完整后端回归 21 项全部通过。共同集群没有注入该异常，因此本实验不声称观察到了集群中的 `FAILED` Job；参数错误或数据库不可达导致的非零退出也不冒充已落库的 `FAILED`。

### 3.6 报告查询页面（A）

报告查询页通过 Job ID 读取已持久化的结果。集群验证中，页面显示任务成功；有预约的场地为 **1 次、30 分钟**，无预约的场地为 **0 次、0 分钟**，与 API 返回值一致。已取消预约未计入统计。

图 5 展示另一份报告的查询结果。羽毛球馆 A 与排练室 D 均为 2 次、150 分钟，多功能教室 B 为 1 次、120 分钟；会议室 C 与小型会议室 E 均为零值。报告表示已预约时长，不代表实际到场时间或场地使用率。

运行中、失败和请求异常等页面反馈已由前端测试验证；这些状态不作为集群中的实际任务结果。

<figure>
  <img src="附件/手动报告查询页面.png" alt="一次性报告查询页面显示五个场地的预约次数与分钟数" width="75%">
  <figcaption>图 5 一次性报告的查询结果，显示不同场地的非零与零值统计。</figcaption>
</figure>

### 3.7 定时报告 CronJob 的自动执行（A）

短周期配置下，CronJob 连续自动创建了两个 Job。父资源记录表明两次执行均由 `venue-report-daily` 调度；报告来源均为 `SCHEDULED`，状态均为 `SUCCEEDED`。

| 自动执行 | 报告状态 | 有预约场地 | 零预约场地 |
| --- | --- | --- | --- |
| 第一次 | `SUCCEEDED` | 1 次、30 分钟 | 0 次、0 分钟 |
| 第二次 | `SUCCEEDED` | 1 次、30 分钟 | 0 次、0 分钟 |

两份报告均正确保留非零值和零值场地，且与数据库聚合结果一致。自动创建关系、报告结果与数据库聚合记录见附录 A。

图 6 展示另一组自动报告的页面查询结果：小型会议室 E 为 **1 次、60 分钟**，其余四个场地均为零值。

<figure>
  <img src="附件/定时报告查询页面.png" alt="自动报告查询页面显示五个场地，小型会议室 E 为一次六十分钟，其余场地为零值" width="75%">
  <figcaption>图 6 自动报告的查询结果，包含非零值和零值场地。</figcaption>
</figure>

正式配置采用北京时间每日 00:10 统计前一日，并已恢复到集群中。上述自动触发结果来自短周期配置；正式周期的跨日触发未纳入本次验证。

### 3.8 DaemonSet 的节点覆盖与检查结果（A）

`node-check` 在两个可调度 worker 上各运行一个 Pod，DaemonSet 的期望数与就绪数均为 **2**。两个 Pod 的 DNS 检查结果均为 `dns=ok`。

| 节点 | Pod 就绪 | DNS 检查 |
| --- | --- | --- |
| `venue-lab2-worker` | 1/1 | `dns=ok` |
| `venue-lab2-worker2` | 1/1 | `dns=ok` |

control-plane 带 `NoSchedule` 污点，不在本清单的覆盖范围内。因此“每节点一个 Pod”对应当前两个可调度 worker，而非集群中的全部节点。

## 4. 小组分工与问题解决

### 4.1 李佳凝：前端、CronJob 与 DaemonSet（A）

李佳凝负责前端与报告查询页面、前端 Deployment 和 Service、CronJob 及 DaemonSet。相应的运行结果见第 3 章。

节点检查最初出现“两个 Pod 已调度、均未就绪”的问题。脚本和就绪探针查询的短名称 `kubernetes.default.svc` 在两个 worker 上均返回 `NXDOMAIN`，而完整名称 `kubernetes.default.svc.cluster.local` 可以解析，故障由查询目标引起。

将脚本与就绪探针统一改为查询完整名称后，两个 Pod 均恢复就绪，日志均显示 `dns=ok`。修复前后的资源状态与日志保存在附录所列记录中。

### 4.2 张玳瑗：后端 API、一次性 Job 与并发问题（B）

张玳瑗负责沿用 Lab 1 的预约 API 与事务规则，新增 Flyway V4 报告表、统计程序、报告查询和实例标识接口，以及双副本 API 与手动 Job 清单。后端镜像同时供 API、手动 Job 和 CronJob 使用；与 A 对齐启动参数及报告 JSON，与 C 对齐迁移约束、Secret 引用和共同集群执行顺序。

多副本的关键问题是两个 Pod 可能同时接受同一时段预约。B 保留场地行悲观锁、有效预约重叠查询与插入同事务的处理；C 在不同 Pod 上同时提交请求后，实测只产生一条有效预约。报告任务的关键问题是 Job Pod 删除或重试不能丢失、复制或改写成功结果。B 将报告写入数据库，并用唯一键、行锁和同 ID 成功短路保护快照；C 的同 ID 重建与数据库 Pod 重建验收均保留了相同结果。可捕获失败的 `FAILED` 状态通过 B 的隔离集成测试验证，集群验收与本地测试在报告中分别标注。

### 4.3 吴柯蝶：集群、数据库与存储问题（C）

吴柯蝶负责共同 kind 环境、数据库与持久化资源、配置和 Secret 创建方式，独立复核 V4 约束及迁移，并维护部署步骤和证据。共同集群承载于 C 的 Mac，A/B 提供代码、清单与命令，C 按交接文件代执行并回传，功能负责人核对结果；不将代执行写成其他成员在该主机亲自操作。

环境准备阶段曾启用 Docker Desktop 内置 kubeadm 单节点。小组明确采用 kind 后，C 改用独立 CLI 和固定节点镜像建立三节点环境；此前 kubeadm 的存储和镜像结果未混作 kind 验收。通过显式 context、命名空间和批次记录避免多个本地环境混淆。

镜像分发阶段，直接装载已有多架构缓存曾报告缺少内容摘要。自建镜像改用单平台 ARM64 构建并关闭 provenance；官方 PostgreSQL 按 ARM64 导出归档再装载，随后检查节点缓存和实际运行 Pod。该处理修复镜像分发，不通过更改业务代码掩盖环境问题。

存储采用先核实 StorageClass、再部署 PVC、最后验证数据的顺序。先用独立探针检查供卷与跨 worker 连接，再用真实场地、预约和报告验证数据库重建保留。临时探针 schema 和客户端已清理，验收业务数据及历史报告保留供复核。最终展示另建命名空间和 PVC，以免随机测试记录混入可读样例。

C 完成了 kind 及数据库配置、迁移约束复核、镜像装载与 A/B 指令代执行、业务持久化和最终展示首轮核验。执行失败时保存命令、状态与日志，再由对应负责人修复；如节点检查问题的修复及复测见 4.1 和附录 A。未执行的最终定时展示步骤保持未验证状态。

### 4.4 小组联合复核（A、B、C）

## 5. 项目总结

本实验将场地预约系统部署到 Kubernetes，按组件特征组合 Deployment、StatefulSet、Job、CronJob 和 DaemonSet。集群中的前端业务和报告查询可用；短周期 CronJob 连续两次生成成功报告，DaemonSet 在两个可调度 worker 上均通过 DNS 检查。正式 CronJob 的跨日触发未纳入本次验证。

## 附录：运行证据与补充界面

### A. 前端、CronJob 与 DaemonSet（A）

下表列出支撑第 3、4 章结论的关键原始记录。

| 验证环节 | 核实结果 | 原始记录 |
| --- | --- | --- |
| 前端业务 | 前端完成部署；场地、预约、冲突和取消的浏览器回归通过。 | [部署就绪](assets/lab2/a-execution-20261116-123004/frontend-rollout.txt)、[浏览器回归](assets/lab2/a-execution-20261116-123004/browser-cluster-regression.txt) |
| 报告查询 | 页面可查询手动与定时报告；非零值和零值与 API 结果一致。 | [三个 Job 的页面核对](assets/lab2/a-execution-20261116-123004/report-browser-checks.json)、[报告页面回归](assets/lab2/a-daemonset-retest-20261116-154006/report-f7-browser.txt)、[对应 API 响应](assets/lab2/a-daemonset-retest-20261116-154006/report-f7-api-response.json) |
| CronJob 自动执行 | 两个 Job 均由同一 CronJob 创建，报告成功且统计结果与数据库聚合一致。 | [Job 父资源](assets/lab2/a-execution-20261116-123004/cronjob-observed-jobs.json)、[首次报告](assets/lab2/a-execution-20261116-123004/venue-report-daily-29913392-report.json)、[第二次报告](assets/lab2/a-execution-20261116-123004/venue-report-daily-29913394-report.json)、[SQL 聚合](assets/lab2/a-execution-20261116-123004/today-sql-totals.txt) |
| CronJob 正式配置 | 配置为每日 00:10；跨日触发不在本次验证范围内。 | [验收配置](assets/lab2/a-execution-20261116-123004/cronjob-final-json.txt) |
| DaemonSet 节点检查 | 两个 worker 各有一个就绪 Pod，两份日志均为 `dns=ok`。 | [资源状态](assets/lab2/a-daemonset-retest-20261116-154006/daemonset-after.txt)、[Pod 分布](assets/lab2/a-daemonset-retest-20261116-154006/pod-distribution-wide.txt)、[两节点日志](assets/lab2/a-daemonset-retest-20261116-154006/combined-logs.txt) |
| DNS 问题定位 | 两个 worker 的短名称查询均失败，完整名称均可解析。 | [原日志：worker 1](assets/lab2/a-execution-20261116-123004/node-check-log-0.txt)、[原日志：worker 2](assets/lab2/a-execution-20261116-123004/node-check-log-1.txt)、[完整名称：worker 1](assets/lab2/a-execution-20261116-123004/node-check-fqdn-0.txt)、[完整名称：worker 2](assets/lab2/a-execution-20261116-123004/node-check-fqdn-1.txt) |

### B. 后端 API 与一次性 Job（B）

| 验证环节 | 核实结果 | 原始记录 |
| --- | --- | --- |
| API 两副本与 Service | 两个 Pod 分布在两个 worker；经 `api` Service 的独立连接出现两个实例标识。 | [Pod 分布](assets/lab2/b-execution-20261116-113439/api-pods-wide.txt)、[三次实例响应](assets/lab2/b-execution-20261116-113439/instance-0.txt)、[C 本轮 Pod 状态](assets/lab2/b-acceptance-20261119-182919/api-pods.txt) |
| Flyway 迁移 | 共同集群的 V1–V4 均成功。 | [迁移版本](assets/lab2/b-execution-20261116-113439/flyway-version.txt)、[API 启动日志](assets/lab2/b-execution-20261116-113439/api-startup-0.txt) |
| 双 Pod 并发预约 | 同场地同一时段得到 201 与 409 `TIME_CONFLICT`，仅保留一条有效预约。 | [两份响应与实例 ID](assets/lab2/b-acceptance-20261119-182919/01-concurrent-booking.txt)、[测试数据 ID](assets/lab2/b-acceptance-20261119-182919/business-ids.json) |
| 手动 Job 与报告查询 | 两次同名 Job 均完成，退出码均为 0；报告为 `SUCCEEDED`。 | [首次 Job/Pod](assets/lab2/b-acceptance-20261119-182919/report-first-job.json)、[重建 Job/Pod](assets/lab2/b-acceptance-20261119-182919/report-retry-pods.json)、[报告响应](assets/lab2/b-acceptance-20261119-182919/report-before.json) |
| 报告持久化与幂等 | 原 Job Pod 删除后仍可查询；同 ID 重试快照不变，数据库为 1 条运行记录、7 条明细。 | [删除后响应](assets/lab2/b-acceptance-20261119-182919/report-after-pod-delete.json)、[重试后响应](assets/lab2/b-acceptance-20261119-182919/report-after-retry.json)、[行数核对](assets/lab2/b-acceptance-20261119-182919/report-row-count.txt) |
| 可捕获失败与回归 | 隔离报告测试 6/6、完整后端回归 21/21；集群中未注入 `FAILED`。 | [报告测试原始输出（gzip）](assets/lab2/b-tests-20261119/report-integration-maven.txt.gz)、[完整回归原始输出（gzip）](assets/lab2/b-tests-20261119/backend-suite-maven.txt.gz) |

上述两份 gzip 文件解压后为未改写的 Maven 输出；可用 `gzip -dc <文件名>` 阅读。B/C 共同集群验收的执行时间、实际命令、退出码和更多状态记录见[交接记录](lab2-handoff.md)。

### C. 集群、数据库与存储（C）

| 验证内容 | 结果与范围 | 原始记录 |
| --- | --- | --- |
| kind 环境与存储发现 | 三节点版本、架构、污点、StorageClass 及临时供卷检查通过 | [环境 JSON](assets/lab2/kind-environment.json)、[环境说明](lab2-environment.md) |
| 数据库基础设施 | 跨 worker 认证连接、稳定服务发现和探针数据保留检查通过；临时 schema/客户端已清理 | [数据库记录](assets/lab2/database-infrastructure.json) |
| V4 独立复核 | 临时 PostgreSQL 中 52 项通过，不作为共同集群实测替代 | [验证结果](assets/lab2/v4-verification.json)、[验证脚本](../scripts/verify-report-schema.py) |
| 真实业务持久化 | venue-booking 中场地、预约、报告在数据库 Pod 重建后响应不变 | [实际命令](assets/lab2/b-acceptance-20261119-182919/04-business-persistence.sh)、[比较输出](assets/lab2/b-acceptance-20261119-182919/04-business-persistence.txt) |
| Pod/PVC 身份 | Pod UID 改变，PVC/PV 保持 | [Pod 前](assets/lab2/b-acceptance-20261119-182919/database-pod-before.json)、[Pod 后](assets/lab2/b-acceptance-20261119-182919/database-pod-after.json)、[PVC 前](assets/lab2/b-acceptance-20261119-182919/database-pvc-before.json)、[PVC 后](assets/lab2/b-acceptance-20261119-182919/database-pvc-after.json) |
| 场地与预约响应 | 相同 ID 的完整 JSON 一致 | [场地前](assets/lab2/b-acceptance-20261119-182919/venue-before.json)、[场地后](assets/lab2/b-acceptance-20261119-182919/venue-after.json)、[预约前](assets/lab2/b-acceptance-20261119-182919/reservation-before.json)、[预约后](assets/lab2/b-acceptance-20261119-182919/reservation-after.json) |
| 报告响应 | 相同 Job ID、生成时间和明细不变 | [报告前](assets/lab2/b-acceptance-20261119-182919/report-persistence-before.json)、[报告后](assets/lab2/b-acceptance-20261119-182919/report-persistence-after.json) |
| 最终展示部署 | 独立 PVC，资源就绪；五场地、七预约、手动报告及只读页面通过 | [执行记录](assets/lab2/final-display-20261119-185539/execution.json)、[资源状态](assets/lab2/final-display-20261119-185539/final-status.txt)、[种子输出](assets/lab2/final-display-20261119-185539/seed-result.json)、[只读页面核对](assets/lab2/final-display-20261119-185539/readonly-browser-checks.json) |
| 最终展示手动报告 | 2026-11-21 窗口的五条统计与预期一致 | [API 响应](assets/lab2/final-display-20261119-185539/manual-report.json)、[共同环境截图](assets/lab2/final-display-20261119-185539/final-manual-report.png) |
| 最终定时展示 | 本次未执行，不纳入通过结论 | [保留的日期与后续步骤](assets/lab2/final-display-20261119-185539/resume-tomorrow.json) |

C 的结果来自不同阶段，各条按其命名空间、时间和源码提交归档。隔离测试、旧验收环境、最终展示环境的证据分别使用，未将缺失测试或计划输出记作实际成功。

### D. 业务页面补充图

以下画面补充展示表单、场地详情、已占用时段和预约列表。

<figure>
  <img src="附件/创建场地表单.png" alt="创建场地表单及名称、位置、容量和时间字段" width="60%">
  <figcaption>图 7 创建场地表单包含名称、位置、容量和开放时段等输入项。</figcaption>
</figure>

<figure>
  <img src="附件/场地详情.png" alt="排练室 D 的场地详情" width="60%">
  <figcaption>图 8 排练室 D 的场地详情与预约入口。</figcaption>
</figure>

<figure>
  <img src="附件/预约表单与已预约时段.png" alt="羽毛球馆 A 的预约表单和两个已预约时段" width="60%">
  <figcaption>图 9 羽毛球馆 A 的预约表单显示两个已占用时段。</figcaption>
</figure>

<figure>
  <img src="附件/预约记录列表.png" alt="预约列表显示七条记录、状态筛选和分页" width="60%">
  <figcaption>图 10 预约记录列表展示状态筛选、记录内容与分页。</figcaption>
</figure>
