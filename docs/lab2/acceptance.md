# Lab 2 最终验收记录

本文件将验收条件和逐项实测结果汇于一处；系统设计、页面展示和结果分析见 [Lab 2 实验报告](../lab2-report.md)。`venue-booking-final` 是最终展示的完整系统，`venue-booking` 用于会新增数据或重建资源的专项检查。两个命名空间各有数据库和 PVC，结果不能混算。隔离集成测试只验证异常路径，不充当集群实测。部署和访问步骤见 [最终展示说明](../../k8s/final/README.md)。

核对一项结果时，以该行的命名空间、镜像和原始输出为准；各批次的 context 与源码提交见[证据索引](evidence/README.md)。截图、API 响应与日志只有在指向同一数据范围时才相互印证。隔离测试不代替集群实测。

## 最终逐项验收结论

**课程要求的业务功能和 Kubernetes 工作负载均已通过实测。**下表以需求为单位归并原始记录；必要时用记录①、记录②区分独立执行。节点架构、镜像摘要和业务数据均按各自原始记录核对，不跨批次拼接。

展示部署的前端构建源码提交为 `dfde6c8`，浏览器补测时仓库提交为 `45b9b1f`；两者 `frontend` 目录的 Git tree 均为 `309bd450be2cb717b145f4636b5f93399b57e86a`。[源码一致性核对](evidence/frontend-display-regression/source-consistency.txt)确认展示部署、定时复核与核对时提交 `45b9b1f` 的 API、前端、清单、节点脚本和运行脚本无差异。补测所用的前端 Pod `imageID` 与其展示命名空间一致；镜像及节点信息见[原始环境记录](evidence/frontend-display-regression/environment.json)。

| 验收要求 | 判定与实测结果 | 原始证据及范围 |
| --- | --- | --- |
| kind 环境、镜像和工作负载 | **通过。**三节点就绪；展示环境 API 2/2、前端 1/1、数据库 1/1、DaemonSet 2/2，PVC Bound，实际 Pod 镜像已核对。 | [集群环境](evidence/kind-environment.json)、[最终资源](evidence/scheduled-report-node-check/final-status.txt)、[镜像与节点](evidence/scheduled-report-node-check/pods-audit.json)；记录① `venue-booking-final`。 |
| Service、ConfigMap、Secret 与 PVC | **通过。**前端经 Service 到 API，数据库可从另一 worker 经 Service 认证连接；配置、凭据引用和存储已部署。 | [数据库基础设施](evidence/database-infrastructure.json)、[展示资源](evidence/scheduled-report-node-check/final-status.txt)；记录①。证据不含凭据值。 |
| 原有业务与最终前端源码 | **通过。**真实 Chromium 经前端 Service 完成场地创建、预约、冲突、详情、取消及已保存报告查询，2/2 通过；报告中的业务截图与同批场地、预约 API 数据一致，冲突提交返回 409 且预约总数不变。 | [浏览器补测](evidence/frontend-display-regression/browser-e2e.txt)、[镜像对应](evidence/frontend-display-regression/environment.json)；记录② `venue-booking`。[截图与数据核对](evidence/report-screenshot-data.json)；记录② `venue-booking-final`。 |
| API 双副本与并发冲突 | **通过。**两个 API 实例均处理请求；同一时段并发预约返回 201 和 409，仅保留一笔有效预约。 | [Pod 分布](evidence/api-deployment-migration/api-pods-wide.txt)、[实例 1](evidence/api-deployment-migration/api-response-worker2.txt)、[实例 2](evidence/api-deployment-migration/api-response-worker1.txt)、[并发核对](evidence/booking-report-persistence/concurrent-booking.txt)；记录① `venue-booking`。 |
| Flyway 与数据库 Pod 重建 | **通过。**V1–V4 迁移成功；Pod UID 改变后 PVC/PV 不变，原场地、预约和报告响应一致。结论限于同集群 Pod 重建。 | [迁移版本](evidence/api-deployment-migration/flyway-version.txt)、[启动日志](evidence/api-deployment-migration/api-startup-flyway.txt)、[重建与比较](evidence/booking-report-persistence/database-rebuild-persistence.txt)；记录① `venue-booking`。 |
| 一次性 Job、页面与幂等 | **通过。**展示环境手动 Job 完成，五个场地的统计与 API、页面一致；专项环境删除 Job/Pod 后仍可查询，同 ID 重建不覆盖原快照。 | [手动报告](evidence/display-manual-report/manual-report.json)、[页面核对](evidence/display-manual-report/readonly-browser-checks.json)；记录① `venue-booking-final`。[图 5 与同批 API](evidence/report-screenshot-data.json)；记录② `venue-booking-final`。[首次 Job](evidence/booking-report-persistence/report-first-job.json)、[删除 Pod 后](evidence/booking-report-persistence/report-after-pod-delete.json)、[重建后 Pod](evidence/booking-report-persistence/report-retry-pods.json)、[重试前](evidence/booking-report-persistence/report-before.json)、[重试后](evidence/booking-report-persistence/report-after-retry.json)、[行数](evidence/booking-report-persistence/report-row-count.txt)；记录① `venue-booking`。 |
| CronJob 自动执行 | **通过。**短周期配置实际创建两个不同 Job，均归属 `venue-report-daily`，报告 `SCHEDULED / SUCCEEDED` 且数值正确；正式配置已恢复为北京时间每日 00:10、`PREVIOUS_DAY`、`Forbid`。正式跨日触发不作为本项结论。 | [Job 1](evidence/scheduled-report-node-check/scheduled-job-1.txt)、[Job 2](evidence/scheduled-report-node-check/scheduled-job-2.txt)、[报告 1](evidence/scheduled-report-node-check/scheduled-report-1.json)、[报告 2](evidence/scheduled-report-node-check/scheduled-report-2.json)、[三 Job 核对](evidence/scheduled-report-node-check/three-job-check.json)、[正式配置](evidence/scheduled-report-node-check/cron-restored.txt)；记录① `venue-booking-final`。[报告截图与同批 API](evidence/report-screenshot-data.json)；记录② `venue-booking-final`。 |
| DaemonSet 节点任务 | **通过。**两个可调度 worker 各有一个就绪 Pod，期望/就绪数 2/2，两份日志均为 `dns=ok`。 | [状态](evidence/scheduled-report-node-check/final-status.txt)、[worker 1](evidence/scheduled-report-node-check/node-check-pzqf8-dns.txt)、[worker 2](evidence/scheduled-report-node-check/node-check-r8hnz-dns.txt)；记录① `venue-booking-final`。 |
| 异常路径与回归 | **通过。**隔离报告测试 6/6、后端完整回归 21/21；前端 16 个测试文件、155 项测试通过，覆盖报告页面的运行中、失败、404、断网、异常响应及超时反馈。隔离测试不冒充集群内实际失败 Job。 | [报告测试](evidence/backend-regression/report-integration-maven.txt.gz)、[后端回归](evidence/backend-regression/backend-suite-maven.txt.gz)、[前端测试](evidence/frontend-display-regression/frontend-tests.txt)；隔离测试环境。 |
| 完整展示数据复核 | **通过。**五场地、七预约、手动与两次自动报告、正式 CronJob、PVC 和 DaemonSet 逐项符合预期；记录②的同一综合核对脚本再次返回 `PASS`。 | [记录①核对](evidence/scheduled-report-node-check/three-job-check.json)、[记录②核对](evidence/frontend-display-regression/display-check.txt)；各自 `venue-booking-final`。 |
| 实验报告与源码交付件 | **已核对。**报告包含运行环境、架构图、资源设计和选择依据、业务流程、三类任务结果、分工与问题解决；源码及部署说明在本仓库。实际课程平台提交应以团队提交记录为准。 | [实验报告](../lab2-report.md)、[部署入口](../../README.md)、[最终展示说明](../../k8s/final/README.md)；仓库文件。 |

浏览器补测使用真实 API 和 PostgreSQL，测试代码为 [`frontend/e2e/cluster.e2e.ts`](../../frontend/e2e/cluster.e2e.ts)。[实验报告](../lab2-report.md)的十张截图对应同一份[场地、预约和报告 API 快照](evidence/report-screenshot-data.json)，其 Job ID 和图片摘要可逐项核对；记录①的任务日志与报告响应按各自 Job ID 核验，不跨批次混用日期。各原始批次的状态保持原值，本表按需求给出最终判定。
