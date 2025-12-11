# Coze Chat Service 详细规划（Python）

> 目标：在当前仓库根目录下用 Python 实现一个“对 Coze 的稳定聊天网关服务”，对内只暴露简单的 Chat API，对外隐藏 Coze 的细节，保证以后可扩展、可替换。

---

## 1. 背景与约束

- 已有前提：
  - 已有 Coze 应用 / Bot（`COZE_BOT_ID` 已知，会由你填入 `.env`）。
  - 本项目只负责“后端对接 Coze Chat + 对内提供 HTTP API”，前端/其他服务通过 HTTP/WebSocket 调用这个项目。
- 设计原则（按 Linus 那套来）：
  1. **数据优先**：先把 Chat 相关的数据结构设计干净，再谈接口和实现。
  2. **消除特殊情况**：统一抽象 `ChatSession` / `ChatMessage` 层，所有 Coze 的奇形怪状字段都压在 “适配层”。
  3. **不绑死上游**：对内暴露的 API 与 Coze 解耦，后续可以平滑切换模型/供应商。
  4. **实现从简单开始**：第一阶段只支持：
     - 一个 Bot；
     - 纯文本消息；
     - 非流式（`stream: false`）；
     - 同步“问一句拿一句”；
     后续再增量扩展流式 / 工具调用 / 多 Bot。

---

## 2. 技术选型与运行方式

### 2.1 后端框架

- 语言：Python 3.10+（假设环境可控）
- Web 框架：**FastAPI**
  - 原因：类型友好、路由清晰、自带 OpenAPI 文档，适合这种“API 网关级别”的服务。
- HTTP Client：`httpx` 或 `requests`
  - 第一阶段可以用 `requests`（更常见），后续如果要异步优化可以切到 `httpx`。

### 2.2 项目运行方式

- 项目本身是一个独立的小服务：
  - 提供 HTTP 接口（REST）：
    - `POST /chat/send`
    - `GET  /chat/history/{session_id}`
    - （可选）`POST /chat/session`
  - 将来可以用 `uvicorn` 运行：
    - `uvicorn coze_chat_service.app:app --reload`（只作为建议，不在规划中执行）。

---

## 3. 环境变量与配置设计

### 3.1 .env 约定

根目录 `.env`（已由我创建，你来填真实值）：

- `COZE_API_BASE`：默认 `https://api.coze.cn`
- `COZE_ACCESS_TOKEN`：Coze 访问令牌（PAT 或 Service Token）
- `COZE_BOT_ID`：你在 Coze 平台上的 Bot / 应用 ID
- `COZE_TIMEOUT`：HTTP 请求超时时间（秒），默认 `30`

### 3.2 Python 侧配置模块

在 `coze_chat_service` 内新增 `config.py`：

- 职责：
  - 从 `.env` / 环境变量中加载配置。
  - 做基本校验（缺关键变量时启动报错）。
- 结构（示意）：
  - `Settings`（使用 Pydantic 的 `BaseSettings` 或手写）：
    - `coze_api_base: str`
    - `coze_access_token: str`
    - `coze_bot_id: str`
    - `coze_timeout: int`
  - 工厂函数：
    - `get_settings() -> Settings`：内部做单例缓存，避免频繁解析。

---

## 4. 领域模型（Domain Model）设计

> 这一层是“我们自己的世界观”，完全不要泄露 Coze 的字段名。

### 4.1 ChatSession

- 定义：你这边的一次会话（用户跟 Bot 的一条“对话线索”）。
- 字段：
  - `id: str`  
    - 你自己生成的 session_id（UUID 或雪花ID），返回给前端使用。
  - `user_id: str`  
    - 系统内用户 ID（从登录态或调用方传入）。
  - `coze_conversation_id: str | None`  
    - 对应 Coze 文档里的 `conversation_id`，用于标识“会话”（后续查询对话详情、消息列表必需）。
  - `coze_chat_id: str | None`  
    - 对应 Coze 文档里的 `chat_id`，用于标识本轮对话请求（`retrieve_chat` / `list_chat_messages` 都需要和 `conversation_id` 一起传）。
  - `bot_id: str`  
    - 当前会话绑定的 Bot ID，默认从配置 `COZE_BOT_ID` 来。
  - `custom_variables: dict[str, Any] | None`  
    - 用户变量 / Prompt 变量快照（比如地区、语言、会员等级）。
  - `created_at: datetime`
  - `updated_at: datetime`

### 4.2 ChatMessage

- 定义：会话中一条消息（统一表示用户或助手消息）。
- 字段：
  - `id: str`
  - `session_id: str`
  - `role: Literal["user", "assistant"]`
    - 注意：Coze 官方仅支持 `user` 和 `assistant` 两种角色，不支持 `system`。
  - `content: str`  
    - 先只支持纯文本，后面要多模态可以拓展 `content_type` + `payload`。
  - `created_at: datetime`
  - `raw_coze_message: dict | None`  
    - 可选，保留 Coze 的原始 Message Object，方便排查问题。

### 4.3 用户上下文（UserContext）【可选阶段】

- 如果你需要长期存“用户语言/地区/权限等”，可以额外建一个 `UserContext` 概念：
  - 字段：
    - `user_id: str`
    - `variables: dict[str, Any]`（会映射到 Coze 的 `parameters` / `custom_variables`）
  - 第一阶段可以只在内存中传递，不做数据库持久化。

---

## 5. Coze 适配层设计（CozeClient）

> 所有第三方 API 的脏细节都集中在这里，对外暴露干净的 Python 方法。

### 5.1 作用与原则

- 把 Coze 文档里的接口：
  - `POST https://api.coze.cn/v1/conversation/create`（创建会话，注意是 **v1** 不是 v3）
  - `POST https://api.coze.cn/v3/chat`（发起对话）
  - `GET  https://api.coze.cn/v3/chat/retrieve?conversation_id=xxx&chat_id=xxx`（查询对话状态）
  - `GET  https://api.coze.cn/v3/chat/message/list?conversation_id=xxx&chat_id=xxx`（获取消息列表）
  - `POST https://api.coze.cn/v3/chat/cancel`（取消对话）
  - （未来）`streaming_chat_api` / `streaming_chat_event`
  收敛成 **4 个 Python 方法**：
  - `create_conversation(...)`（可选，用于预创建会话）
  - `start_or_continue_chat(...)`
  - `wait_chat_complete(...)`
  - `get_chat_messages(...)`

### 5.2 模块文件

新建 `coze_chat_service/coze_client.py`：

#### 5.2.1 请求体抽象

- 内部定义 Python 侧请求结构（简单即可）：
  - `CozeChatRequest`：
    - `bot_id: str`
    - `user_id: str`
    - `conversation_id: str | None`
    - `chat_id: str | None`
    - `text: str`（当前用户问句）
    - `stream: bool`（第一阶段固定 False）
    - `custom_variables: dict[str, Any] | None`
    - `parameters: dict[str, Any] | None`
  - 由代码负责把它映射成 Coze 文档中的 `Body / EnterMessage Object / additional_messages` 等。

#### 5.2.2 核心方法设计

1. `def start_or_continue_chat(req: CozeChatRequest) -> CozeChatBasicInfo`
   - 行为：
     - 组装 HTTP 请求：
       - URL: `${COZE_API_BASE}/v3/chat`
       - Header:
         - `Authorization: Bearer {COZE_ACCESS_TOKEN}`
         - `Content-Type: application/json`
       - Body 关键字段（具体命名取决于官方文档，代码里严格按文档实现）：
         - `bot_id`
         - `user` / `user_id`
         - `stream`（false）
          - `conversation_id`（如果 `req.conversation_id` 不为空）
          - `chat_id`（如果 `req.chat_id` 不为空）
          - `additional_messages`（最后一条为当前 user 文本）
          - `custom_variables`
          - `parameters`
     - 发送请求，处理超时与 HTTP 错误：
       - 超时：使用 `COZE_TIMEOUT`
       - 非 2xx：抛出自定义异常 `CozeAPIError`
     - 返回：
       - `CozeChatBasicInfo`：
         - `conversation_id: str`
         - `chat_id: str`
         - `status: str`
         - 可能附带一次性的 meta 信息。

2. `def wait_chat_complete(conversation_id: str, chat_id: str, *, timeout: int = 60, poll_interval: float = 1.0) -> CozeChatStatus`
   - 行为：
     - 基于 `retrieve_chat` 接口轮询：
       - URL: `GET ${COZE_API_BASE}/v3/chat/retrieve?conversation_id={conversation_id}&chat_id={chat_id}`
       - 按文档要求，同时传 `conversation_id` 和 `chat_id` 作为 Query 参数。
       - 每隔 `poll_interval` 秒请求一次（官方建议每秒一次，默认 `1.0` 秒）。
       - 总时长超过 `timeout` 时抛出 `ChatTimeoutError`。
     - 根据响应中的 `status` 字段判断对话状态，可能的取值：
       - `created`：对话已创建
       - `in_progress`：智能体正在处理中
       - `completed`：对话已完成（终态）
       - `failed`：对话失败（终态）
       - `requires_action`：对话中断，需要进一步处理（如工具调用）
       - `canceled`：对话已取消（终态）
     - 返回：
       - `CozeChatStatus`：
         - `status: str`（原始状态值）
         - `done: bool`（是否为终态：completed/failed/canceled）
         - `error_code: str | None`（来自 `last_error.code`）
         - `error_msg: str | None`（来自 `last_error.msg`）

3. `def get_chat_messages(conversation_id: str, chat_id: str) -> list[CozeMessage]`
   - 行为：
     - 调 `list_chat_messages` 接口，获取这轮 chat 的所有 message。
       - URL: `GET ${COZE_API_BASE}/v3/chat/message/list?conversation_id={conversation_id}&chat_id={chat_id}`
       - 同样需要在 Query 里带上 `conversation_id` 和 `chat_id`（与文档示例保持一致）。
     - 映射成内部的 `CozeMessage` 结构，至少包含：
       - `id`
       - `role`：`user` 或 `assistant`
       - `type`：消息类型，可能的取值：
         - `question`：用户输入内容
         - `answer`：智能体返回给用户的消息内容
         - `function_call`：调用函数的中间结果
         - `tool_output` / `tool_response`：调用工具后返回的结果
         - `follow_up`：推荐问题
         - `verbose`：多 answer 场景的结束标志（`content.msg_type=generate_answer_finish`）
       - `content`：消息内容
       - `content_type`：内容类型（`text`、`object_string`、`card`）
       - `raw: dict`（原始响应）
     - **提取智能体回复时**：筛选 `type=answer` 且 `content_type=text` 的消息

#### 5.2.3 响应解析

Coze API 所有响应都有统一的包装结构：

```json
{
  "code": 0,           // 状态码，0 表示成功，非 0 表示失败
  "msg": "",           // 错误信息（失败时有值）
  "data": { ... },     // 实际业务数据
  "detail": { "logid": "..." }  // 调试信息
}
```

**解析规则**：
- 先检查 HTTP 状态码，非 2xx 直接抛 `CozeAPIError`。
- 再检查 `code` 字段：
  - `code == 0`：成功，从 `data` 字段提取实际数据。
  - `code != 0`：失败，用 `code` 和 `msg` 构造 `CozeAPIError` 抛出。
- 所有方法内部都要遵循这个解析逻辑，对上层只暴露干净的业务数据或异常。

#### 5.2.4 错误处理

- 定义一组自定义异常：
  - `CozeAPIError`：HTTP 层错误 / Coze 返回 `code != 0`。
  - `CozeChatTimeoutError`：等待对话完成超时。
  - `CozeInvalidConfigError`：配置缺失导致无法调用。
- 所有 Coze 错误都在这一层转换成上面的异常，**不要把 Coze 的错误码直接往上抛**，上层只依赖我们的异常类型。

---

## 6. ChatService 业务层设计

> 这一层是用“我们的领域模型 + CozeClient”拼出来的服务，不关心 HTTP 细节。

在 `coze_chat_service/chat_service.py` 中实现：

### 6.1 ChatService 接口

定义类或一组函数（推荐类，易于注入依赖）：

```python
class ChatService:
    def __init__(self, coze_client: CozeClient, session_store, message_store):
        ...

    def start_session(self, user_id: str, *, variables: dict | None = None) -> ChatSession:
        ...

    def send_message(self, session_id: str | None, user_id: str, text: str) -> tuple[ChatSession, ChatMessage]:
        ...

    def list_history(self, session_id: str) -> list[ChatMessage]:
        ...
```

### 6.2 内部流程细节

1. `start_session(user_id, variables)`：
   - 生成新的 `session_id`。
   - 构造 `ChatSession`：
     - `coze_chat_id = None`
     - `bot_id = COZE_BOT_ID`
     - `custom_variables = variables`
   - 存入 `session_store`（第一阶段可用内存字典，后续换 DB）。
   - 返回 `ChatSession`。

2. `send_message(session_id, user_id, text)`：
   - 如果 `session_id` 为 `None`：
     - 调 `start_session(user_id)` 创建新会话。
   - 从 `session_store` 取出 `ChatSession`：
     - 如果 `user_id` 不匹配，直接拒绝（避免跨用户窜会话）。
   - 写入一条用户侧 `ChatMessage` 到 `message_store`（id、session_id、role=user、content=text）。
   - 构造 `CozeChatRequest`：
     - `bot_id = session.bot_id`
     - `user_id = session.user_id`
     - `conversation_id = session.coze_conversation_id`
     - `chat_id = session.coze_chat_id`（可能为空）
     - `text = text`
     - `custom_variables = session.custom_variables`
   - 调用 `CozeClient.start_or_continue_chat(req)`：
     - 拿到 `conversation_id` 和 `chat_id`：
       - 如果 `session.coze_conversation_id` / `session.coze_chat_id` 为 None，则更新 session 并存回。
   - 调用 `CozeClient.wait_chat_complete(conversation_id, chat_id, timeout=...)`：
     - 如果超时 / 错误，抛异常给上层。
   - 调用 `CozeClient.get_chat_messages(conversation_id, chat_id)`：
     - 找出“最新一条 assistant 文本消息”：
       - 可以按创建时间排序，取 role == assistant 且类型为 text 的最后一条。
   - 将这条助手消息转换为我们的 `ChatMessage`，写入 `message_store`。
   - 返回：`(session, assistant_message)`。

3. `list_history(session_id)`：
   - 直接从 `message_store` 查询此 `session_id` 的所有 `ChatMessage`，按时间排序返回。
   - 不依赖 Coze 的历史接口，避免后期 Coze 改策略导致历史丢失。

---

## 7. 存储层规划（第一版先用内存）

> 为了避免一上来上数据库把事情搞复杂，先用内存 store 把逻辑跑通，再根据需要下沉到真实 DB。

### 7.1 SessionStore

在 `coze_chat_service/stores.py` 中定义简单接口：

```python
class SessionStore:
    def create(self, session: ChatSession) -> None: ...
    def get(self, session_id: str) -> ChatSession | None: ...
    def update(self, session: ChatSession) -> None: ...
```

内存实现：

```python
class InMemorySessionStore(SessionStore):
    _data: dict[str, ChatSession]
```

### 7.2 MessageStore

接口：

```python
class MessageStore:
    def append(self, message: ChatMessage) -> None: ...
    def list_by_session(self, session_id: str) -> list[ChatMessage]: ...
```

内存实现：

```python
class InMemoryMessageStore(MessageStore):
    _data: dict[str, list[ChatMessage]]
```

后续如果要用数据库：
- 可以按接口替换为 `SQLAlchemyMessageStore`、`RedisSessionStore` 等，而不改 `ChatService`。

---

## 8. API 层设计（FastAPI）

> 这一层负责 HTTP 入出口，调用 `ChatService`，不直接碰 CozeClient。

在 `coze_chat_service/app.py` 中：

### 8.1 初始化依赖

- 在模块顶层：
  - `settings = get_settings()`
  - `coze_client = CozeClient(settings)`
  - `session_store = InMemorySessionStore()`
  - `message_store = InMemoryMessageStore()`
  - `chat_service = ChatService(coze_client, session_store, message_store)`
  - `app = FastAPI(...)`

### 8.2 请求/响应模型（Pydantic）

定义请求/响应 DTO：

- `CreateSessionRequest`：
  - `user_id: str`
  - `variables: dict[str, Any] | None`

- `CreateSessionResponse`：
  - `session_id: str`

- `SendMessageRequest`：
  - `session_id: str | None`
  - `user_id: str`
  - `text: str`

- `SendMessageResponse`：
  - `session_id: str`
  - `assistant_reply: str`
  - （可选）`messages: list[ChatMessageDTO]`

- `ChatMessageDTO`：
  - `id: str`
  - `role: str`
  - `content: str`
  - `created_at: datetime`

### 8.3 路由

1. `POST /chat/session`
   - 入参：`CreateSessionRequest`
   - 调用：`chat_service.start_session(user_id, variables)`
   - 返回：`CreateSessionResponse`

2. `POST /chat/send`
   - 入参：`SendMessageRequest`
   - 调用：`chat_service.send_message(session_id, user_id, text)`
   - 返回：`SendMessageResponse`（携带新/旧 `session_id` 和 `assistant_reply`）

3. `GET /chat/history/{session_id}`
   - 调用：`chat_service.list_history(session_id)`
   - 返回：`list[ChatMessageDTO]`

### 8.4 错误映射

把业务/Coze 异常映射为 HTTP 响应：

- `CozeAPIError` → `502 Bad Gateway`
- `CozeChatTimeoutError` → `504 Gateway Timeout`
- `ValueError` / 参数错误 → `400 Bad Request`
- 未找到会话 → `404 Not Found`

FastAPI 用 `exception_handler` 注册统一处理，错误响应统一结构：

```json
{
  "error": {
    "code": "COZE_TIMEOUT",
    "message": "xxx"
  }
}
```

---

## 9. 流式扩展规划（第二阶段）

> 这一部分先设计形状，不在第一波实现。

### 9.1 内部流式接口形状

给 `CozeClient` 预留一个流式方法：

- `def stream_chat(req: CozeChatRequest) -> Iterable[CozeStreamingEvent]`
  - 内部对接 `streaming_chat_api`：
    - 处理事件类型（增量 token、工具调用、完成等）。

给 `ChatService` 预留：

- `def stream_message(session_id, user_id, text) -> Iterable[StreamDelta]`
  - 把 Coze 的事件压缩成简单事件：
    - `delta`（文本增量）
    - `done`
    - 将最终完整回复写入 `MessageStore`。

### 9.2 API 层形状

- 新增 `GET /chat/stream`（SSE）或 WebSocket endpoint：
  - 客户端通过 SSE/WebSocket 收到 `delta` / `done`。
  - 前端只依赖我们的流式协议，不直接连 Coze。

---

## 10. 开发顺序 & 任务拆分

> 真正动手时建议按下面顺序来，避免一次把复杂度端上来。

### 步骤 1：项目骨架

1. 在 `coze_chat_service` 下创建：
   - `__init__.py`
   - `config.py`
   - `coze_client.py`
   - `chat_service.py`
   - `stores.py`
   - `app.py`
2. 创建 `pyproject.toml` 或 `requirements.txt`（列出 `fastapi`, `uvicorn`, `pydantic`, `requests` 等依赖）。

### 步骤 2：配置模块

1. 实现 `Settings` 加载 `.env`。
2. 在 `app.py` 里用 `get_settings()` 初始化。
3. 缺少 `COZE_ACCESS_TOKEN` / `COZE_BOT_ID` 时启动失败（直接抛异常）。

### 步骤 3：领域模型与内存存储

1. 用 Pydantic 定义 `ChatSession` / `ChatMessage`。
2. 编写 `InMemorySessionStore` / `InMemoryMessageStore`。
3. 写几行简单测试代码验证存取逻辑。

### 步骤 4：CozeClient 非流式实现

1. 实现 `CozeChatRequest` 数据类。
2. 写 `start_or_continue_chat()`：
   - 先只关注 `chat_id` 返回是否正确。
3. 写 `wait_chat_complete()`：
   - 用假数据/伪代码，后续接正式响应结构。
4. 写 `get_chat_messages()`：
   - 先设计解析逻辑，按官方返回结构提取文本内容。

### 步骤 5：ChatService 粘合层

1. 实现 `start_session()`。
2. 实现 `send_message()` 全链路：
   - 创建/获取 session
   - 写入 user message
   - 调 CozeClient 全流程
   - 写入 assistant message
3. 实现 `list_history()`。

### 步骤 6：FastAPI 路由

1. 在 `app.py` 里初始化 `FastAPI`。
2. 定义 Pydantic 请求/响应模型。
3. 实现 `POST /chat/session`、`POST /chat/send`、`GET /chat/history/{session_id}`。
4. 添加异常处理，将内部异常映射为 HTTP 错误。

### 步骤 7：基础验证

1. 使用假/测试 Token（或本地 mock）跑通一次完整调用链（不在此规划中执行，只预留）。
2. 检查：
   - session 是否成功创建和复用。
   - message 是否完整记录。
   - Coze 错误是否被正确映射。

---

## 11. 后续可以考虑的增强（非必须）

- 将内存存储迁移到真实数据库（例如 SQLite / Postgres）。
- 添加简单限流（每用户每分钟请求数限制）。
- 增加日志与 Trace ID，方便排查 Coze 接口调用问题。
- 多 Bot 支持：在请求中增加 `scene` 字段，映射到不同 `bot_id`。
- 工具调用支持：对接 `chat_submit_tool_outputs`，在 `CozeClient` 中识别并处理工具调用事件。

---

## 12. 小结

这份规划的核心思想：

- 用极简的领域模型（`ChatSession` / `ChatMessage`）把所有 Coze 细节挡在外面；
- 先实现一个**非流式、纯文本、单 Bot** 的最小可用 Chat 服务；
- 所有与 Coze 绑定的地方都集中在 `CozeClient` 里，任何上游变化或换供应商都只改这一层。

接下来如果你确认这套规划 OK，我就可以按这个 PLAN 里的顺序，在 `coze_chat_service` 目录里开始真正落代码（从 `config.py` 和 `coze_client.py` 骨架开始）。
