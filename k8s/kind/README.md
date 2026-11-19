# Lab 2 kind 集群

集群名称为 `venue-lab2`，context 为 `kind-venue-lab2`。最终展示资源
可部署到 `venue-booking-final` 命名空间，清单及步骤见
[最终展示部署说明](../final/README.md)。本目录使用独立 kind CLI，
Docker Desktop 提供 Docker 引擎。

## 工具与配置

- Docker 引擎必须启动，配置足够的 CPU、内存与磁盘。
- 本项目使用 kind `v0.33.0`；kubectl 使用与集群兼容的版本。
- `cluster.yaml` 为 1 control-plane + 2 worker，所有节点固定 Kubernetes
  `v1.34.11` 的同一镜像摘要；该镜像由 kind v0.33.0 官方发布，支持
  Linux ARM64/AMD64。Mac ARM64 和 Windows AMD64 应使用各自平台的工具，
  容器镜像架构须与节点匹配。版本与摘要依据
  [kind 官方发布](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0)。
- kind 安装方法见[官方快速入门](https://kind.sigs.k8s.io/docs/user/quick-start/)。

## 创建和核查

从仓库根目录执行。先检查已有集群；已有 `venue-lab2` 时直接核查其
版本、节点和数据，不删除重建。

```sh
kind version
kind get clusters
# 仅当 venue-lab2 尚不存在时执行：
kind create cluster --name venue-lab2 --config k8s/kind/cluster.yaml --wait 5m --retain
kubectl --context kind-venue-lab2 version
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 get nodes -o custom-columns=NAME:.metadata.name,ARCH:.status.nodeInfo.architecture,TAINTS:.spec.taints
kubectl --context kind-venue-lab2 get pods -A -o wide
kubectl --context kind-venue-lab2 get storageclass -o wide
```

`--retain` 在建群失败时保留节点，供日志诊断。所有节点 Ready、系统组件就绪后，
核查 StorageClass，并验证 PVC 绑定、挂载及 Pod 重建后的数据保留。
节点本地存储不保证删除 kind 集群后恢复数据。

## 镜像和访问

从当前源码构建固定且唯一标签的镜像，并装载到集群。`--platform`
应与节点架构一致；下面以 ARM64 为例。前端构建将 `./api` 换成
`./frontend`，镜像标签替换为实际构建值。

```sh
docker build --platform linux/arm64 --provenance=false --load -t <image:unique-tag> ./api
kind load docker-image <image:unique-tag> --name venue-lab2
```

装载后核对各节点镜像和 Pod 事件。API Deployment、手动 Job 和 CronJob
使用同一 API 镜像标签，内容变化时更换标签。不能把宿主机有镜像当作
节点已可用的证据。

数据库、配置、API 和前端部署完成后，前端入口为：

```sh
kubectl --context kind-venue-lab2 -n venue-booking-final port-forward service/frontend 8080:80
```

不配置额外的宿主机端口映射；数据库不向集群外发布。
