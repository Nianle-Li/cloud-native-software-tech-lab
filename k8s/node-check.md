# 节点 DNS 检查 DaemonSet

`node-check` 在每个符合调度条件的节点运行一个 Pod。Pod 从 Downward API
读取 `NODE_NAME` 和 `HOST_IP`，每 30 秒记录 UTC 时间与
`kubernetes.default.svc.cluster.local` 的 DNS 查询结果。DNS 失败会写入日志，
下一轮继续检查；readiness 探针也执行同一查询，因此 DNS 不可用时 Pod
不会显示为就绪。
使用完整名称是因为 BusyBox `nslookup` 在个人和共同 kind 集群中查询
`kubernetes.default.svc` 均返回 `NXDOMAIN`，而完整名称均可解析。
本任务不挂载宿主机目录，不使用特权或 Kubernetes API 凭据，也不提供 Service。

## 独立测试与镜像

在有 Docker 的机器上先运行脚本测试。测试用假的 `nslookup` 分别模拟成功
与失败，避免把外部网络状态当成脚本正确性的证据：

```sh
docker run --rm -v "$PWD:/work:ro" \
  busybox:1.37.0 sh /work/node-check/test-node-check.sh
```

清单引用 `venue-booking-node-check:lab2-20261116-01`。在承载共同 kind 集群
的 ARM64 Mac 上从仓库根目录构建、装载；脚本或 Dockerfile 改动后，必须
更换标签并同步 DaemonSet 清单。

```sh
docker build --platform linux/arm64 --provenance=false --load \
  -t venue-booking-node-check:lab2-20261116-01 ./node-check
kind load docker-image venue-booking-node-check:lab2-20261116-01 --name venue-lab2
kubectl --context kind-venue-lab2 -n venue-booking apply --dry-run=server \
  -f k8s/base/node-check-daemonset.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/node-check-daemonset.yaml
kubectl --context kind-venue-lab2 -n venue-booking rollout status daemonset/node-check --timeout=120s
```

这些是待执行的共同集群步骤；本地 Docker 测试不证明 DaemonSet 已覆盖节点。
当前集群有两个无污点的 worker，control-plane 有 `NoSchedule` 污点；
清单未添加该污点的容忍，因此预期在两个 worker 各有一个 Pod。

## 共同集群验收

```sh
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 -n venue-booking get daemonset node-check -o wide
kubectl --context kind-venue-lab2 -n venue-booking get pods -l app.kubernetes.io/component=node-check -o wide
kubectl --context kind-venue-lab2 -n venue-booking logs -l app.kubernetes.io/component=node-check --prefix --tail=20
```

将 DaemonSet 的 DESIRED、CURRENT、READY 与可调度节点逐一核对，并用
Pod 的 NODE 列和日志中的 `NODE_NAME`、`HOST_IP` 验证身份。每个 Pod 日志
应有带时间的 `dns=ok` 和解析结果；若出现 `dns=failed`，检查集群 DNS
Service、Pod 的 DNS 配置及节点网络，不将 Pod 运行中误写成 DNS 检查通过。
控制平面是否应该覆盖以实际污点和调度条件为准。
