# Lab 2 专项验收环境操作说明

本页只说明目标集群中 `venue-booking` 专项验收命名空间的资源依赖与操作。最终展示的完整系统位于 `venue-booking-final`，查看或全新部署请从[最终展示环境说明](final/README.md)开始。两个命名空间复用基础清单，但各有独立 Secret、数据库、PVC 和业务数据；不要把本页的 Job、浏览器截图或数据库结果直接用于最终展示命名空间。

共同环境为 kind 集群 `venue-lab2`、context `kind-venue-lab2`。本页命令固定操作 `venue-booking`，从仓库根目录执行；不对整个 `k8s/` 目录执行 apply，也不要为重跑验收删除已有 PVC。
集群创建见 [kind 配置说明](kind/README.md)。本文件按数据库、API/手动 Job、
前端、CronJob 与 DaemonSet 的依赖关系组织操作；系统设计和结果见
[Lab 2 报告](../docs/lab2-report.md)。
前端镜像构建、清单应用与入口核查见[前端部署说明](frontend.md)。
节点 DNS 检查的镜像、DaemonSet 与覆盖核查见[节点检查说明](node-check.md)。
正式与演示定时报告的切换、核查和恢复见[定时报告说明](report-cronjob.md)。

## 1. 核对环境与数据库镜像

```sh
kind get clusters
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 get storageclass -o wide
```

本机三个节点均为 ARM64，`standard` 是实际默认 StorageClass，驱动为
`rancher.io/local-path`，绑定方式为 `WaitForFirstConsumer`。数据库清单使用
这个实测名称；换环境时先检查，不盲目套用。

数据库复用官方 `postgres:16.15-bookworm`，无需构建自定义数据库镜像。
Docker Desktop 使用 containerd 镜像存储时，直接导出多架构索引曾导致
kind 导入缺少摘要；本机用以下选定平台的归档成功装载官方镜像，内容不变：

```sh
docker pull --platform linux/arm64 postgres:16.15-bookworm
docker image save --platform linux/arm64 -o /tmp/lab2-postgres-arm64.tar postgres:16.15-bookworm
kind load image-archive /tmp/lab2-postgres-arm64.tar --name venue-lab2
```

已有该官方镜像时无需重新拉取。AMD64 宿主机使用 `linux/amd64`；
归档只是镜像分发文件，成功装载后可删除，不是数据库备份。
Pod 使用 `IfNotPresent`；部署后核对实际 imageID 与镜像装载结果。

## 2. 命名空间、配置与 Secret

```sh
kubectl --context kind-venue-lab2 apply -f k8s/base/namespace.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply --dry-run=server -f k8s/base/configmap.yaml -f k8s/base/database-services.yaml -f k8s/base/database-statefulset.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/configmap.yaml
python3 scripts/create-k8s-db-secret.py
```

ConfigMap `venue-config` 提供：

| 键 | 值 |
| --- | --- |
| `POSTGRES_DB` | `venue_booking` |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://database:5432/venue_booking` |

Secret 脚本直接通过 stdin 在集群中创建 `venue-db-credentials`，键为
`POSTGRES_USER`、`POSTGRES_PASSWORD`。密码随机生成，仅保存在集群 Secret；
不打印、不写本地文件、不进入 Git。已有 Secret 时保持不变，重复部署不会
随机换密码；若数据库 PVC 已存在而 Secret 丢失，脚本拒绝生成新凭据。
检查时只查询资源名，不导出 Secret 数据：

```sh
kubectl --context kind-venue-lab2 -n venue-booking get secret venue-db-credentials -o name
```

数据库、API 和报告任务按公共契约共用账号。PostgreSQL 官方镜像初始化的
这个账号是数据库超级用户，本实验没有实现应用/迁移/报告的权限分离。
Secret 编码不等于加密。不要删 Secret 后重新生成来“重置”已有 PVC 的密码：
`POSTGRES_*` 初始化变量不会修改已初始化数据库中的账号密码；轮换必须另行
协调数据库和 Secret，当前脚本不负责轮换。

## 3. 数据库 Service、StatefulSet 与 PVC

```sh
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/database-services.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/database-statefulset.yaml
kubectl --context kind-venue-lab2 -n venue-booking rollout status statefulset/database --timeout=120s
kubectl --context kind-venue-lab2 -n venue-booking get sts,pods,svc,pvc -o wide
kubectl --context kind-venue-lab2 -n venue-booking get endpointslice -l kubernetes.io/service-name=database
```

| 资源 | 用途与配置 |
| --- | --- |
| `database` Service | ClusterIP，内部 `5432 → 5432`；API/报告连接使用该名称 |
| `database-headless` Service | 无头 Service，为 `database-0` 提供稳定 DNS 身份 |
| `database` StatefulSet | 单副本 PostgreSQL；不通过简单增加副本模拟数据库复制 |
| `postgres-data-database-0` PVC | `volumeClaimTemplates` 创建；1Gi、ReadWriteOnce、`standard` |
| 数据目录 | PVC 挂载到 `/var/lib/postgresql/data`；`PGDATA` 使用其 `pgdata` 子目录 |

startup/readiness/liveness 使用本地 TCP `pg_isready`；另由独立客户端实测
Service、DNS 和密码登录。资源 requests 为 100m CPU/128Mi，limits 为
500m CPU/512Mi，是实验初始配置；本次启动与重建通过，不代表性能压测。
Pod 不挂载 ServiceAccount token。

StatefulSet 显式保留删除/缩容时的 PVC。StorageClass 的回收策略仍为
`Delete`，主动删除 PVC 可能删除 PV 和数据。PV 是 kind 节点本地卷，
节点亲和性限制数据库重建后的调度；不保证跨节点、跨宿主机或删集群后恢复。
不要删除 PVC、节点容器或集群来做日常重启。

设计参考 [Kubernetes StatefulSet](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
和 [PostgreSQL 官方镜像说明](https://github.com/docker-library/docs/blob/master/postgres/content.md)。

## 4. 数据库基础设施专项验证

```sh
# 包含一次 database-0 删除重建，会短暂中断数据库；部署联调期间协调执行。
python3 scripts/verify-k8s-database.py --restart-database
```

脚本在另一个 worker 创建临时客户端，通过 Secret 引用取得认证信息；
查询 `database`、`database-headless` 和稳定 Pod DNS；在独有测试 schema
写入探针数据后，验证数据库 Pod UID 改变、PVC/PV 保持、数据仍可读取。
结束后删除探针 schema 和临时客户端。它不改业务表、不执行 Flyway、
不删除 PVC/Secret。没有 `--restart-database` 时仅做连接和临时写读检查。

输出默认保存到本地 `.lab2-evidence/database-infrastructure.json`，不纳入 Git，
且不含 Secret 数据。失败时保留错误并检查 Pod、事件、PVC 和日志，不把未通过
项写成成功；若清理失败，脚本会报错，应按输出中的独有资源名清理。

## 5. API 与其余资源的部署顺序

先确认 `database` 就绪、PVC Bound，且通过 Service 能认证连接。此时业务库可以尚无业务表：**Flyway 由 API 启动执行**，不要在数据库初始化目录复制 V1–V4 或手工建业务表。

在承载目标集群的 Docker 环境构建并装载单平台 API 镜像；核对 API Deployment、手动 Job 命令和 CronJob 使用同一标签后，再部署 `api-service.yaml` 和 `api-deployment.yaml`。当前清单标签为 `venue-booking-api:lab2-20261113`；镜像内容改变时先换标签并同步引用。

```sh
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/api-service.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/api-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/api --timeout=180s
```

以上命令用于在 `venue-booking` 创建或更新 API 资源。部署后须确认 Flyway V1–V4 与
JPA validate 通过、两个 API Pod 就绪，再按 [手动 Job 说明](jobs/README.md)
运行报告任务。API 两副本分流须由集群内客户端证明，不能用单个
port-forward 会话代替。前端、CronJob 与 DaemonSet 的操作分别见下列说明。

业务持久化专项验证须记录真实业务场地、预约及报告 ID，在数据库 Pod 重建后
通过 API 查询原记录；临时探针验证不能替代这项业务验收。
