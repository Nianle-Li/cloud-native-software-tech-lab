# 云原生软件技术 Lab 1 实验报告

## 项目运行方式

在仓库根目录准备 Docker Engine（或 Docker Desktop）及 Docker Compose v2。将 `.env.example` 复制为 `.env`，把 `POSTGRES_PASSWORD` 改为本地使用的密码；`FRONTEND_PORT` 默认为 `8080`，可按需调整。然后执行：

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 frontend api database
```

使用浏览器访问 `http://localhost:8080/`；如修改了 `FRONTEND_PORT`，则使用相应端口。结束运行时执行 `docker compose down`，保留数据库命名卷中的数据。

## 1. 实验目标与系统架构

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

### 2.6 前端实现小结

前端覆盖了场地列表与详情、创建场地、创建预约、预约列表与详情、取消预约，以及成功、参数错误和时间冲突提示。以服务器响应为数据事实、按接口约定校验响应、在结果不确定时提示核对记录，使页面状态与业务结果保持一致。可直接访问的详情地址、连续的表单操作、紧凑的记录布局和自动化回归测试，提高了场地预约流程的可用性与可验证性。

## 3. 后端 API 与业务逻辑

### 3.1 技术结构与数据职责

后端使用 Java 17、Spring Boot 3.4.5、Spring Web、Jakarta Validation、Spring Data JPA 和 PostgreSQL 16。代码按 `Controller → DTO → Service → Repository → PostgreSQL` 分层：Controller 接收 HTTP 请求并返回状态码与 `Location`；DTO 定义公开的输入输出；Service 执行业务校验、事务和状态变更；Repository 查询和保存 JPA 实体。`GlobalExceptionHandler` 集中转换业务异常，Actuator 提供 `/actuator/health`。

数据库结构由 Flyway 的 V1 建表迁移管理，V2 写入演示场地；应用启动时执行迁移，JPA 使用 `ddl-auto=validate` 检查实体与表结构，不自动建表。场地与预约分别对应 `venues`、`reservations`，预约通过非空 `venue_id` 外键关联场地。公开 JSON 使用 UTF-8、`snake_case` 字段、`YYYY-MM-DD` 日期和 `HH:mm` 日内时间；`created_at`、`cancelled_at` 为带时区的 ISO 8601 时间戳。业务日期按 `Asia/Shanghai` 判断，数据库的 `TIME WITHOUT TIME ZONE` 保持本地钟点值，不做时区偏移换算。

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

后端使用 `postgres:16.15-bookworm` Testcontainers 运行的 7 项集成测试全部通过，覆盖七个接口、状态码与错误码、输入校验、相邻时段、逻辑取消与重新预约、真实并发冲突，以及 JVM 默认时区为 UTC 时 `TIME` 字段与数据库值一致。测试启动时 Flyway V1/V2 成功执行，JPA `validate` 通过；健康检查返回应用 `UP`、数据库 `UP`。实际执行 `docker compose up --build -d` 成功构建并启动 API 镜像，容器内健康检查同样为 `UP`。

![后端 PostgreSQL Testcontainers 集成测试通过](assets/lab1-report/backend-testcontainers-passed.png)

图 9：`BookingApiIntegrationTest` 的 7 项测试全部通过，失败、错误和跳过数均为 0，Maven 构建结果为 `BUILD SUCCESS`。

![Compose 服务状态与 API 数据库健康检查](assets/lab1-report/backend-compose-health.png)

图 10：截图显示现有 API 镜像、Compose 三个服务运行，以及 `/actuator/health` 返回应用和数据库均为 `UP`。

## 4. 数据库设计

## 5. Docker 与 Compose 配置

## 6. 系统部署与功能验收

## 7. 并发与数据持久化验证

## 8. 小组分工

## 9. 实验总结

## 10. 问题与解决过程

### 后端：日内时间因时区配置发生偏移

联调时发现，数据库 `TIME WITHOUT TIME ZONE` 列中的场地开放时间、预约起止时间，与 API 返回的钟点可能相差 8 小时。排查发现 `application.yml` 设置了 `hibernate.jdbc.time_zone: Asia/Shanghai`，而容器 JVM 默认时区为 UTC；`LocalTime` 表示不带时区的日内时间，不应按时区转换。处理时移除了这项 Hibernate JDBC 时区配置，仍使用 `Asia/Shanghai` 的业务时钟判断“今天”和当天预约是否过时，带时区的创建、取消时间继续按实际时间点保存。

新增的 PostgreSQL Testcontainers 回归测试在 JVM 默认时区为 UTC 时，核对 Flyway 种子场地、新建场地和预约的 API 时间与数据库原始 `TIME` 值一致，并比较 `created_at`、`cancelled_at` 的时间点。修复后的 7 项集成测试全部通过。配置修复不会自动更正此前可能受影响的持久化记录；旧记录须依据原始预约意图逐条核对。

### 后端：并发请求可能同时通过冲突检查

如果创建预约只执行“查询冲突 → 插入”，两个请求可能在对方提交前都查到空结果，造成同一时段重复预约。后端把场地行的 `PESSIMISTIC_WRITE` 锁、业务校验、冲突查询和插入放在同一事务中；取消操作也先锁场地，再修改预约，保持加锁顺序一致。真实 PostgreSQL 并发测试同时提交两个相同请求，得到一个 `201` 和一个 `409 TIME_CONFLICT`，最终仅有一条匹配的 `ACTIVE` 预约。
