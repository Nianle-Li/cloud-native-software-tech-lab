# 云原生软件技术 Lab 1 实验报告

## 项目运行方式

准备已启动的 Docker Engine（或 Docker Desktop）及支持 `docker compose` 命令的 Compose v2。在仓库根目录仅首次将 `.env.example` 复制为 `.env`，修改 `POSTGRES_PASSWORD`；`FRONTEND_PORT` 默认为 `8080`，可按需调整。然后执行：

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 frontend api database
```

使用浏览器访问 `http://localhost:8080/`；如修改了 `FRONTEND_PORT`，则使用相应端口。结束运行时执行 `docker compose down`，保留数据库命名卷中的数据。

## 1. 实验目标与系统架构

本实验完成可从源码重复构建的场地预约系统，并在 Docker Compose 中运行前端、Web API 和 PostgreSQL。浏览器经前端 Nginx 访问同源 `/api`；API 校验输入、场地状态与预约冲突，并将场地和预约保存到关系数据库。三个服务通过 Compose 网络通信，仅前端向宿主机发布端口。

| 服务 | 实现与职责 | 数据及配置 |
| --- | --- | --- |
| `frontend` | React 页面由 Nginx 提供，代理 `/api` 请求 | 只接收 HTTP JSON，不连接数据库 |
| `api` | Spring Boot 处理七个业务接口、事务与错误响应 | 从环境变量读取数据库连接；提供健康端点 |
| `database` | PostgreSQL 保存场地和预约 | Flyway 初始化与迁移；命名卷保留数据 |

用户可查询与创建场地、创建与查询预约，并取消预约；API 拒绝无效输入、停用场地及重叠时段。取消采用逻辑取消，原记录仍可查询；取消后同一时段可重新预约。前后端各有独立 Dockerfile，数据库使用官方镜像。接口、部署和验收结果见第 3、5–7 节。

## 2. 前端实现与用户交互

### 2.1 前端职责与技术结构

场地预约系统由前端、Web API 和关系数据库组成。前端负责展示场地与预约信息、接收用户输入，并通过 HTTP JSON 接口完成查询、创建和取消操作。业务规则的最终判定由 API 执行，场地与预约数据由关系数据库持久化；浏览器不直接连接数据库。

```text
浏览器 → frontend（Nginx） → api（Web API） → database（PostgreSQL）
             │
             └─ 静态页面；将 /api/* 请求代理至 api:8080
```

前端使用 React 19、TypeScript 7 和 Vite 8。`App.tsx` 管理场地、预约、表单草稿及操作反馈；`api/` 统一处理 HTTP 请求与响应校验；`validation/` 承担提交前的输入检查；`components/` 与 `pages/` 分别组织通用交互和业务视图。前端请求使用同源路径 `/api/...`。本地开发由 Vite 根据 `VITE_API_PROXY_TARGET` 转发请求，容器运行时由 Nginx 转发。

场地概览与预约记录是两个主视图。场地详情、预约详情和创建场地采用面板展示，并保留可直接访问和刷新的地址；预约表单使用独立页面，便于同时查看场地资料和提交反馈。详情面板支持键盘焦点管理与 `Esc` 关闭，关闭后返回原列表。预约记录将核心字段集中在条目中，减少逐条查阅时的页面滚动。

| 地址 | 功能 |
| --- | --- |
| `#/` | 查看场地列表、状态、位置、容量和开放时段 |
| `#/venues/new` | 创建开放或停用场地 |
| `#/venues/{id}` | 查询场地详情，并从开放场地进入预约 |
| `#/venues/{id}/book` | 查看选中场地并创建预约 |
| `#/reservations` | 查看、筛选和取消预约 |
| `#/reservations/{id}` | 查询预约详情与状态 |

### 2.2 用户功能与业务交互

#### 2.2.1 场地查询与创建

场地概览展示场地名称、编号、位置、容量、开放时段和状态。用户可打开详情面板查询完整信息；停用场地仍可查看，但不提供预约入口。创建场地时，用户填写名称、位置、容量、每日开放与关闭时间，并选择开放或停用状态。前端检查必填文本、字段长度、正整数容量和时间顺序。收到符合接口约定的 `201 Created` 响应后，页面显示新场地编号、清空表单并更新场地列表；创建失败时保留输入。

#### 2.2.2 预约创建

用户选择开放场地后，填写预约人或组织、日期、起止时间、参与人数和使用目的。前端检查日期是否有效、按北京时间计算的过去日期和当天时间、场地开放时段、人数上限、起止时间顺序，以及文本必填与长度限制。前端不独立判定预约时段是否冲突；API 对场地状态、输入和时间冲突作最终校验。仅在收到符合约定的 `201 Created` 响应后，页面显示服务器生成的预约编号并清空表单。

#### 2.2.3 预约查询与取消

预约列表同时展示有效和已取消记录，条目包含场地名称与编号、日期与时间、预约人或组织、人数、用途及状态。状态筛选和每页六条的分页在浏览器中完成，不改变 API 返回的列表数据。预约详情通过独立接口查询，展示完整记录及创建、取消时间。

取消有效预约前，界面要求二次确认；选择“保留预约”不会发送取消请求。确认后，前端依据 API 返回的 `CANCELLED` 状态更新记录。已取消记录仍可查询，但不再提供取消操作。重新进入预约记录页时会读取服务器数据；刷新失败时保留上次成功获取的记录，并明确提示其可能不是最新。

### 2.3 API 调用与异常反馈

前端按公共接口约定使用 `snake_case` JSON 字段。预约日期和日内时间分别发送为 `YYYY-MM-DD`、`HH:mm`；创建和取消时间采用 API 返回的带时区时间戳。浏览器原生日期、时间控件的显示格式不影响请求格式。

| 请求 | 用途 | 成功响应 |
| --- | --- | --- |
| `GET /api/venues` | 查询场地列表 | `200`，场地数组 |
| `GET /api/venues/{id}` | 查询场地详情 | `200`，场地对象 |
| `POST /api/venues` | 创建场地 | `201`，含服务器生成编号的场地对象 |
| `GET /api/reservations` | 查询预约记录 | `200`，预约数组 |
| `GET /api/reservations/{id}` | 查询预约详情 | `200`，预约对象 |
| `POST /api/reservations` | 创建预约 | `201`，含服务器生成编号的预约对象 |
| `POST /api/reservations/{id}/cancel` | 取消预约 | `200`，状态为 `CANCELLED` 的预约对象 |

对参数错误、资源不存在和时间冲突，页面分别展示 API 的 `400`、`404`、`409` 响应所附的可读信息；字段校验详情会转换为对应的中文字段提示。服务端故障显示通用错误，不展示内部异常。网络中断或成功响应结构异常时，页面提示用户先刷新场地或预约列表核对结果，再决定是否重试，避免结果不确定时重复创建。提交期间禁用表单与重复操作。前端校验用于及时反馈，不能替代 API 的业务校验与并发冲突控制。

### 2.4 前端容器化实现

`frontend/Dockerfile` 采用两阶段构建。构建阶段基于 `node:24.15.0-alpine3.23`，使用锁定依赖执行 `npm ci`，再通过 `npm run build` 完成 TypeScript 检查和 Vite 构建。运行阶段基于 `nginx:1.28.2-alpine3.23`，只复制静态构建产物与 Nginx 配置，监听容器内 `80` 端口。`.dockerignore` 排除本地依赖、缓存、构建产物、Git 数据、日志和环境变量文件。

Nginx 提供静态页面，并将 `/api/` 请求代理至 Compose 网络中的 `http://api:8080`。配置使用原始请求 URI，保留 `/api` 前缀；`try_files $uri $uri/ /index.html` 为页面地址提供回退。浏览器始终使用同源 API 路径，前端构建产物无需写入后端容器地址。

### 2.5 前端验证与界面展示

#### 2.5.1 自动验证

在 Node.js 24.15.0 环境中，`npm test` 的 123 项 Vitest 测试、`npm run test:layout` 的 8 项 Playwright/Chromium 测试全部通过，`npm run build` 完成类型检查与生产构建。测试覆盖场地创建、详情查询、预约创建与取消、输入校验、服务端错误提示、冲突后取消并重新预约，以及页面布局与交互。浏览器交互测试使用可控 HTTP 响应，检验前端对各类接口结果的处理。

#### 2.5.2 界面展示

![场地概览与开放状态](assets/lab1-report/venue-list.png)

图 1：场地概览展示位置、容量、开放时段与状态，停用场地没有预约入口。

![多功能报告厅详情面板](assets/lab1-report/venue-detail.png)

图 2：场地详情面板展示场地编号和完整基本信息。

![创建数字媒体实验室成功](assets/lab1-report/venue-created.png)

图 3：创建场地成功后显示新场地编号及后续预约入口。

![预约成功反馈](assets/lab1-report/booking-success.png)

图 4：预约成功后显示预约编号，并提供查看预约记录的入口。

![预约时间冲突反馈](assets/lab1-report/booking-conflict.png)

图 5：时间冲突时保留表单输入，并显示明确的失败信息。

![预约记录列表](assets/lab1-report/reservation-list.png)

图 6：预约列表同时展示有效与已取消记录，支持按状态筛选。

![预约详情面板](assets/lab1-report/reservation-detail.png)

图 7：预约详情展示场地、预约人、时段、状态与创建时间。

![预约取消后的记录状态](assets/lab1-report/reservation-cancelled.png)

图 8：取消成功后记录保留，状态更新为“已取消”。

## 3. 后端 API 与业务逻辑

### 3.1 技术结构与数据职责

后端使用 Java 17、Spring Boot 3.4.5、Spring Web、Jakarta Validation、Spring Data JPA 和 PostgreSQL 16。代码按 `Controller → DTO → Service → Repository → PostgreSQL` 分层：Controller 接收 HTTP 请求并返回状态码与 `Location`；DTO 定义公开的输入输出；Service 执行业务校验、事务和状态变更；Repository 查询和保存 JPA 实体。`GlobalExceptionHandler` 集中转换业务异常，Actuator 提供 `/actuator/health`。

数据库结构由 Flyway 的 V1 建表迁移管理，V2 写入演示场地，V3 收紧四个必填文本字段的非空白约束；应用启动时执行迁移，JPA 使用 `ddl-auto=validate` 检查实体与表结构，不自动建表。场地与预约分别对应 `venues`、`reservations`，预约通过非空 `venue_id` 外键关联场地。公开 JSON 使用 UTF-8、`snake_case` 字段、`YYYY-MM-DD` 日期和 `HH:mm` 日内时间；`created_at`、`cancelled_at` 为带时区的 ISO 8601 时间戳。业务日期按 `Asia/Shanghai` 判断，数据库的 `TIME WITHOUT TIME ZONE` 保持本地钟点值，不做时区偏移换算。

### 3.2 API 设计

七个接口均以 `/api` 开头，列表直接返回数组；场地列表按 `id` 升序，预约列表按 `id` 降序且包含已取消记录。

| 方法与路径 | 用途 | 成功响应 | 主要错误 |
| --- | --- | --- | --- |
| `GET /api/venues` | 查询场地列表 | `200`，场地数组 | `500` |
| `GET /api/venues/{id}` | 查询场地详情 | `200`，场地对象 | `400` 无效 ID；`404` 场地不存在 |
| `POST /api/venues` | 创建场地 | `201`，场地对象；`Location: /api/venues/{id}` | `400` 输入无效 |
| `GET /api/reservations` | 查询预约列表 | `200`，预约数组 | `500` |
| `GET /api/reservations/{id}` | 查询预约详情 | `200`，预约对象 | `400` 无效 ID；`404` 预约不存在 |
| `POST /api/reservations` | 创建预约 | `201`，预约对象；`Location: /api/reservations/{id}` | `400` 输入或业务时间无效；`404` 场地不存在；`409` 场地停用或时段冲突 |
| `POST /api/reservations/{id}/cancel` | 逻辑取消预约 | `200`，取消后的预约对象 | `400` 无效 ID；`404` 预约不存在 |

### 3.3 核心业务规则

- **场地状态与容量：**创建场地时校验名称、位置、正整数容量和开放时间顺序；省略 `status` 时默认为 `OPEN`。`CLOSED` 场地仍可查询，但不能接受预约。预约人数须满足 `1 ≤ attendee_count ≤ venue.capacity`。
- **日期与开放时段：**预约日期不能早于上海时区的当天；预约当天时，开始时间须晚于当前本地时间。每条预约须满足 `venue.open_time ≤ start_time < end_time ≤ venue.close_time`，只允许同一自然日内的时段。
- **时间冲突：**仅比较同一场地、同一日期的 `ACTIVE` 预约。预约区间采用半开形式 `[start_time, end_time)`；冲突条件为 `existing.start_time < request.end_time && existing.end_time > request.start_time`。因此 `10:00–11:00` 与 `11:00–12:00` 相邻可预约，实际重叠则返回 `409 TIME_CONFLICT`。
- **逻辑取消：**取消保留原记录，将 `status` 改为 `CANCELLED` 并写入 `cancelled_at`。重复取消返回同一已取消记录和原取消时间，保持幂等；已取消记录不占用时段，同一时段可以重新预约。

### 3.4 并发控制

创建预约在同一个 `@Transactional` 事务内执行：通过 `PESSIMISTIC_WRITE` 锁定目标 `venue` 行 → 校验场地与请求 → 查询冲突的 `ACTIVE` 预约 → 无冲突才插入并提交。PostgreSQL 使用默认 `READ COMMITTED` 隔离级别。同一场地的并发请求在场地行锁处排队；先提交的预约会进入后一个请求的冲突查询，因此不能都成功。取消时也先锁场地，再锁预约并更新状态，保持一致的加锁顺序。

真实 PostgreSQL 的并发集成测试同时发出两次相同预约请求，结果为一个 `201`、一个 `409 TIME_CONFLICT`，完成后数据库中该场地只有一条匹配的 `ACTIVE` 预约。测试还验证取消后同一时段能再次预约，覆盖业务正确性与并发正确性。

### 3.5 统一错误响应

后端通过统一异常处理返回稳定的错误结构，不向客户端暴露堆栈、SQL 或环境变量。例如时间冲突返回：

```json
{
  "error": {
    "code": "TIME_CONFLICT",
    "message": "该场地在所选时段已被预约"
  }
}
```

`400 VALIDATION_ERROR` 处理无效 JSON、字段、容量和日期时间，可附字段级 `details`；`404 VENUE_NOT_FOUND` 与 `404 RESERVATION_NOT_FOUND` 处理不存在的资源；`409 VENUE_CLOSED` 与 `409 TIME_CONFLICT` 处理业务冲突；意外故障返回 `500 INTERNAL_ERROR`。

### 3.6 容器化与验证

`api/Dockerfile` 使用 Maven/JDK 17 构建阶段从源码下载依赖并打包，再用 JRE 17 运行阶段只携带应用 jar，以非 root 用户在容器内监听 `8080`。数据库连接由 `SPRING_DATASOURCE_URL`、`SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD` 注入；Compose 中 JDBC 地址使用 `database:5432`，镜像内不写入密码。`/actuator/health` 可报告应用和数据库健康状态。

当前源码使用 PostgreSQL Testcontainers 的 12 项集成测试全部通过，覆盖七个接口、输入与错误响应、相邻时段、取消和重订、并发冲突、日内时间及 V3 迁移。独立 Compose 环境从源码构建并启动三服务，API 健康端点的应用和数据库状态均为 `UP`。

## 4. 数据库设计

### 4.1 数据模型与字段

数据库使用 PostgreSQL 16，业务表为 `venues` 与 `reservations`。一个场地对应多条预约，`reservations.venue_id` 是引用 `venues(id)` 的非空外键；两表主键均为数据库生成的 `BIGINT` identity。种子插入不指定 ID，后续 API 写入继续使用数据库序列。

| 表 | 关键字段与存储方式 |
| --- | --- |
| `venues` | `name VARCHAR(100)`、`location VARCHAR(200)`、`capacity INTEGER`、`open_time/close_time TIME WITHOUT TIME ZONE`、`status VARCHAR(10)` |
| `reservations` | `venue_id BIGINT`、`booked_by VARCHAR(100)`、`reservation_date DATE`、`start_time/end_time TIME WITHOUT TIME ZONE`、`attendee_count INTEGER`、`purpose VARCHAR(500)`、`status VARCHAR(10)`、`created_at/cancelled_at TIMESTAMP WITH TIME ZONE` |

业务日期和日内钟点按 `Asia/Shanghai` 解释；创建与取消时间保存实际时间点。取消不删除行，`CANCELLED` 记录继续关联原场地，便于查询历史。外键没有级联删除配置。

### 4.2 数据库约束与索引

除 `cancelled_at` 外，业务列均要求非空；四个必填文本字段不能仅含空白或不可见字符，长度由 `VARCHAR` 上限约束。`capacity`、`attendee_count` 必须大于 0；开放时间、预约起止时间分别满足前者小于后者。场地状态仅允许 `OPEN/CLOSED`，预约状态仅允许 `ACTIVE/CANCELLED`；`ACTIVE` 必须没有取消时间，`CANCELLED` 必须有取消时间。场地和预约默认状态分别为 `OPEN`、`ACTIVE`，创建时间默认 `CURRENT_TIMESTAMP`。

联合索引 `idx_reservations_conflict` 按 `(venue_id, reservation_date, status, start_time, end_time)` 建立，辅助有效预约的冲突查询。索引本身不阻止时段重叠；容量上限、开放时段、过去时间和并发冲突由后端 Service 及事务锁处理，见第 3 节。

### 4.3 Flyway 管理与独立验证

迁移位于 `api/src/main/resources/db/migration/`：V1 创建两张表、14 项命名约束及冲突索引；V2 插入两个开放场地和一个停用场地，不预置预约；V3 保留原约束名，更新四个文本非空白检查。Flyway 是结构唯一来源，由 API 启动时执行，JPA 使用 `ddl-auto=validate`。不另用数据库初始化目录或 JPA 自动建表；已执行迁移不回改，结构变化新增版本。

独立数据库验证脚本在空库上成功执行 V1–V3、Flyway `validate` 和再次 `migrate`，且种子未重复。29 组非法写入按预期被拒绝；合法文本长度边界、identity、默认值、逻辑取消和外键保护均通过。测试写入已回滚，该脚本验证迁移与数据库约束，不代替三服务联调。

## 5. Docker 与 Compose 配置

### 5.1 三服务编排

前后端 Dockerfile 的构建与运行阶段见第 2.4、3.6 节。根目录 `compose.yaml` 编排三个服务；数据库使用 `postgres:16.15-bookworm` 官方镜像。

```text
浏览器 → 宿主机 8080 → frontend:80
                         │ /api/*，保留原路径
                         ▼
                       api:8080
                         │ JDBC
                         ▼
                     database:5432
                         │
                     postgres_data
```

| 服务 | 构建或镜像 | 端口与职责 |
| --- | --- | --- |
| `frontend` | `./frontend` → `venue-booking-frontend:lab1` | 容器内 80；映射 `${FRONTEND_PORT:-8080}:80` |
| `api` | `./api` → `venue-booking-api:lab1` | 容器内 8080；不发布宿主机端口 |
| `database` | `postgres:16.15-bookworm` | 容器内 5432；不发布宿主机端口 |

三个服务使用 Compose 默认网络，通过服务名互相访问。API 等待数据库 `service_healthy` 后启动，前端等待 API 的 `/actuator/health` 通过后启动。数据库 healthcheck 使用 `pg_isready` 经本地 TCP 检查，间隔 5 秒、超时 5 秒、启动宽限 10 秒、重试 12 次。API 健康检查通过 HTTP 确认应用及数据库连接均可用。

### 5.2 配置外部化与命名卷

根目录 `.env.example` 提供四个变量：`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`FRONTEND_PORT`。真实 `.env` 仅保存在本机，被 Git 忽略。数据库凭据通过环境变量传入容器，不写入镜像。

Compose 显式向数据库传入三个 `POSTGRES_*` 变量，向 API 注入 `SPRING_DATASOURCE_URL/USERNAME/PASSWORD`。JDBC URL 为 `jdbc:postgresql://database:5432/${POSTGRES_DB}`；Compose 读取 `.env` 只用于变量替换，不意味着容器自动获得文件内全部变量。三个数据库变量为空时，配置解析直接失败。

`postgres_data` 命名卷挂载到 `/var/lib/postgresql/data`。实际卷名以 Compose 项目名为前缀；执行 `docker compose down` 后卷仍保留。healthcheck 中的 `$$POSTGRES_USER`、`$$POSTGRES_DB` 留到容器内展开。数据库接受连接的检查之外，另由 Actuator 验证 API 到数据库的连接。

## 6. 系统部署与功能验收

### 6.1 整体启动与状态

从当前源码在 Windows、Docker Engine 29.1.3 和 Compose v2.40.3-desktop.1 环境完成三服务构建与部署。首次配置时复制 `.env.example` 为 `.env` 并替换密码，已有配置不覆盖。在仓库根目录执行：

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 frontend api database
docker compose exec -T frontend wget -qO- http://api:8080/actuator/health
```

前后端镜像均从仓库源码构建成功，三个服务正常运行，数据库为 `healthy`，仅前端发布宿主机端口。空库成功应用 V1–V3，Actuator 顶层与数据库健康状态均为 `UP`。默认浏览器入口为 `http://localhost:8080/`；修改 `FRONTEND_PORT` 时使用相应端口。首页和经 Nginx 转发的 `/api/venues` 均返回 `200`。

### 6.2 功能联调

当前源码经前端 Nginx 入口完成 20 项实际 HTTP 检查，覆盖七个业务接口、错误响应、相邻与冲突时段、取消幂等和重订。真实 Chromium 页面操作验证了创建场地、预约成功、冲突提示、取消与同时间重订。另有[原始联调记录](assets/lab1-report/stage4-acceptance.json)保存了 V1/V2 版本的 33 项真实 HTTP 结果及页面验收数据；该记录与当前 V3 版本的复核结果分别说明，不作为当前版本的测试计数。

## 7. 并发与数据持久化验证

### 7.1 容器重建与数据持久化

V1/V2 联调记录保存了预约 #5、#6 的完整 API 响应、场地与预约总数、Flyway 历史、容器 ID、镜像 ID 和命名卷信息。随后执行：

```sh
docker compose down
docker compose up -d
docker volume ls
```

全程不使用 `-v`。重建后，三个容器 ID 均变化、镜像 ID 均未变；数据库继续挂载原命名卷。下表为该次原始记录的对比结果：

| 对比项 | 重建前 | 重建后 |
| --- | --- | --- |
| 预约 #5 | `CANCELLED`，有取消时间 | 完整记录一致 |
| 预约 #6 | `ACTIVE`，取消时间为空 | 完整记录一致 |
| 场地总数 / 预约总数 | 5 / 6 | 5 / 6 |
| Flyway 历史 | V1、V2 成功，校验和已记录 | 版本和校验和未变，无需重复迁移 |
| 应用与数据库健康 | `UP / UP` | `UP / UP` |

“完整记录一致”包含预约人、用途、日期、钟点、状态及创建/取消时间。重建后通过 HTTP 重新查询并与 SQL 核对。当前 V3 版本也在独立 Compose 项目中完成创建、取消与重订后的 `down` / `up -d` 验证，原卷中的场地和预约状态保持一致，API 与数据库健康。验证范围为本地 Compose 命名卷在容器重建后的数据保留。

V1/V2 版本的原始证据见[重建前后对比 JSON](assets/lab1-report/stage5-persistence.json)及[重建后状态与日志](assets/lab1-report/deployment-status.txt)。

## 8. 小组分工

以下分工依据仓库提交记录和实际交付整理。

| 成员 | 实际交付 |
| --- | --- |
| 李佳凝 | 前端主要页面、API 对接、表单校验、交互测试、前端镜像和 Nginx；修复创建响应、并发取消、V3 文本约束及 Compose 启动就绪问题。 |
| 张玳瑗 | Spring Boot 接口、JPA 数据模型、预约冲突与取消事务、统一接口参数校验与错误处理、后端镜像及数据库集成测试；修复日内时间偏移。 |
| 吴柯蝶 | 数据库 V1/V2 迁移、种子数据、独立数据库验证脚本、Compose 编排与环境变量模板；完成三服务联调、HTTP 验收及重启持久化验证。 |

## 9. 关键问题与解决

### 9.1 日内时间偏移

PostgreSQL 的 `TIME WITHOUT TIME ZONE` 存储日内钟点，不表示具体时间点。若同时设置 Hibernate JDBC 时区，而容器 JVM 使用 UTC，API 与数据库的钟点可能相差 8 小时。后端移除该 JDBC 时区设置，业务日期仍按 `Asia/Shanghai` 判断。PostgreSQL 集成测试核对种子、新建场地和预约的 API 时间与数据库值一致；已存在的异常记录需按原预约意图核查。

### 9.2 并发预约与重复取消

仅查询冲突后再插入，无法阻止两个并发请求同时通过检查。创建预约在同一事务中先锁场地行，再查询有效预约并插入；同一场地的两个相同时段请求得到一个 `201` 和一个 `409 TIME_CONFLICT`。取消操作也先锁场地，再锁预约并判断状态。八个并发取消响应及最终记录保留同一取消时间。

### 9.3 创建响应与文本校验

经前端代理创建资源时，绝对 `Location` 依赖转发的主机信息。创建接口使用 `/api/...` 相对路径，前端入口可据此定位资源。API 与 Flyway V3 对四个必填文本字段采用一致的非空白判定，并将 NUL 输入转换为 `400 VALIDATION_ERROR`。直接 SQL 写入不可见文本会被数据库约束拒绝；如果旧库已有此类记录，须先核查和修正，V3 不会自动改写数据。

### 9.4 容器启动顺序

Compose 中，API 等待数据库健康，前端等待 API 的健康端点通过。此顺序避免前端已经开放入口而 API 尚未就绪。三服务从当前源码构建并启动后，数据库与 API 健康检查通过，浏览器经前端入口完成业务请求。

## 10. 实验总结

系统实现了任务书规定的场地与预约查询、创建、取消和冲突拒绝流程。前端通过 HTTP JSON 与 API 通信，API 使用 PostgreSQL 持久化数据；Compose 可从源码构建三服务，环境变量提供数据库配置，命名卷在容器重建后保留预约。验收覆盖页面操作、接口错误、并发请求和数据持久化，适用于本实验的单机 Docker Compose 环境。
