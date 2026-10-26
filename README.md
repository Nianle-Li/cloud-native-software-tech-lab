# 场地预约系统 · 云原生软件技术 Lab 1

本仓库用于实现课程 Lab 1 的前端、Web API、关系数据库及 Docker Compose 三服务部署。前端源码与测试位于 `frontend/`；后端、数据库和完整 Compose 部署仍待实现。

开发前请阅读：

- [公共契约：架构、数据、API 与容器配置](docs/contract.md)
- [三人总分工](docs/team-plan.md)
- [验收与实验报告清单](docs/acceptance.md)

课程任务书《云原生软件技术-Lab1-场地预约系统开发与Docker容器化.pdf》由课程渠道获取，仅作本地参考，不纳入 Git；任务书要求优先于仓库文档。

## 前端开发

前端使用 React 19、Vite 8、TypeScript 7，按[公共契约](docs/contract.md)调用 `/api/venues` 和 `/api/reservations`。页面包含场地列表/详情、预约表单、预约记录、取消操作及成功和错误提示；服务端负责最终的冲突与输入校验。

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

后端尚未实现。可在 **第二个 PowerShell 终端**进入 `frontend/` 并运行 `npm run mock:api`，保持该终端运行；第一个终端运行 `npm run dev`。打开 Vite 页面检查：

1. 场地列表和详情可显示；填写未来日期、开放时段内的预约，提交后显示成功编号和记录。
2. 重复提交同场地、同日期、重叠时段时显示冲突提示；取消后状态变为“已取消”。
3. 场地或预约记录加载失败后，用对应的“刷新”按钮重新获取。场地刷新期间不可提交预约，若场地仍开放，已填写的表单草稿保留。
4. 创建或取消时若提示结果无法确认，先刷新预约记录核对，再决定是否重试。

刷新页面后，当前模拟进程中的记录仍可见；停止模拟进程后数据即丢失。模拟 API 仅用于前端手动检查，不是后端、数据库、持久化或完整系统验收证据。

本地 Vite 把 `/api` 代理到 `VITE_API_PROXY_TARGET` 指定的后端；默认目标为 `http://127.0.0.1:8081`，与上述模拟 API 一致。真实后端可用时，在启动 Vite 前将该变量设为实际地址。浏览器代码始终只请求相对路径 `/api`。`frontend/Dockerfile` 使用 Node 构建、Nginx 运行；Nginx 将 `/api/` 原样代理到 Compose 服务 `api:8080`。目前尚无完整 Compose 文件，不能把前端单独启动等同于系统验收。

若 `npm` 在 PowerShell 中提示 `npm.ps1` 被禁止运行，可在上述命令中改用 `npm.cmd`，无需修改系统执行策略。若提示 `node` 或 `npm` 未找到，先安装兼容的 Node.js 并重开终端；若 `npm ci` 失败，先确认当前目录末尾是 `frontend`，再检查网络能否访问 npm 官方源。若页面显示“无法连接服务器”，检查模拟 API 或真实后端是否正在运行、端口是否为 `8081`。本地端口被占用时，停止已有进程或按 Vite 实际显示的地址访问。

后端和 Compose 完成后，应补充实际启动命令、环境变量、访问地址、真实联调结果与实验报告证据。
