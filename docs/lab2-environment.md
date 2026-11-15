# Lab 2 C 环境建立与核查记录

## 环境与共同基线

2026-11-15 在 C 的 Apple Silicon Mac 上建立共同验收集群。`feature/data`
已快进同步到 `origin/develop` 的 `97bf795`；公共契约规定唯一集群
`venue-lab2`、context `kind-venue-lab2` 和业务命名空间 `venue-booking`。
已建立集群并完成 C 的数据库基础设施部署；业务 API、Flyway 迁移和任务
尚待后续联调。

| 项目 | 实测值 |
| --- | --- |
| 宿主机 | macOS ARM64，物理内存 18 GiB；建群前文件系统可用空间约 15 GiB |
| Docker | Desktop 4.64.0，Engine 29.2.1；context `desktop-linux`；11 CPU，约 7.65 GiB 内存 |
| kind | v0.33.0，darwin/arm64；官方二进制经官方 SHA256 校验，安装于 `~/.local/bin/kind` |
| kind 二进制 SHA256 | `0c8c7dbe5e23594a198b786c4bc13dacc101fa6196b0cb0b23a1ca44e61f4b4f` |
| kubectl / 服务端 | v1.34.1 / v1.34.11 |
| 节点镜像 | `kindest/node:v1.34.11@sha256:44e222ee2132dab25ff87301682f89eb82c7880ea3a1bf543bfe9708fd08d67d` |
| 默认 StorageClass | `standard`，provisioner `rancher.io/local-path` |
| 存储策略 | `WaitForFirstConsumer`，回收策略 `Delete`，不支持卷扩容 |

节点镜像和版本取自 [kind v0.33.0 官方发布](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0)。
固定 v1.34.11 使现有 kubectl 与服务端保持同一小版本；这不是课程指定版本。
Docker Desktop 内置 kubeadm 集群保留，但不用于共同验收。
后续每条命令显式指定 kind context，不能混用此前 kubeadm 的存储和镜像结果。

| 节点 | 状态 / 架构 | 调度条件 |
| --- | --- | --- |
| `venue-lab2-control-plane` | Ready / ARM64 | `node-role.kubernetes.io/control-plane:NoSchedule` |
| `venue-lab2-worker` | Ready / ARM64 | 无污点 |
| `venue-lab2-worker2` | Ready / ARM64 | 无污点 |

三个节点均为同一台 Mac 中的容器，不代表三台物理机器。两个 worker
均可用于业务 Pod 和 DaemonSet。刚建群时系统 Pod 全部 Running 且就绪；
一次 `docker stats` 采样中 control-plane 约 623 MiB、两个 worker 各约
140–145 MiB，这只是空闲集群采样，不代表业务容量结论。

## 创建与验证

建群前 `kind get clusters` 无集群；执行：

```sh
kind create cluster --name venue-lab2 --config k8s/kind/cluster.yaml --wait 5m --retain
kubectl --context kind-venue-lab2 wait --for=condition=Ready nodes --all --timeout=60s
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 get pods -A -o wide
kubectl --context kind-venue-lab2 get storageclass -o wide
```

初次拉取镜像后创建成功，三个节点均 Ready。完整节点、污点、版本、存储、
PVC/PV 和镜像核查输出保存在 [环境证据 JSON](assets/lab2/kind-environment.json)。

### 镜像：首次失败与重测

初次将已有 `nginx:1.28.2-alpine3.23` 加唯一测试标签后执行
`kind load docker-image ... --name venue-lab2`，导入报错
`ctr: content digest sha256:0c8a74b863b202a8e9ce8b2f97cc8bf96bc573206d46c2c469d507095dd2c77e: not found`。
该尝试未创建测试命名空间或 PVC。

随后从同一 Nginx 基础镜像构建含独有 LABEL 的单平台镜像，使用
`docker build --platform linux/arm64 --provenance=false --load`，再通过
`kind load docker-image` 装入指定集群。三个节点的镜像列表均已核查；
在两个 worker 上分别以 `imagePullPolicy: Never` 启动测试 Pod，均成功
输出 `local-image-ok`，证明不是从远程仓库拉取。实际构建日志及唯一标签
保存在 JSON 中。

因此后续自建前后端/API 报告镜像按单平台构建、唯一标签、指定集群装载，
各清单引用与装载标签完全一致。新源码内容使用新标签。
官方 PostgreSQL 等第三方镜像仍需在实际部署时验证架构与拉取/装载。

### 存储：Pod 重建保留数据

在临时命名空间创建 `standard`、64Mi、ReadWriteOnce 的 PVC，创建写入 Pod
触发供卷，PVC 变为 Bound。写入 `kind-pvc-proof` 后删除写入 Pod，保留 PVC；
新建读取 Pod，成功读取并校验同一内容。两次 Pod 均调度到
`venue-lab2-worker2`，PV 节点亲和性保存在证据中。

此结果证明当前 kind 节点本地卷在 Pod 删除重建后保留数据，不证明跨节点、
跨宿主机或删除 kind 集群后的数据恢复。PostgreSQL StatefulSet 的业务数据
和报告数据保留仍需后续单独验收。临时命名空间及其测试 PVC/Pod 已删除；
测试宿主机镜像标签已清理，kind 节点内可能保留测试镜像缓存。

## 保留的独立 V4 验证

原有 [V4 验证脚本](../scripts/verify-report-schema.py) 和
[52 项验证结果](assets/lab2/v4-verification.json) 均保留。其来源提交为
`aaa9a26ded8d1c86bc3a38302c77fb91ce7b96f3`，结果为 PASS；属于临时
PostgreSQL/Flyway 独立验证，不等于本 kind 集群中 Flyway/API 已验收。

## 数据库基础设施交付

C 已部署 `venue-booking` 命名空间、`venue-config` ConfigMap、
`venue-db-credentials` Secret、数据库 Services、StatefulSet 和 PVC。
部署命令及依赖顺序见 [Kubernetes 部署说明](../k8s/README.md)，实测输出见
[数据库基础设施证据](assets/lab2/database-infrastructure.json)。

- PostgreSQL 使用官方 `postgres:16.15-bookworm`；通过选定 `linux/arm64`
  的镜像归档成功装载到三个 kind 节点。
- `database-0` 已 Ready，`postgres-data-database-0` 为 Bound：
  1Gi、ReadWriteOnce、`standard`。实际数据库目录为
  `/var/lib/postgresql/data/pgdata`。
- 临时客户端调度到另一 worker，通过 Service/DNS 和 Secret 注入的凭据
  成功认证；无头 Service 和稳定 Pod 名称也已验证。
- 删除一次 `database-0` 后 StatefulSet 自动恢复：Pod UID 改变，PVC UID
  和 PV 名称不变，独有测试 schema 中的探针记录仍可通过 Service 读取。
- 共 8 项基础设施检查通过，临时测试 schema 与客户端 Pod 均已清理；
  Secret 未变化，业务表没有创建或修改。随机密码仅在集群 Secret 中。

此证据验证 PostgreSQL 本身的 Pod 重建数据保留，不是最终场地、预约和报告
的业务持久化验收。下一步交给 B 部署双 API、执行 Flyway V1–V4 并运行手动
Job；其后共同验证真实业务记录及报告。当前不将这些待执行项记为通过。
