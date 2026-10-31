# 场地预约系统 · 云原生软件技术 Lab 1

本仓库包含前端、Web API、PostgreSQL 及 Docker Compose 配置。系统设计、接口字段、业务规则、测试结果和验收记录见 [Lab 1 实验报告](docs/lab1-report.md)。

## 运行

准备已启动的 Docker Engine（或 Docker Desktop）和支持 `docker compose` 命令的 Compose v2 或兼容更新版本。首次构建需要联网下载基础镜像及依赖；宿主机无需安装 Node、Java 或 Maven。

在仓库根目录仅首次创建本地配置。macOS/Linux 的 shell 执行：

```sh
test -e .env || cp .env.example .env
```

Windows PowerShell 执行：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

将本地 `.env` 中的 `POSTGRES_PASSWORD` 占位值改为实验密码；已有 `.env` 时保留原配置。该文件不纳入 Git。可通过 `FRONTEND_PORT` 调整前端宿主机端口，默认是 `8080`。

仍在仓库根目录执行：

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose exec -T frontend wget -qO- http://api:8080/actuator/health
```

三个服务应正常运行，数据库显示 `healthy`；健康响应的顶层 `status` 和 `components.db.status` 均应为 `UP`。浏览器打开 `http://localhost:8080/`；修改了 `FRONTEND_PORT` 时使用对应端口。排查启动问题可运行 `docker compose logs --tail=100 frontend api database`。

停止与再次启动分别执行 `docker compose down` 和 `docker compose up -d`。数据库使用 `postgres_data` 命名卷；保留数据时不要添加 `-v`。已初始化数据库的凭据不会因修改 `.env` 而自动重设。更换仓库目录名或 Compose 项目名会使用另一组命名卷；在另一台电脑运行也不会自动迁移原机器的数据。部署与持久化验收结果见[实验报告第 6–7 节](docs/lab1-report.md#6-系统部署与功能验收)。

## 目录

| 路径 | 内容 |
| --- | --- |
| `frontend/` | React 页面、前端测试、Dockerfile 与 Nginx 配置 |
| `api/` | Spring Boot API、集成测试、Flyway 迁移与 Dockerfile |
| `compose.yaml`、`.env.example` | 三服务编排与本地配置模板 |
| `scripts/verify-database.py` | 独立数据库迁移与约束验证 |
| `docs/lab1-report.md` | 架构、数据库、接口、部署、验收及小组分工 |
| `docs/assets/lab1-report/` | 报告引用的截图与验收记录 |

## 接口索引

浏览器通过同源 `/api` 路径访问以下接口；请求、响应和错误格式见[实验报告第 3.2 节](docs/lab1-report.md#32-api-设计)。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/venues` | 查询场地列表 |
| `GET /api/venues/{id}` | 查询场地详情 |
| `POST /api/venues` | 创建场地 |
| `POST /api/reservations` | 创建预约 |
| `GET /api/reservations` | 查询预约列表 |
| `GET /api/reservations/{id}` | 查询预约详情 |
| `POST /api/reservations/{id}/cancel` | 取消预约 |
