# 场地预约系统 · 云原生软件技术课程项目

本仓库的当前交付内容为 **Lab 2 Kubernetes 场地预约系统**。Lab 2 实验报告位于 [`docs/lab2-report.md`](docs/lab2-report.md)，逐项验收结论和原始证据位于 [`docs/lab2/acceptance.md`](docs/lab2/acceptance.md)。

## Lab 2：最终展示与验收

### 运行环境

项目使用 Docker Engine、kind 和 kubectl。目标集群 context 为 `kind-venue-lab2`，集群名称为 `venue-lab2`。最终展示命名空间为 `venue-booking-final`，专项验收命名空间为 `venue-booking`；两个命名空间分别使用独立数据库和 PVC，业务数据与验收结果不能混用。

完整部署、镜像装载、固定展示数据、报告任务和资源核对流程见 [`k8s/final/README.md`](k8s/final/README.md)。开始操作前应确认 Docker 已运行、kubectl 已连接目标 context，并确认清单引用的镜像已经装载到 kind 节点。

### 最终展示的基本访问方式

若最终展示环境已经部署，先核对资源状态，再启动端口转发：

```sh
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 -n venue-booking-final get deploy,sts,ds,cronjob,job,svc,cm,secret,pvc,pods -o wide
kubectl --context kind-venue-lab2 -n venue-booking-final port-forward service/frontend 8080:80
```

浏览器访问 `http://127.0.0.1:8080/`，只读查看固定场地、预约状态和报告；报告查询使用 `venue-booking-final` 中实际生成的 Job ID。已有展示环境无需重新执行初始化脚本、种子脚本或删除 PVC。

### 验收方式

验收按 [`docs/lab2/acceptance.md`](docs/lab2/acceptance.md) 的需求表逐项进行：

1. 核对节点、镜像、Deployment、StatefulSet、Service、ConfigMap、Secret、PVC、CronJob 和 DaemonSet 状态。
2. 在展示命名空间只读核对场地、预约和报告页面；在 `venue-booking` 专项验收命名空间执行场地创建、预约、冲突和取消的真实浏览器回归。
3. 核对一次性报告的 Job 状态、报告 API 与页面统计；报告结果必须与同一数据范围内的预约 API 一致。
4. 核对 CronJob 创建的两个自动 Job、`SCHEDULED / SUCCEEDED` 状态、零值与非零值统计，并确认正式调度配置已恢复。
5. 核对 DaemonSet 在两个可调度 worker 上各有一个就绪 Pod，两个日志均为 `dns=ok`。
6. 在专项验收命名空间核对双副本 API 并发冲突、报告重试幂等性和数据库 Pod 重建后的数据持久性。

需要重新部署全新展示环境时，严格按照 [`k8s/final/README.md`](k8s/final/README.md) 执行；需要运行会新增数据或重建资源的专项检查时，使用 [`k8s/README.md`](k8s/README.md) 中的 `venue-booking` 流程。不得将两个命名空间的业务数据、Job ID 或截图混合解释。

### 三人分工

- **李佳凝**：负责预约与报告查询前端、响应校验和浏览器回归；维护前端 Nginx、Deployment、Service、正式与演示 CronJob、节点检查 DaemonSet、DNS 检查脚本和就绪探针，并整理最终展示数据、核验脚本及相关说明。
- **张玳瑗**：负责后端报告服务，包括 Flyway V4 报告表及 JPA 映射、统计程序、报告查询 API、实例标识 API、报告快照持久化、失败重试语义、双副本 API、一次性 Job 和并发预约控制。
- **吴柯蝶**：负责 kind 集群和有状态基础设施，包括数据库 StatefulSet、Service、PVC、ConfigMap、Secret、镜像装载及环境准备；执行最终部署、数据库重建、CronJob 与 DaemonSet 复测，并整理环境、存储和验收证据。

### 项目验收指引

验收人员从仓库根目录开始，先阅读 [`docs/lab2-report.md`](docs/lab2-report.md) 了解系统设计，再按 [`k8s/final/README.md`](k8s/final/README.md) 核对目标 context、镜像和资源状态，并通过端口转发查看固定展示数据。最后依据 [`docs/lab2/acceptance.md`](docs/lab2/acceptance.md) 逐项核对原始证据；报告的页面、API 响应和日志应按 context、命名空间及 Job ID 对应，其他资源按其 context、节点、Pod 和 PVC 标识对应。

## Lab 1：归档内容

Lab 1 为 Docker Compose 版本，报告位于 [`docs/lab1-report.md`](docs/lab1-report.md)，其截图和验收材料位于 [`docs/lab1/`](docs/lab1/)。如需复现，在仓库根目录首次将 `.env.example` 复制为 `.env`，设置 `POSTGRES_PASSWORD`，然后执行：

```sh
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
```

浏览器访问 `http://localhost:8080/`；若在 `.env` 中修改了 `FRONTEND_PORT`，则使用对应端口。Lab 1 的 Compose 运行方式仅用于归档复现，不参与 Lab 2 Kubernetes 最终验收。

## 主要目录

| 路径 | 内容 |
| --- | --- |
| `docs/lab2-report.md` | Lab 2 实验报告 |
| `docs/lab2/acceptance.md` | Lab 2 最终逐项验收记录 |
| `docs/lab2/` | Lab 2 的截图、证据和补充材料 |
| `k8s/base/` | 可复用的 Kubernetes 基础资源清单 |
| `k8s/final/` | 最终展示环境入口和部署说明 |
| `frontend/` | 前端页面、测试和 Nginx 配置 |
| `api/` | Spring Boot API、报告程序、迁移和测试 |
| `docs/lab1-report.md`、`docs/lab1/` | Lab 1 归档报告及其材料 |
