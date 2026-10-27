# 场地预约系统 · 云原生软件技术 Lab 1

本仓库用于实现课程 Lab 1 的前端、Web API、关系数据库及 Docker Compose 三服务部署。前端源码与测试位于 `frontend/`；后端源码、数据库迁移脚本、根目录 Compose 和环境变量模板已加入仓库。独立 PostgreSQL/Flyway 验证已通过；完整系统联调仍待完成。

开发前请阅读：

- [公共契约：架构、数据、API 与容器配置](docs/contract.md)
- [三人总分工](docs/team-plan.md)
- [验收与实验报告清单](docs/acceptance.md)

课程任务书《云原生软件技术-Lab1-场地预约系统开发与Docker容器化.pdf》由课程渠道获取，仅作本地参考，不纳入 Git；任务书要求优先于仓库文档。

独立数据库验证可在 Docker 引擎运行且安装 Python 3.9 或更新版本后执行 `python3 scripts/verify-database.py`（Windows 可用 `python`）。脚本仅启动独立验证项目的数据库，临时运行 Flyway 并检查迁移、种子和约束；结束后停止容器、保留验证卷，不依赖后端，也不代表完整系统已通过验收。环境要求、复现步骤及实际结果见[验收清单第 4 节](docs/acceptance.md#4-c-的分阶段检查与进度)。

## 前端开发

前端使用 React 19、Vite 8、TypeScript 7，按[公共契约](docs/contract.md)调用 `/api/venues` 和 `/api/reservations`。界面分为场地概览 `#/`、指定场地预约 `#/venues/{id}/book`、预约记录 `#/reservations` 三个视图；地址片段支持刷新后回到当前视图。概览卡片直接展示场地位置、时间、容量与状态；开放场地的整张卡片可进入预约视图，跳转后从页面顶部显示并将焦点移到标题。预约表单下方显示对应场地的提交结果，并提供记录页入口；记录视图重新进入时获取数据，刚完成创建或取消后则先保留服务端已确认的本地结果。记录页提供状态筛选和二次确认的取消操作，超过 6 条时在浏览器内分页，不改变 API 的无分页数组契约。刷新失败时保留上次成功加载的记录并提示其可能过时。前端提交前检查必填文字、人数、日期及开放时段，日期与当天时间按 `Asia/Shanghai` 解释；服务端仍负责最终校验和冲突判定。各视图使用统一的浅色鼠尾草绿与暖米色配色；正文使用随项目提供的 Noto Sans SC 子集及系统字体回退，首页标题单独使用马善政楷书子集，不依赖运行时外部字体或图片服务。字体来源及许可分别见 [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) 的 [OFL.txt](frontend/src/assets/fonts/OFL.txt) 和 [Ma Shan Zheng](https://github.com/googlefonts/mashanzheng) 的 [MaShanZheng-OFL.txt](frontend/src/assets/fonts/MaShanZheng-OFL.txt)。

### 当前阶段：本地安装与自动检查

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

### 当前阶段：手动检查前端交互

不启动后端时，可用模拟 API 独立检查前端。在 **第二个 PowerShell 终端**进入 `frontend/` 并运行 `npm run mock:api`，保持该终端运行；第一个终端运行 `npm run dev`。打开 Vite 页面检查：

1. 概览卡片显示场地位置、时间、容量与状态。滚动到开放场地并点击卡片任意位置，进入对应预约页后应从页面顶部显示；模拟数据中的“维护中的场地 C”应显示停用且不能点击预约。
2. 在预约页填写未来日期和开放时段内的预约，提交后在表单下方显示成功编号；点击“查看预约记录”进入记录页核对。重复提交同场地、同日期、重叠时段时应显示冲突提示。取消时先点击对应记录的“取消预约”，再点击“确认取消预约”；选择“保留预约”不会发送取消请求。服务器确认取消后状态变为“已取消”。
3. 填入过去日期、颠倒的起止时间或超出容量的人数，提交时应显示本地错误且保留输入；后端仍会独立校验实际收到的请求。服务端返回字段校验详情时，页面会显示对应字段及原因。
4. 场地或预约记录加载失败后，用对应视图的“刷新”按钮重新获取。记录页刷新失败后，已加载的记录仍显示，并标明可能不是最新；没有刚完成写入时，离开再进入记录页会重新获取服务器数据。场地刷新期间不可提交预约，若场地仍开放，已填写的表单草稿保留。
5. 创建或取消时若提示结果无法确认，先进入记录页刷新核对，再决定是否重试；返回原场地预约页后，未成功提交的草稿应保留。
6. 创建 7 条不冲突的预约，确认记录区出现分页；切换“有效”与“已取消”筛选时，数量与显示的记录一致。

在浏览器开发者工具中分别以约 `800`、`1024`、`1366`、`1920` 像素宽度检查三个视图，确认导航、场地卡片、表单和记录区布局协调、文字完整且无需横向滚动。

刷新页面后，当前模拟进程中的记录仍可见；停止模拟进程后数据即丢失。模拟 API 仅实现页面使用的接口，用于前端手动检查；它不是后端、数据库、持久化或完整系统验收证据。

本地 Vite 把 `/api` 代理到 `VITE_API_PROXY_TARGET` 指定的服务；默认目标为 `http://127.0.0.1:8081`，与上述模拟 API 一致。与仓库中的真实后端联调时，在启动 Vite 前将该变量设为后端实际地址。浏览器代码始终只请求相对路径 `/api`。`frontend/Dockerfile` 使用 Node 构建、Nginx 运行；Nginx 将 `/api/` 原样代理到 Compose 服务 `api:8080`。根目录已有 Compose 配置和后端 Dockerfile，但完整三服务部署仍需实际联调验证。

### 前端容器单独检查

启动 Docker Desktop 后，在仓库根目录运行：

```powershell
docker build -t venue-booking-frontend:lab1-local ./frontend
docker run --rm -p 127.0.0.1:18080:80 venue-booking-frontend:lab1-local
```

打开 `http://127.0.0.1:18080/`，应能看到前端页面；按 `Ctrl+C` 结束容器。**单独运行前端容器时无法加载场地或提交预约是预期情况**，因为此时没有 `api` 服务；独立检查前端预约可按上文同时运行 Vite 和模拟 API。Nginx 在收到 `/api/` 请求时通过 Docker 网络解析 `api`，因此单独运行前端容器也能先提供静态页面。完整代理和业务功能仍须在三服务联调时验证。

若 `npm` 在 PowerShell 中提示 `npm.ps1` 被禁止运行，可在上述命令中改用 `npm.cmd`，无需修改系统执行策略。若提示 `node` 或 `npm` 未找到，先安装兼容的 Node.js 并重开终端；若 `npm ci` 失败，先确认当前目录末尾是 `frontend`，再检查网络能否访问 npm 官方源。若页面显示“无法连接服务器”，检查模拟 API 或真实后端是否正在运行、端口是否为 `8081`。若场地正常显示但无法提交，检查是否填写了必填项、选择未来日期、时间处于该场地开放时段内且人数不超过容量；页面会显示本地或服务器给出的具体错误。本地端口被占用时，停止已有进程或按 Vite 实际显示的地址访问。

三服务联调完成后，应补充实际启动命令、环境变量、访问地址、真实联调结果与实验报告证据。
