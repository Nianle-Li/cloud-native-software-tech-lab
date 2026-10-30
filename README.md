# 场地预约系统 · 云原生软件技术 Lab 1

本仓库实现课程 Lab 1 的场地预约系统，包含前端、Web API、PostgreSQL 及 Docker Compose 三服务部署。2026-10-30 已完成从源码构建、真实页面与 API 联调、并发冲突和容器重建后的持久化验收。实际验证范围与证据见[验收清单](docs/acceptance.md#5-统一部署与验收实际记录2026-10-30)。

开发前请阅读：

- [公共契约：架构、数据、API 与容器配置](docs/contract.md)
- [三人总分工](docs/team-plan.md)
- [验收与实验报告清单](docs/acceptance.md)
- [Lab 1 实验报告](docs/lab1-report.md)

课程任务书《云原生软件技术-Lab1-场地预约系统开发与Docker容器化.pdf》由课程渠道获取，仅作本地参考，不纳入 Git；任务书要求优先于仓库文档。

独立数据库验证可在 Docker 引擎运行且安装 Python 3.9 或更新版本后执行 `python3 scripts/verify-database.py`（Windows 可用 `python`）。脚本仅启动独立验证项目的数据库，临时运行 Flyway 并检查迁移、种子和约束；结束后停止容器、保留验证卷，不依赖后端，也不代表完整系统已通过验收。环境要求、复现步骤及实际结果见[验收清单第 4 节](docs/acceptance.md#4-c-的分阶段检查与进度)。

## 完整系统部署

准备 Docker Engine（或已启动引擎的 Docker Desktop）及支持本项目语法的 Docker Compose。项目使用 Compose v2 兼容语法，本机实测为 Docker Engine 29.2.1、Compose v5.1.0。前后端在 Docker 构建阶段编译，完整容器部署不要求宿主机预装 Node、Java 或 Maven；首次构建需要联网下载基础镜像及依赖。

进入仓库根目录，首次运行时复制配置模板：

```sh
cp .env.example .env
```

PowerShell 使用 `Copy-Item .env.example .env`。已有 `.env` 时保留原配置，不重复覆盖。编辑本地 `.env`，将模板密码替换为仅供本地实验使用的密码；该文件已被 Git 忽略，不提交或截图展示其内容。

| 变量 | 配置说明 |
|---|---|
| `POSTGRES_DB` | 数据库名，模板为 `venue_booking` |
| `POSTGRES_USER` | 数据库用户名，模板为 `venue_booking` |
| `POSTGRES_PASSWORD` | 本地实验密码；数据库和 API 使用同一个值 |
| `FRONTEND_PORT` | 前端宿主机端口，默认 `8080` |

保持在仓库根目录，运行：

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 frontend api database
```

打开 `http://localhost:8080/`；若修改了 `FRONTEND_PORT`，使用相应端口。仅前端发布宿主机端口；API 和数据库分别在 Compose 网络内监听 `8080`、`5432`。`api` 等待数据库健康后启动，前端启动不代表 API 已就绪，应等 API 日志显示启动成功后使用。

在 Compose 网络内检查应用与数据库健康：

```sh
docker compose exec -T frontend wget -qO- http://api:8080/actuator/health
```

顶层 `status` 和 `components.db.status` 均应为 `UP`。正常停止执行 `docker compose down`，再次启动执行 `docker compose up -d`；数据库保存在 `postgres_data` 命名卷中。持久化验收不使用 `down -v`。在默认项目名下，实际卷名为 `cloud-native-software-tech-lab_postgres_data`；改变项目名会使用另一组项目资源。

数据库卷已初始化后，仅修改 `.env` 不会重设已有数据库的用户名或密码。访问失败时先检查 `docker compose ps` 和日志；宿主机端口占用可调整 `FRONTEND_PORT`。若基础镜像认证或依赖下载超时，先排查 Docker Hub、npm 和 Maven 仓库连接；本次基础镜像预拉取后重新构建成功。若本机 HTTP 检查经代理返回 `502`，应核对代理是否绕过 `localhost`、`127.0.0.1`；本次禁用检查请求的代理后，首页和 `/api/venues` 均返回 `200`。

运行及持久化验证记录见[实验报告的 C 部分](docs/lab1-report.md#6-系统部署与功能验收)与[验收清单](docs/acceptance.md#5-统一部署与验收实际记录2026-10-30)。

## 前端开发

前端使用 React 19、Vite 8、TypeScript 7，按[公共契约](docs/contract.md)调用 `/api/venues` 和 `/api/reservations`。界面提供场地概览 `#/`、创建场地 `#/venues/new`、场地详情 `#/venues/{id}`、指定场地预约 `#/venues/{id}/book`、预约记录 `#/reservations`、预约详情 `#/reservations/{id}` 六个视图；地址片段支持刷新后回到当前视图。概览卡片直接展示场地位置、时间、容量与状态，并提供独立详情入口；开放场地的整张卡片可进入预约视图。详情页分别调用 `GET /api/venues/{id}`、`GET /api/reservations/{id}`，展示完整资料并支持刷新，记录卡同时显示场地名称和编号。预约表单下方显示对应场地的提交结果，并提供记录页入口；记录视图重新进入时获取数据，刚完成创建或取消后则先保留服务端已确认的本地结果。记录页提供状态筛选和二次确认的取消操作，超过 6 条时在浏览器内分页，不改变 API 的无分页数组契约。刷新失败时保留上次成功加载的记录并提示其可能过时。前端提交前检查必填文字、人数、日期及开放时段，日期与当天时间按 `Asia/Shanghai` 解释；服务端仍负责最终校验和冲突判定。各视图使用统一的浅色鼠尾草绿与暖米色配色；正文使用随项目提供的 Noto Sans SC 子集及系统字体回退，首页标题单独使用马善政楷书子集，不依赖运行时外部字体或图片服务。字体来源及许可分别见 [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) 的 [OFL.txt](frontend/src/assets/fonts/OFL.txt) 和 [Ma Shan Zheng](https://github.com/googlefonts/mashanzheng) 的 [MaShanZheng-OFL.txt](frontend/src/assets/fonts/MaShanZheng-OFL.txt)。

导航和概览列表均提供“创建场地”入口。表单填写名称、位置、容量、每日开放/关闭时间及开放/停用状态，通过 `POST /api/venues` 创建；名称和位置在提交前去除首尾空白。仅在服务器返回符合契约的 `201` 和场地对象后显示成功编号、清空表单并更新概览；开放场地可直接进入预约页。提交期间禁止修改和重复提交，失败及站内切页时保留草稿，刷新整个页面会清除草稿。网络错误、服务端错误或无效响应只提示结果无法确认，应先返回概览刷新场地列表核对，避免重复创建。

创建场地的需求对应、测试驱动过程及实际验证范围见[前端创建场地检查记录](docs/frontend-create-venue-check.md)。
任务书前端功能的逐项核对与详情页决策见[前端需求完整性审查](docs/frontend-requirements-audit.md)。

### 本地安装与自动检查

使用 Node.js 24.15.0 或 `package.json` 所列兼容版本。先打开 **PowerShell 终端**，进入仓库根目录；以下命令必须在同一个终端依次运行：

```powershell
Set-Location 'D:\learning_materials\Cloud-Native_Software_Technology\lab\cloud-native-software-tech-lab'
Set-Location frontend
node --version
npm --version
npm ci
npm test
npm run build
npm run dev
```

`npm ci` 应无错误结束；`npm test` 应全部通过；`npm run build` 应生成 `frontend/dist/index.html`。`npm run dev` 会持续运行而不是自动退出，终端应显示 Vite 本地地址（通常为 `http://localhost:5173/`）；打开该地址，确认页面标题为“场地预约系统”。结束开发服务器按 `Ctrl+C`。`frontend/.npmrc` 将依赖源设为 npm 官方源，并把缓存放在可写的 `frontend/.npm-cache/`；缓存、依赖和构建产物均不纳入 Git。

前端另有真实 Chromium 回归检查：在 `frontend/` 中先运行 `npx playwright install chromium`，再运行 `npm run test:layout`。该命令会复用或启动本地模拟 API 和 Vite，检查六个视图在窄屏、桌面、放大文字和长内容下的布局，以及创建场地、预约、冲突提示、取消后重新预约等点击流程；浏览器下载仅需在首次运行时完成。

### 使用模拟 API 手动检查前端交互

不启动后端时，可用模拟 API 独立检查前端。在 **第二个 PowerShell 终端**进入 `frontend/` 并运行 `npm run mock:api`，保持该终端运行；第一个终端运行 `npm run dev`。打开 Vite 页面检查：

1. 概览卡片显示场地位置、时间、容量与状态。滚动到开放场地并点击卡片任意位置，进入对应预约页后应从页面顶部显示；模拟数据中的“维护中的场地 C”应显示停用且不能点击预约。
2. 从概览或导航进入“创建场地”，填写有效资料并提交，确认成功编号、表单清空、概览出现新场地，刷新列表及浏览器后仍可查询；开放的新场地可以预约。另建一个停用场地，确认显示停用且无法预约。空白名称/位置、非正整数容量、相等或颠倒的开放时段应被拒绝；失败或站内切页再返回时输入应保留。
3. 在预约页填写未来日期和开放时段内的预约，提交后在表单下方显示成功编号；点击“查看预约记录”进入记录页核对。重复提交同场地、同日期、重叠时段时应显示冲突提示。取消时先点击对应记录的“取消预约”，再点击“确认取消预约”；选择“保留预约”不会发送取消请求。服务器确认取消后状态变为“已取消”。
4. 填入过去日期、颠倒的起止时间或超出容量的人数，提交时应显示本地错误且保留输入；后端仍会独立校验实际收到的请求。服务端返回字段校验详情时，页面会显示对应字段及原因。
5. 场地或预约记录加载失败后，用对应视图的“刷新”按钮重新获取。记录页刷新失败后，已加载的记录仍显示，并标明可能不是最新；没有刚完成写入时，离开再进入记录页会重新获取服务器数据。场地刷新期间不可提交预约，若场地仍开放，已填写的表单草稿保留。
6. 创建或取消预约时若提示结果无法确认，先进入记录页刷新核对，再决定是否重试；返回原场地预约页后，未成功提交的草稿应保留。创建场地时遇到同类提示，应返回场地概览刷新场地列表核对。
7. 创建 7 条不冲突的预约，确认记录区出现分页；切换“有效”与“已取消”筛选时，数量与显示的记录一致。
8. 从场地卡片打开独立详情页，核对编号、位置、容量、时间与状态，开放场地可从详情进入预约。记录卡应显示场地名称与编号；打开预约详情页，核对完整记录与状态。直接访问或刷新两个详情地址应可查询；不存在的编号应显示明确错误。

在浏览器开发者工具中分别以约 `375`、`800`、`1024`、`1366`、`1920` 像素宽度检查六个视图，确认导航、场地卡片、详情、表单和记录区布局协调、文字完整且无需横向滚动。

刷新页面后，当前模拟进程中的记录仍可见；停止模拟进程后数据即丢失。模拟 API 仅实现页面使用的接口，用于前端手动检查；它不是后端、数据库、持久化或完整系统验收证据。

本地 Vite 把 `/api` 代理到 `VITE_API_PROXY_TARGET` 指定的服务；默认目标为 `http://127.0.0.1:8081`，与上述模拟 API 一致。与仓库中的真实后端联调时，在启动 Vite 前将该变量设为后端实际地址。浏览器代码始终只请求相对路径 `/api`。`frontend/Dockerfile` 使用 Node 构建、Nginx 运行；Nginx 将 `/api/` 原样代理到 Compose 服务 `api:8080`，该通信链路已在完整三服务部署中验证。默认 Compose 不发布 API 端口，使用 Vite 开发时须另行提供宿主机可访问的真实后端地址。

### 前端容器单独检查

启动 Docker Desktop 后，在仓库根目录运行：

```powershell
docker build -t venue-booking-frontend:lab1-local ./frontend
docker run --rm -p 127.0.0.1:18080:80 venue-booking-frontend:lab1-local
```

打开 `http://127.0.0.1:18080/`，应能看到前端页面；按 `Ctrl+C` 结束容器。**单独运行前端容器时无法加载场地或提交预约是预期情况**，因为此时没有 `api` 服务；独立检查前端预约可按上文同时运行 Vite 和模拟 API。Nginx 在收到 `/api/` 请求时通过 Docker 网络解析 `api`，因此单独运行前端容器也能先提供静态页面。此检查只用于前端镜像；完整系统使用上文的三服务部署流程。

若 `npm` 在 PowerShell 中提示 `npm.ps1` 被禁止运行，可在上述命令中改用 `npm.cmd`，无需修改系统执行策略。若提示 `node` 或 `npm` 未找到，先安装兼容的 Node.js 并重开终端；若 `npm ci` 失败，先确认当前目录末尾是 `frontend`，再检查网络能否访问 npm 官方源。若页面显示“无法连接服务器”，检查模拟 API 或真实后端是否正在运行、端口是否为 `8081`。若场地正常显示但无法提交，检查是否填写了必填项、选择未来日期、时间处于该场地开放时段内且人数不超过容量；页面会显示本地或服务器给出的具体错误。本地端口被占用时，停止已有进程或按 Vite 实际显示的地址访问。

历史前端检查文档中的模拟 API 结果保留其原始验证范围；后续真实三服务验收结果统一见[验收清单](docs/acceptance.md#5-统一部署与验收实际记录2026-10-30)。
