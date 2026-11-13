# Lab 2 三人分工与开发顺序

本文给出本组 Lab 2 的协作方案。三人分别负责前端与周期/节点任务、后端与一次性任务、集群与有状态部署；每人都要完成配置或代码、独立验证和报告证据。业务与技术边界见 [Lab 2 契约](lab2-contract.md)，跨成员接口见[公共契约](lab2-shared-contract.md)，最终验收项见 [Lab 2 验收清单](lab2-acceptance.md)。实验环境确定后，按实际阻塞和剩余任务调整协作安排。

## 1. 交付责任

| 成员 | 负责实现 | 负责验证与报告内容 | 主要文件 |
| --- | --- | --- | --- |
| A：前端与周期/节点任务 | 报告查询页面及响应校验；前端 Kubernetes Nginx ConfigMap、Deployment/Service；报告 CronJob；节点 DNS 检查 DaemonSet；可指向集群入口的浏览器端到端回归。保留 Lab 1 前端业务。 | 报告页运行中、成功、失败和异常状态；在真实集群入口验证场地、预约、冲突、取消和报告查询；核对 CronJob 自动触发、DaemonSet 节点覆盖。撰写系统使用流程及 CronJob/DaemonSet 结果。 | `frontend/`（含 `e2e/`）、`k8s/base/frontend*`、`k8s/base/report-cronjob*`、`k8s/demo/`、`k8s/base/node-check*` |
| B：后端与一次性任务 | 报告统计程序、报告表的新 Flyway 迁移、报告查询 API、实例标识 API；API 双副本 Deployment/Service；一次性 Job 模板及手动触发方式。保留原预约事务与冲突规则。 | 新迁移在空库和已有 V1–V3 数据库上通过且与 JPA 映射一致；有效/取消/零预约统计、失败与重试幂等；Job 状态和持久化结果；两个 API Pod 处理请求及并发预约冲突。撰写 API、Job 和副本策略。 | `api/`（只新增迁移，不改 V1–V3）、`k8s/base/api*`、`k8s/jobs/`、报告触发脚本 |
| C：集群与有状态基础设施 | 实验集群及镜像装载；复核 B 的新迁移及数据库约束；命名空间、数据库 `venue-config` ConfigMap、Secret 创建说明；数据库 StatefulSet、Services、PVC；从空环境部署步骤与资源状态检查。 | 数据库 Pod 重建后数据保留、Service/DNS 可达、配置不泄密、整套资源可重复部署。撰写环境、架构资源表与存储方案。 | `k8s/base/namespace*`、`k8s/base/config*`、`k8s/base/database*`、部署说明及 `scripts/verify-k8s*` |

前端报告查询页是本组选择的展示方式，任务书没有规定必须新增该页面。页面只用 `#/reports` 一个入口，成员取得 Job ID 后在同页查询并查看结果；不需要浏览器拥有 Kubernetes 管理权限。B 负责报告新迁移、映射、统计与测试，C 复核数据库结构及约束；旧 V1–V3 迁移不改动。资源文件名是默认责任边界，可随实际目录结构调整；修改其他成员负责的文件时先说明变更。

## 2. 课程知识与完成标准

| 成员 | 主责实践的课程知识 | 独立完成的检查 |
| --- | --- | --- |
| A | Deployment、Service、CronJob、DaemonSet、Pod 调度与日志 | 前端构建和交互测试；集群入口的浏览器回归；CronJob 定时执行和 DaemonSet 节点覆盖。 |
| B | Deployment 多副本、Service 分流、Job、退出与重试、Secret 引用 | 报告统计与幂等测试；Job 运行及结果查询；两个 API Pod 处理请求和并发预约冲突。 |
| C | StatefulSet、PVC/StorageClass、Service/DNS、ConfigMap、Secret | 从空环境部署；数据库 Pod 重建后的数据查询；配置引用、服务发现和资源状态检查。 |

三组任务均包含实现、自动或手动验证，以及报告证据。阶段结束时核对实际进度：若某项受环境或接口阻塞，其他成员可承担独立的测试、排错或证据整理；若增减功能，同步调整其验证与文档责任。资源归属以第 1 节为准，结对协作不改变最终验收责任。

每人至少亲自部署、查询状态、查看日志或事件，并解释自己主责资源的故障处理。共同验收时交叉操作：A 核对数据库 Pod 重建与 PVC，B 核对 CronJob/DaemonSet，C 经 Service 核对 API 双副本与手动 Job。所有成员都应能够解释、修改和验证最终提交的配置。

## 3. 并行开发前固定的公共契约

以下接口及实现选择已作为并行开发基线；详细字段、边界和环境适配规则见[公共契约](lab2-shared-contract.md)，业务口径见 [Lab 2 契约](lab2-contract.md)。

| 契约 | 统一约定及部署前需实测的内容 | 提供与核对 |
| --- | --- | --- |
| 环境与镜像 | 目标命名空间 `venue-booking`；实测 Kubernetes 版本、节点、StorageClass、镜像构建/装载方式；未知环境值明确记录，不猜测。 | C 提供，A/B 核对 |
| 服务与配置 | `frontend`、`api`、`database`、`database-headless` 的名称和端口；`venue-config`、`frontend-nginx`、Secret 的键及引用方式。 | C 提供数据库配置与 Secret 创建方式；A 提供 Nginx ConfigMap；B 核对引用 |
| 报告执行入口 | 报告镜像命令、`REPORT_JOB_ID`、`REPORT_SOURCE`、手动日期参数、定时 `REPORT_WINDOW_MODE`、退出码和失败/重试语义。 | B 提供，A 核对 CronJob 调用 |
| 报告数据与 API | 日期范围、`ACTIVE` 计数、分钟数、零值场地、状态、错误码和 `GET /api/reports/{job_id}` JSON。 | B 实现，A 用固定样例先开发，C 核对持久化 |
| 调度与节点检查 | 正式 CronJob 每日 00:10 统计前一日、演示每 2 分钟统计当天；北京时间、`Forbid` 与有限重试；DaemonSet 节点范围、`NODE_NAME`/`HOST_IP` 与 DNS 检查。 | A 实现，C 核对集群兼容性 |

公共接口变更时，先更新契约和样例，再同步代码、清单、测试与报告；不通过临时口头约定改变字段或资源名。

## 4. 开发与集成顺序

| 阶段 | 可并行开展的工作 | 进入下一阶段的条件 |
| --- | --- | --- |
| 0. 对齐契约 | 将本轮 Lab 2 文档纳入版本控制并共享；三人从同一提交建立各自功能分支，按第 3 节检查资源名、报告响应、执行入口、定时同窗口快照和异常终态；C 同时核查集群限制。 | 记录共同基线的提交 ID；未知环境值列出；A/B 无需等待集群完全搭好。 |
| 1. 独立实现 | A 用固定 JSON 响应完成报告页、测试和浏览器回归脚本，编写前端、CronJob、DaemonSet 清单；B 用本地 PostgreSQL/测试容器完成新 Flyway 迁移、报告程序、API、Job 清单；C 复核迁移并准备集群、数据库和配置清单。 | A 前端测试/构建通过，回归脚本可对模拟响应运行；B 新迁移在空库和已有 V1–V3 数据库上通过，JPA 映射、统计、失败及重试测试通过；C 数据库就绪、PVC Bound，清单通过适用的静态检查。 |
| 2. 分层联调 | C 提供数据库、Secret、Service；B 部署双 API Pod 并运行手动 Job；A 接入真实 API，运行浏览器回归并验证 CronJob。DaemonSet 可先独立验证节点调度与 DNS。 | 按 `database → api → frontend/Job → CronJob` 验证；每层记录实际错误和修复。 |
| 3. 共同验收 | 按验收清单回归 Lab 1 业务，验证报告、并发冲突、PVC 持久化、多副本和节点覆盖；三人交叉操作并核对报告。 | 架构图、资源表、命令、日志、截图和数据均对应同一次实际部署。 |

阶段 1 的并行依靠**已冻结的接口**：前端使用固定响应样例，后端使用测试数据库，基础设施先做集群预检。CronJob 清单可先完成静态检查，实际触发等报告镜像可用后验证；DaemonSet 检查集群 DNS，不依赖预约 API 上线。

## 5. 共享文件与交付

`README.md`、`docs/lab2-contract.md`、`docs/lab2-shared-contract.md`、实验报告和架构图由三人共同维护；编辑前说明变更范围，避免同时覆盖。各功能分支以同一已共享提交为起点，接口改动先更新公共契约并通知依赖方，再合入各自实现。私有 `AGENTS.md` 和课程 PDF 不属于仓库公共基线，成员应通过课程渠道获取原任务书。报告按第 1 节分别撰写对应内容，再共同合并、复核。每项结论保留同一集群、命名空间和镜像版本下的命令、时间、资源名与输出。计划、模拟结果和未执行命令不得写成实测。

任务书规定 **2026-11-23** 前提交至 elearning。提交前应留出一次从空环境重建和报告核对时间。
