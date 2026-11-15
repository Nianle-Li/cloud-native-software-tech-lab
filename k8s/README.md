# Lab 2 部署顺序与 C 的数据库交付

共同环境为 kind 集群 `venue-lab2`、context `kind-venue-lab2`、命名空间
`venue-booking`。命令从仓库根目录执行；不对整个 `k8s/` 目录执行 apply。
集群创建见 [kind 配置说明](kind/README.md)，实测见
[环境记录](../docs/lab2-environment.md)。当前文档完成 C 的数据库交付；
API/任务由 B 部署，前端/CronJob/DaemonSet 由 A 部署并保留各自验证证据。

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

本次已有该官方镜像，未重新拉取。AMD64 宿主机使用 `linux/amd64`；
归档只是镜像分发文件，成功装载后可删除，不是数据库备份。
Pod 使用 `IfNotPresent`，实际 imageID 保存在数据库验证证据中。

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

## 4. C 的基础设施验证

```sh
# 包含一次 database-0 删除重建，会短暂中断数据库；部署联调期间协调执行。
python3 scripts/verify-k8s-database.py --restart-database
```

脚本在另一个 worker 创建临时客户端，通过 Secret 引用取得认证信息；
查询 `database`、`database-headless` 和稳定 Pod DNS；在独有测试 schema
写入探针数据后，验证数据库 Pod UID 改变、PVC/PV 保持、数据仍可读取。
结束后删除探针 schema 和临时客户端。它不改业务表、不执行 Flyway、
不删除 PVC/Secret。没有 `--restart-database` 时仅做连接和临时写读检查。

输出保存到 [数据库基础设施证据](../docs/assets/lab2/database-infrastructure.json)，
不含 Secret 数据。失败时保留错误并检查 Pod、事件、PVC 和日志，不把未通过
项写成成功；若清理失败，脚本会报错，应按输出中的独有资源名清理。

## 5. 交给 B，再交给 A

C 交付 `database` 就绪、PVC Bound、Service 认证连接和 Pod 重建保留数据
的证据。此时业务库可以尚无业务表：**Flyway 继续由 API 启动执行**，
不在数据库初始化目录复制 V1–V4，也不由 C 手工建业务表。

B 使用同一 `venue-config` 和 `venue-db-credentials`，先在该 Docker 环境
构建单平台 API 镜像并装载；核对实际标签与 API、手动 Job、A 的 CronJob
一致后，再部署 `api-service.yaml` 和 `api-deployment.yaml`。已有基线标签
为 `venue-booking-api:lab2-20261113`；如内容改变，先使用新标签同步清单。

```sh
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/api-service.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply -f k8s/base/api-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/api --timeout=180s
```

以上 B 的命令是后续步骤，不是本次已执行记录。先确认 Flyway V1–V4 与
JPA validate 通过、两 API Pod 就绪，再按 [手动 Job 说明](jobs/README.md)
运行报告任务。API 两副本分流必须由集群内客户端证明，不能用单个
port-forward 会话代替。随后 A 联调页面和 CronJob/DaemonSet。

最终持久化验收仍须记录真实业务场地、预约及报告 ID，在数据库 Pod 重建后
通过 API 查询原记录；C 的临时探针验证不能替代这项业务验收。
