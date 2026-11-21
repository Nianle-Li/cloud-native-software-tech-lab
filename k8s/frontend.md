# 前端 Kubernetes 部署与验证

本页的命令只操作 `venue-booking` 专项验收命名空间；最终展示的部署、只读访问与报告核对见 [最终展示说明](final/README.md)。两者复用前端资源设计，但浏览器回归会新增持久数据，不应对固定展示数据重复运行。本清单使用 `venue-booking` 命名空间中的 `frontend` Deployment/Service 和
`frontend-nginx` ConfigMap。Nginx 将同源 `/api/` 请求转发至 `api:8080`，
不改变请求路径及查询参数；静态页面由同一个 Service 提供。先创建 `api`
Service，再启动前端 Pod，否则 Nginx 启动时无法解析上游名称。

## 镜像与部署

清单当前引用 `venue-booking-frontend:lab2-report-query-02`，包含报告查询超时
处理、北京时间显示与报告快照说明。在承载指定 kind 集群的 Mac 上，从包含
这些改动的源码构建 ARM64 镜像；前端源码再次变化后须使用新标签，并同步
Deployment 清单。构建和交接时记录实际源码提交与镜像摘要。

```sh
docker build --platform linux/arm64 --provenance=false --load \
  -t venue-booking-frontend:lab2-report-query-02 ./frontend
kind load docker-image venue-booking-frontend:lab2-report-query-02 --name venue-lab2

kubectl --context kind-venue-lab2 -n venue-booking apply --dry-run=server \
  -f k8s/base/frontend-nginx-configmap.yaml \
  -f k8s/base/frontend-service.yaml \
  -f k8s/base/frontend-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/frontend-nginx-configmap.yaml \
  -f k8s/base/frontend-service.yaml \
  -f k8s/base/frontend-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/frontend --timeout=120s
```

构建后核对节点实际装载的镜像摘要，
再通过真实页面检查场地、预约和报告查询。
集群的两个 worker 为 ARM64；在其他节点架构构建时，应使用该环境
的实际平台并另取标签。ConfigMap 只挂载到 `/etc/nginx/conf.d`，不改动
Lab 1 Compose 使用的 `frontend/nginx.conf`。Nginx 不会因 ConfigMap 内容
更新自动重载；修改配置并重新应用后，需重启前端 Deployment。

## 验证

先检查 Pod、Service 端点和 Nginx 日志；在另一终端执行端口转发：

```sh
kubectl --context kind-venue-lab2 -n venue-booking get pods,svc -l app.kubernetes.io/component=frontend -o wide
kubectl --context kind-venue-lab2 -n venue-booking get endpointslice -l kubernetes.io/service-name=frontend
kubectl --context kind-venue-lab2 -n venue-booking logs deployment/frontend
kubectl --context kind-venue-lab2 -n venue-booking port-forward service/frontend 8080:80
```

然后从同一台 Mac 的浏览器打开 `http://127.0.0.1:8080/#/reports`，
用真实 Job ID 查询报告；同时检查原有场地和预约页面。可用
`curl -i http://127.0.0.1:8080/api/instance` 核对代理已到达 API。
这个检查依赖 API 已就绪；仅有首页 HTTP 200 不足以证明代理可用。
在手动 Job 已成功、报告可查询后，从同一台机器另开终端运行真实浏览器
回归。`LAB2_REPORT_JOB_ID` 填目标集群中已成功、同时含零值与非零值场地的 Job 名称。
该测试不启动模拟 API，也不拦截请求；它会在数据库中创建名称简短的
场地和预约，并取消该预约。完整批次号及场地、预约 ID 写入测试输出，
用于追踪真实记录。新场地会永久保留，重复运行将增加后续报告的零值行；
日常回归宜在隔离的验收命名空间执行，展示数据只用于约定的核对批次。
已有报告保存了场地名称快照，不应改写历史数据来美化截图。
报告测试所用的成功 Job 须事先准备好有效预约和零值场地。
命令在 `frontend/` 目录执行：

```sh
LAB2_BASE_URL=http://127.0.0.1:8080 \
LAB2_REPORT_JOB_ID=your-successful-job-id npm run test:cluster
```

测试分别核对场地创建/详情、预约成功/冲突/详情/取消，以及现有报告在页面上
的零值与非零值明细。记录测试批次、场地/预约 ID、Job ID、镜像标签和运行时间；
真实集群回归须标明实际 context、命名空间和镜像；本地模拟 API 不能代替真实集群回归。最终前端源码的浏览器回归和镜像对应关系已归入[最终验收记录](../docs/lab2/acceptance.md#最终逐项验收结论)。
若前端 Pod 启动失败，核对 `api` Service 是否已创建、镜像标签是否已装载、
ConfigMap 的 `default.conf` 键及 Pod 事件。若 ConfigMap 变更，执行：

```sh
kubectl --context kind-venue-lab2 -n venue-booking rollout restart deployment/frontend
kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/frontend --timeout=120s
```

## 如需在指定集群重复浏览器回归

以下命令在承载指定集群的机器上、从仓库根目录执行。`venue-booking-final` 保持只读；在同一集群的 `venue-booking` 部署已用于最终展示的前端镜像，再运行会写入数据的回归。不要重新构建或覆盖 `lab2-report-query-02` 标签。

```sh
kubectl --context kind-venue-lab2 get nodes -o wide
kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/frontend-nginx-configmap.yaml \
  -f k8s/base/frontend-service.yaml \
  -f k8s/base/frontend-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/frontend --timeout=120s
```

分别核对两个命名空间中就绪前端 Pod 的镜像标签和 `imageID`。标签均应为 `venue-booking-frontend:lab2-report-query-02`，实际 `imageID` 必须一致；若不一致，先检查节点镜像缓存与 Pod 调度位置，不运行回归。

```sh
kubectl --context kind-venue-lab2 -n venue-booking-final get pods \
  -l app.kubernetes.io/component=frontend \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.containers[0].image}{" "}{.status.containerStatuses[0].imageID}{"\n"}{end}'
kubectl --context kind-venue-lab2 -n venue-booking get pods \
  -l app.kubernetes.io/component=frontend \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.containers[0].image}{" "}{.status.containerStatuses[0].imageID}{"\n"}{end}'
```

专项环境的手动报告 `venue-report-manual-20261119102922-01fd83` 已记录非零和零值行。先在单独终端转发专项环境的前端 Service；若该报告已不存在，选用本命名空间另一份同时含非零和零值行的成功报告：

```sh
kubectl --context kind-venue-lab2 -n venue-booking port-forward service/frontend 8080:80
```

在另一终端从仓库根目录保存证据并运行测试。先经转发的前端 Service 查询报告，确认请求到达实际 API。测试只向 `venue-booking` 新增一处场地和一笔随后取消的预约。若改用其他报告，须同步修改查询 URL 和 `LAB2_REPORT_JOB_ID`。
首次在该机器运行前，按 `frontend/package.json` 的 Node 版本要求安装依赖和 Playwright Chromium；测试源码及前端清单应与记录的提交一致。

```sh
git diff --exit-code HEAD -- frontend k8s/base/frontend-deployment.yaml
evidence_dir="$(pwd)/.lab2-evidence/final-frontend-e2e-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$evidence_dir"
git rev-parse HEAD > "$evidence_dir/source-commit.txt"
kubectl config get-contexts kind-venue-lab2 > "$evidence_dir/context.txt"
kubectl --context kind-venue-lab2 get nodes -o wide > "$evidence_dir/nodes.txt"
kubectl --context kind-venue-lab2 -n venue-booking-final get pods \
  -l app.kubernetes.io/component=frontend -o json > "$evidence_dir/display-frontend-pods.json"
kubectl --context kind-venue-lab2 -n venue-booking get pods \
  -l app.kubernetes.io/component=frontend -o json > "$evidence_dir/acceptance-frontend-pods.json"
curl -fsS http://127.0.0.1:8080/api/reports/venue-report-manual-20261119102922-01fd83 \
  > "$evidence_dir/report-before.json"
cd frontend
set -o pipefail
LAB2_BASE_URL=http://127.0.0.1:8080 \
LAB2_REPORT_JOB_ID=venue-report-manual-20261119102922-01fd83 \
npm run test:cluster -- --reporter=list 2>&1 | tee "$evidence_dir/browser-e2e.txt"
```

若另行要求每项检查都在指定集群重复，最终记录须同时显示指定集群 context、两个前端 Pod 相同的 `imageID`、报告 Job ID、浏览器两项测试通过，以及测试输出中的场地和预约 ID。该重复检查会在专项命名空间永久新增业务数据；现有逐项验收结论及证据范围以[最终验收记录](../docs/lab2/acceptance.md)为准。
