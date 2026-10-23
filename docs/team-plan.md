# Lab 1 三人总分工

本组按组件划分主要责任。接口、表字段、状态、时间规则、环境变量和端口以[公共契约](contract.md)为准；完成标准见[验收清单](acceptance.md)。

| 成员 | 主要责任与文件 |
|---|---|
| A：前端 | `frontend/`；场地列表/详情、预约创建/列表/取消及成功、参数错误、冲突提示；前端 Dockerfile、`.dockerignore`、Nginx `/api` 代理配置 |
| B：后端 | `api/` 中的 Java 代码、JPA 映射、参数校验、业务事务与统一错误响应；后端 Dockerfile、`.dockerignore`、API 测试 |
| C：数据库与部署 | `api/src/main/resources/db/migration/` 的 Flyway 表结构及少量场地种子数据；根目录 `compose.yaml`、`.env.example`、`.gitignore`；PostgreSQL 服务、named volume、`pg_isready`、部署与持久化说明 |

前端和 API 各有一个可独立构建的 Dockerfile；数据库使用 PostgreSQL 标准镜像，不编写第三个 Dockerfile。Compose 只保留一份，置于仓库根目录。

公共契约变更应同步到实现、测试、README 和实验报告。报告中的分工只填写实际完成情况，不把计划写成已完成。
