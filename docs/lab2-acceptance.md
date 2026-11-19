# Lab 2 验收与报告记录清单

本清单列出实施和报告的核对标准，不记录当前通过状态；实测结果与证据见 [Lab 2 实验报告](lab2-report.md)和[交接记录](lab2-handoff.md)。需求与方案见 [Lab 2 契约](lab2-contract.md)，跨成员接口与确定的设计选择见[公共契约](lab2-shared-contract.md)。共同集群为 kind 集群 `venue-lab2`、context `kind-venue-lab2`；原有资源位于 `venue-booking` 命名空间，最终展示资源位于独立的 `venue-booking-final` 命名空间。对命名空间资源执行命令时显式指定 context 和目标命名空间。

| 验收项 | 操作与应保留的证据 | 通过条件 |
| --- | --- | --- |
| kind 环境 | C 提交 `k8s/kind/cluster.yaml`；记录 `kind version`、`kind get clusters`、`kubectl --context kind-venue-lab2 version`、`kubectl --context kind-venue-lab2 get nodes -o wide`、节点镜像版本/摘要、节点架构和污点、宿主机资源 | 指向唯一 `venue-lab2` 集群；基准为 1 control-plane + 2 worker，实际版本和节点可调度性有证据；其他本地集群不混作本次验收 |
| kind 镜像 | 记录每个自建镜像的源码提交、构建命令、唯一标签、`kind load docker-image <镜像:标签> --name venue-lab2`、节点镜像检查和 Pod 事件 | A/B/C 清单中的标签与目标 kind 节点装载的标签一致；API、手动 Job、CronJob 共用同一 API 镜像；新内容不复用旧标签 |
| kind 存储 | 部署前记录 `kubectl --context kind-venue-lab2 get storageclass -o wide`，部署后记录 PVC/PV 的类、绑定状态、provisioner、节点关联和数据库重建前后数据 | 不预设 StorageClass 名称；数据库 Pod 重建后原记录仍在，证据不扩展为跨节点、跨宿主机或删除 kind 集群后的恢复能力；验收前不删除集群/PVC |
| 公共契约 | 记录集群、镜像/存储的实测适配值，并核对同窗口快照、异常终态、探针和测试数据批次 | 三人使用同一资源名、字段、命令和数据口径；实施与已定契约一致 |
| 清单 | 分别校验 `k8s/base/` 中的常规资源、`k8s/jobs/` 中生成的手动 Job 和 `k8s/demo/` 中的临时覆盖清单；按 README 的依赖顺序部署，演示覆盖只在演示时应用；部署后 `kubectl --context kind-venue-lab2 -n venue-booking get deploy,sts,ds,job,cronjob,svc,cm,secret,pvc,pods -o wide` | 清单有效、资源类型齐全；没有因整体应用 `k8s/` 而误启动任务；敏感值不出现在提交文件与报告中 |
| 健康与发现 | `kubectl --context kind-venue-lab2 -n venue-booking get endpointslice`、`kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/api`，前端页面请求 `/api/venues` | 前端经 Service 到 API；API 经 Service 到数据库，Pod 均就绪 |
| 业务回归 | 在 Kubernetes 入口逐项执行场地列表/详情/创建，预约创建、冲突、列表/详情、取消 | 与 Lab 1 业务规则和错误码一致；无 Pod IP 依赖 |
| 浏览器端到端回归 | 对真实集群的前端入口运行可重复的浏览器流程；记录镜像版本、测试数据及失败截图/日志 | 场地、预约、冲突、取消和报告查询可通过页面完成；模拟响应测试与真实集群结果分别标注 |
| 数据保留 | 创建场地和预约，记录 ID；删除数据库 Pod，待 StatefulSet 恢复后再次查询 | 原 ID、状态和数据仍在；PVC 保持 Bound |
| API 扩展 | 确认 2 个就绪 API Pod；在 kind 集群内经 `api` Service 用独立连接多次请求 `/api/instance`，保存响应、Pod 名称/节点和日志；不用单个 `port-forward service/api` 会话证明分流 | 至少出现 2 个不同 `instance_id`；同一时段并发预约仍只允许一个成功；若两 Pod 在同一 worker，不声称已证明跨节点分布 |
| 一次性报告 | 用指定起止日期创建唯一 Job，查 Job 状态、日志和 `/api/reports/{job_id}`；核对数据库原始记录；通过 Job 自身失败重试或在保留数据库记录的前提下删除原 Job 对象后以同名重建，验证同 ID 重试；用本地集成测试验证同 ID 并发执行、来源/范围冲突，并在 `RUNNING` 落库后注入可捕获异常核对 `FAILED`；另建不同 ID 的同窗口 Job；无效参数的集群 Job 只用于证明非零退出和日志，不冒充已落库的 `FAILED` | 每个场地含零值行；仅有效预约计数与分钟数正确；同 ID 重试及并发执行无重复明细且已成功快照不被覆盖，冲突参数不覆盖旧记录，不同 ID 保留独立快照；可捕获失败留有脱敏摘要，Pod 删除后仍可查询已持久化结果 |
| 报告页面 | 从手动触发命令或 Job 列表取得 ID，在 `#/reports` 输入并同页查询；分别模拟/实测运行中、成功、失败、404、断网与异常响应，并覆盖长时间未变化的 `RUNNING` | 展示状态、范围与零值明细；可手动刷新，对可能继续重试或过期的状态给出准确提示；页面无 Kubernetes 管理权限 |
| 定时报告 | 通过 API 创建当天有效预约与零值场地；将同名 CronJob 临时改为每 2 分钟、`TODAY` 模式，观察至少两次 Job 并核对 `job_id`、日期、非零/零值结果；验收后恢复每日 00:10、`PREVIOUS_DAY` 模式，检查 `Forbid`、时区、调度期限与 Job 重试/截止参数 | 自动触发且结果可由当日业务数据验证；演示与正式模式分别留证；同窗口多快照与重叠处理符合契约 |
| 节点任务 | `kubectl --context kind-venue-lab2 -n venue-booking get ds,pods -o wide`，对照两个 worker 的调度条件和各 Pod 日志 | 两个可调度 worker 各有一个运行中 Pod；日志对应节点名、宿主 IP 和集群 DNS 检查结果；control-plane 是否覆盖按实测污点和清单说明 |
| 报告与源码 | 架构图、资源用途/选择理由表、主要用例、三类任务证据、配置与存储、副本策略、小组分工和问题解决；核对源码提交内容或可访问的仓库链接 | 图、表、命令、截图、数据对应实际运行；报告和源码或仓库链接按任务书截止日期提交 |

记录失败项时保留真实错误、修复和重测结果。kind 未安装、context 不存在、集群没有可用 StorageClass、worker 不足、镜像不能装载或资源不足时，先记录环境事实，再调整部署方案与契约；不得将未执行的检查标记为通过。不要通过 `kind delete cluster` 或删除 PVC 来重跑有持久化证据的集群。
