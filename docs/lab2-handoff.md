# Lab 2 交接记录

本文件是 A、B、C 的唯一交接记录。每次进入下一阶段前，交付方先更新自己的交付区，执行方完成后再更新对应的执行回传区。聊天消息可以提醒成员，但不能替代本文件中的记录。

## 使用规则

- A/B 更新交付信息：源码提交、镜像标签、完整执行命令、依赖条件、预期结果和需要 C 回传的输出。
- C 更新执行回传：执行时间、成功或失败、实际日志/证据位置及待处理问题；没有执行的项目写“未执行”，不要填计划结果。
- 每次交接使用新日期和唯一批次标识；不要覆盖已经完成的历史记录。
- 代码提交、镜像标签、清单引用必须互相对应。镜像内容变化必须使用新标签，不能覆盖旧标签后继续使用 `IfNotPresent`。
- 共同集群记录统一使用 `cluster=venue-lab2`、`context=kind-venue-lab2`、`namespace=venue-booking`。真实 Secret 值、密码和令牌不得写入此文件。

## 交接模板

### A/B 交付区

```text
交付时间：<Asia/Shanghai 时间>
交付成员：<A 或 B>
交付内容：<例如 API 双副本 / 手动报告 Job / CronJob>
源码版本：branch=<...> commit=<...> merged_to_develop=yes/no
镜像：name=<...> tag=<...> platform=<linux/arm64|linux/amd64> source_commit=<...>
清单/脚本：<文件路径>
依赖条件：<集群、资源、ConfigMap、Secret、上游交付>
执行命令：<从仓库根目录按顺序列出完整命令>
预期结果：<成功条件>
请 C 回传：<状态、日志位置、Pod/Job 名称、API 响应、数据库/迁移版本等>
```

### C 执行回传区

```text
执行时间：<Asia/Shanghai 时间>
执行成员：C
环境：host=<...> cluster=venue-lab2 context=kind-venue-lab2 namespace=venue-booking
实际执行：<实际执行的命令或脚本>
结果：SUCCESS / FAILED / PARTIAL / NOT_RUN
资源状态：<rollout、Pod 名称/节点/READY、PVC、Service、Job 状态>
日志/证据位置：<文件路径、命令输出或截图路径>
待处理问题：<没有则写“无”>
下一步负责人：<A/B/C>
```

## B → C：API 双副本和手动报告 Job

### B 交付区（待 C 执行）

交付时间：2026-11-16（Asia/Shanghai）

交付成员：B

交付内容：API Deployment/Service、Flyway V4、报告查询 API、手动报告 Job

源码版本：`feature/backend`，commit `70c266e`，已合入 `develop`

镜像：`venue-booking-api:lab2-20261113`，目标平台 `linux/arm64`；API Deployment、正式 CronJob、演示 CronJob 和手动 Job 必须使用同一标签

清单/脚本：

- `k8s/base/api-service.yaml`
- `k8s/base/api-deployment.yaml`
- `api/src/main/resources/db/migration/V4__create_report_tables.sql`
- `scripts/create-report-job.py`
- `k8s/jobs/venue-report-manual.yaml.tpl`

依赖条件：C 已在 `venue-lab2` 提供 `venue-booking`、`venue-config`、`venue-db-credentials`、`database:5432` Service、数据库 StatefulSet 和 Bound PVC；API 启动负责执行 Flyway V1–V4。

执行命令：

```sh
docker build --platform linux/arm64 --provenance=false --load \
  -t venue-booking-api:lab2-20261113 api
kind load docker-image venue-booking-api:lab2-20261113 --name venue-lab2

kubectl --context kind-venue-lab2 -n venue-booking apply \
  -f k8s/base/api-service.yaml \
  -f k8s/base/api-deployment.yaml
kubectl --context kind-venue-lab2 -n venue-booking \
  rollout status deployment/api --timeout=180s
kubectl --context kind-venue-lab2 -n venue-booking \
  get pods -l app.kubernetes.io/component=api -o wide

python3 scripts/create-report-job.py \
  2026-11-01 2026-11-06 \
  --image venue-booking-api:lab2-20261113
```

预期结果：两个 API Pod 为 `1/1 Running`，Deployment rollout 成功；API 日志显示 Flyway 已完成或已验证 V1–V4；手动 Job 退出码为 0，数据库中报告状态为 `SUCCEEDED`，每个场地都有一行明细。

请 C 回传：

- API Deployment rollout 输出；
- 两个 API Pod 的名称、节点、READY 状态和镜像 ID；
- Flyway V1–V4 的实际版本输出或 API 启动日志；
- 手动 Job 名称（即 `job_id`）、Job 状态和完整日志位置；
- `GET /api/reports/{job_id}` 的响应；
- 失败时的 `describe`、events、相关 Pod 日志和待处理问题。

### C 执行回传区（待填写）

执行时间：

结果：NOT_RUN

日志/证据位置：

待处理问题：等待 C 在共同 kind 集群执行。

下一步负责人：B 核对回传，A 接入报告页面和 CronJob。
