# Coze Chat 组件开发计划

## 目标
创建一个独立的 Vue/Nuxt 聊天组件，调用 Coze workflow_chat API，可嵌入任意 Nuxt 页面。

## 技术方案

### 架构
```
浏览器
  ↓ 直接调用（Coze 支持 CORS）
Coze API (workflow_chat)
  ↓ SSE 流式响应
ChatWidget 组件解析并渲染
```

### Token 获取方案
```
被嵌入的页面 → 传入 session_name (props)
    ↓
ChatWidget 组件
    ↓
get_token_by_session(session_name)  // 已有函数，目前先注释掉
    ↓
token（目前先写死）
```

**组件使用方式：**
```vue
<ChatWidget :session-name="userSessionName" />
```

## 文件结构

```
volcano-chat/
└── chat-widget/                    # 独立的聊天组件项目
    ├── nuxt.config.ts
    ├── .env                        # COZE_WORKFLOW_ID, COZE_APP_ID, TEMP_TOKEN（临时）
    ├── composables/
    │   └── useCozeChat.ts          # 核心逻辑：SSE 解析、状态管理、token 获取
    ├── components/
    │   └── ChatWidget.vue          # UI 组件（接收 session-name prop）
    ├── pages/
    │   └── index.vue               # 预览页面
    └── package.json
```

## 核心文件说明

### 1. `.env`
```
COZE_WORKFLOW_ID=7582422134879682614
COZE_APP_ID=7582218686560911366
TEMP_TOKEN=cztei_xxx   # 临时写死，后续删除
```

### 2. `composables/useCozeChat.ts`
核心功能：
- `useCozeChat(sessionName)` - 接收 sessionName 参数
- Token 获取逻辑：
  ```typescript
  // 目前先写死
  const token = TEMP_TOKEN

  // 后续启用（已有函数，取消注释即可）
  // const token = await get_token_by_session(sessionName)
  ```
- `sendMessage(content, params?)` - 发送消息
- `messages` - 响应式消息列表
- `isLoading` - 加载状态
- `conversationId` - 会话 ID（多轮对话）
- SSE 流解析，处理 `conversation.message.delta` 实现打字机效果

### 3. `components/ChatWidget.vue`
Props:
- `sessionName: string` - 从父页面传入，用于获取 token

UI 组件（使用 Arco Design Vue）：
- 消息列表（用户/助手区分，使用 `a-list` 或自定义布局）
- 输入框 `a-textarea` + 发送按钮 `a-button`
- 加载动画 `a-spin`
- Arco 的设计风格，简洁现代

## 第一阶段功能（MVP）
- [x] 单轮对话
- [x] 流式输出（打字机效果）
- [x] 基础 UI（消息气泡、输入框）
- [x] 传递自定义 parameters（如 user_uuid）

## 后续迭代
- [ ] 多轮对话（保存 conversation_id）
- [ ] 历史消息展示
- [ ] 错误处理 & 重试
- [ ] 消息复制、反馈
- [ ] 移动端适配

## 实现顺序

1. 初始化 Nuxt 3 项目
2. 安装 Arco Design Vue (`@arco-design/web-vue`)
3. 配置 Nuxt 插件加载 Arco
4. 创建 `.env` 配置文件（含临时 token）
5. 创建 `composables/useCozeChat.ts`（SSE 核心逻辑 + token 占位）
6. 创建 `components/ChatWidget.vue`（接收 sessionName prop）
7. 创建 `pages/index.vue` 预览页（模拟传入 sessionName）
8. 测试 & 调试
