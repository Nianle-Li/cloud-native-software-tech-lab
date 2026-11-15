# Lab 2 共同 kind 集群

按公共契约，唯一共同验收集群为 `venue-lab2`，context 为
`kind-venue-lab2`，业务命名空间为 `venue-booking`。
本目录使用独立 kind CLI，Docker Desktop 提供 Docker 引擎。
Docker Desktop 内置 kubeadm 集群 `docker-desktop` 不作为本次验收环境。
实际创建与验证结果见 [C 的环境记录](../../docs/lab2-environment.md)。

## 工具与配置

- Docker 引擎必须启动，配置足够的 CPU、内存与磁盘。
- 本次采用 kind `v0.33.0`，kubectl `v1.34.1`。
- `cluster.yaml` 为 1 control-plane + 2 worker，所有节点固定 Kubernetes
  `v1.34.11` 的同一镜像摘要；该镜像由 kind v0.33.0 官方发布，支持
  Linux ARM64/AMD64。Mac ARM64 和 Windows AMD64 应使用各自平台的工具，
  容器镜像架构须与节点匹配。版本与摘要依据
  [kind 官方发布](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0)。
- kind 安装方法见[官方快速入门](https://kind.sigs.k8s.io/docs/user/quick-start/)。
  C 本机将已校验官方 SHA256 的 ARM64 二进制安装在 `~/.local/bin/kind`；
  终端需将该目录加入 PATH，或使用绝对路径。

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

`--retain` 在建群失败时保留节点，供日志诊断；它不代表创建成功。
不要把配置文件或计划输出当作实测。所有节点 Ready、系统组件就绪后，
再记录实际 StorageClass 并验证 PVC 绑定、挂载及 Pod 重建后的数据保留。
节点本地存储不保证删除 kind 集群后恢复数据。

## 镜像和访问

从已确认的源码提交构建固定且唯一标签的镜像，记录构建提交及架构，
再装载到共同集群。本机节点为 ARM64，采用单平台构建并关闭 provenance，
避免 Docker containerd 镜像存储导出多架构索引时缺少其他平台内容。
以下占位值必须替换为实际交付标签；前端构建将 `./api` 换成 `./frontend`。

```sh
docker build --platform linux/arm64 --provenance=false --load -t <image:unique-tag> ./api
kind load docker-image <image:unique-tag> --name venue-lab2
```

装载后核对各节点镜像和 Pod 事件。API Deployment、手动 Job 和 CronJob
使用同一 API 镜像标签，内容变化时更换标签。不能把宿主机有镜像当作
节点已可用的证据。

数据库、配置、API 和前端部署完成后，前端入口为：

```sh
kubectl --context kind-venue-lab2 -n venue-booking port-forward service/frontend 8080:80
```

不配置额外的宿主机端口映射；数据库不向集群外发布。
A/B 的个人 kind 集群只作开发，最终检查需在 C 提供的共同宿主机终端中
执行。复制 kubeconfig 不会自动让其他电脑连到本机 API。
