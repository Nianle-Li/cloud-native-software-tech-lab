# Lab 2 验收证据索引

[最终验收记录](../acceptance.md)按实验要求给出判定和关键原始输出。本目录只保留复核结论所需的原始文件；文件内容与来源批次保持一致。下表中的 context、命名空间和源码提交用于界定每份证据的范围，跨批次的业务 ID 与统计值不混用。

| 证据位置 | 范围与来源 | 保留内容 |
| --- | --- | --- |
| [环境与数据库核对](./) | `kind-venue-lab2`；数据库检查源码 `97bf795`，V4 独立复核源码 `aaa9a26` | 三节点与存储发现、Service 和数据库连接、V4 迁移约束的独立复核 |
| [API 部署与迁移](api-deployment-migration/) | `kind-venue-lab2` / `venue-booking`；源码 `70c266e`；原批次 `SUCCESS` | API Pod 分布、两个实例响应、Flyway 版本与启动日志 |
| [业务、报告与持久化](booking-report-persistence/) | `kind-venue-lab2` / `venue-booking`；源码 `ad93428`；原批次 `SUCCESS` | 并发冲突、Job 重试与幂等、数据库 Pod 重建前后的对象及 PVC 比较 |
| [后端测试](backend-regression/) | 证据提交 `e79ccec`；隔离测试环境 | 报告集成测试和后端完整回归的原始 Maven 输出 |
| [展示与手动报告](display-manual-report/) | `kind-venue-lab2` / `venue-booking-final`；源码 `dfde6c8`；原批次 `PARTIAL` | 固定展示数据、手动报告和页面核对；本批次尚未核对自动报告 |
| [自动报告与节点检查](scheduled-report-node-check/) | `kind-venue-lab2` / `venue-booking-final`；源码 `4c9f2f5`；原批次 `SUCCESS` | 两次自动 Job 与报告、正式调度、资源和镜像、两节点 DNS 日志及浏览器截图 |
| [前端与展示回归](frontend-display-regression/) | `kind-venue-lab2-a`；源码 `45b9b1f`；具体命名空间与镜像见 `environment.json` | 当前前端源码的真实浏览器回归、测试输出、源码一致性及展示数据复核 |

展示报告的十张功能截图集中放在 [`docs/lab2/screenshots`](../screenshots/)；定时报告核对 JSON 所指向的两张同批次截图保留在原证据目录中。各批次的原始状态不改写；完整结论以[最终验收记录](../acceptance.md)的逐项判定为准。
