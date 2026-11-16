# 前端 Kubernetes 部署与验证

本清单使用 `venue-booking` 命名空间中的 `frontend` Deployment/Service 和
`frontend-nginx` ConfigMap。Nginx 将同源 `/api/` 请求转发至 `api:8080`，
不改变请求路径及查询参数；静态页面由同一个 Service 提供。先创建 `api`
Service，再启动前端 Pod，否则 Nginx 启动时无法解析上游名称。

## 镜像与部署

清单当前引用 `venue-booking-frontend:lab2-eda8edd`：其前端源码来自提交
`eda8edd`。在承载共同 kind 集群的 Mac 上，从包含该提交的仓库版本构建
ARM64 镜像；前端源码变化后必须使用新标签，并同步 Deployment 清单。

```sh
docker build --platform linux/arm64 --provenance=false --load \
  -t venue-booking-frontend:lab2-eda8edd ./frontend
kind load docker-image venue-booking-frontend:lab2-eda8edd --name venue-lab2

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

此处的构建、装载和部署命令是待执行步骤，不代表已经在共同集群验证。
集群的两个 worker 为 ARM64；在其他架构的个人环境构建时，应使用该环境
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
这个检查依赖 B 的 API 已就绪；仅有首页 HTTP 200 不足以证明代理可用。
在 B 的手动 Job 已成功、报告可查询后，从同一台机器另开终端运行真实浏览器
回归。`LAB2_REPORT_JOB_ID` 填共同集群中已成功、含零值场地的 Job 名称。
该测试不启动模拟 API，也不拦截请求；它会在数据库中创建带唯一批次标识的
场地和预约，并取消该预约，保留记录便于追踪。报告测试所用的成功 Job 须
事先准备好有效预约和零值场地。命令在 `frontend/` 目录执行：

```sh
LAB2_BASE_URL=http://127.0.0.1:8080 \
LAB2_REPORT_JOB_ID=your-successful-job-id npm run test:cluster
```

测试分别核对场地创建/详情、预约成功/冲突/详情/取消，以及现有报告在页面上
的查询。记录测试批次、场地/预约 ID、Job ID、镜像标签和运行时间；不能把本地
模拟 API 的 Playwright 测试结果记为共同集群验收。
若前端 Pod 启动失败，核对 `api` Service 是否已创建、镜像标签是否已装载、
ConfigMap 的 `default.conf` 键及 Pod 事件。若 ConfigMap 变更，执行：

```sh
kubectl --context kind-venue-lab2 -n venue-booking rollout restart deployment/frontend
kubectl --context kind-venue-lab2 -n venue-booking rollout status deployment/frontend --timeout=120s
```
