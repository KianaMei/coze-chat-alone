# Volcano Chat SDK

一个轻量级的聊天组件 SDK，支持工作流对话、语音输入、语音朗读。

## 特性

- ✅ 流式工作流对话 (Coze Workflow SSE)
- ✅ 语音输入 (ASR)
- ✅ 语音朗读 (WebSocket TTS)
- ✅ 会话管理
- ✅ iframe 隔离样式
- ✅ 完整的 TypeScript 类型支持

## 安装

### 通过 npm/yarn (推荐)
```bash
npm install @volcano/chat-sdk
# 或
yarn add @volcano/chat-sdk
```

### 通过 CDN
```html
<script src="https://unpkg.com/@volcano/chat-sdk/dist/volcano-chat-sdk.umd.js"></script>
```

## 快速开始

### HTML + UMD

```html
<!DOCTYPE html>
<html>
<head>
  <title>Volcano Chat Demo</title>
</head>
<body>
  <!-- 聊天容器 -->
  <div id="chat-container" style="width: 400px; height: 600px;"></div>

  <!-- 引入 SDK -->
  <script src="volcano-chat-sdk.umd.js"></script>

  <script>
    // 初始化聊天组件
    const chatApp = new VolcanoSDK.ChatApp({
      config: {
        workflowId: '7582422134879682614',
        appId: '7582218686560911366',
        token: 'pat_your_token_here',  // 或使用函数动态获取
        voiceId: '7426725529589596187', // 可选
        botId: 'your_bot_id'            // 可选，用于会话历史
      },
      userInfo: {
        id: 'user_001',
        nickname: '用户',
        avatar: 'https://example.com/avatar.jpg'
      },
      container: '#chat-container'
    })
  </script>
</body>
</html>
```

### ES Module

```typescript
import { ChatApp } from '@volcano/chat-sdk'

const chatApp = new ChatApp({
  config: {
    workflowId: '7582422134879682614',
    appId: '7582218686560911366',
    token: async () => {
      // 动态获取 token
      const response = await fetch('/api/get-token')
      const data = await response.json()
      return data.token
    },
    voiceId: '7426725529589596187'
  },
  userInfo: {
    id: 'user_001'
  },
  ui: {
    title: 'AI 助手',
    width: 400,
    height: 600
  },
  container: document.getElementById('chat')!,
  onMessage: (msg) => {
    console.log('新消息:', msg)
  }
})
```

## API 文档

### ChatApp 构造函数

```typescript
new ChatApp(options: ChatAppOptions)
```

#### ChatAppOptions

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config` | `ChatConfig` | ✅ | 聊天配置 |
| `userInfo` | `UserInfo` | | 用户信息 |
| `ui` | `UIConfig` | | UI 配置 |
| `features` | `FeatureConfig` | | 功能配置 |
| `container` | `string \| HTMLElement` | ✅ | 挂载容器 |
| `onMessage` | `(msg: ChatMessage) => void` | | 消息回调 |
| `onError` | `(error: Error) => void` | | 错误回调 |

#### ChatConfig

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workflowId` | `string` | ✅ | 工作流 ID |
| `appId` | `string` | ✅ | 应用 ID |
| `token` | `string \| (() => Promise<string>)` | ✅ | 访问令牌 |
| `voiceId` | `string` | | 语音 ID (TTS) |
| `botId` | `string` | | Bot ID (历史会话) |

#### UserInfo

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 用户 ID (会话隔离) |
| `nickname` | `string` | | 用户昵称 |
| `avatar` | `string` | | 头像 URL |

#### UIConfig

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | `string` | `'AI 助手'` | 标题 |
| `width` | `number \| string` | `'100%'` | 宽度 |
| `height` | `number \| string` | `'100%'` | 高度 |
| `className` | `string` | | 自定义 CSS 类名 |

#### FeatureConfig

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `voiceInput` | `boolean` | `true` | 启用语音输入 |
| `tts` | `boolean` | `true` | 启用语音朗读 |
| `history` | `boolean` | `true` | 启用历史会话 |
| `newConversation` | `boolean` | `true` | 启用新建对话 |

### 实例方法

#### destroy()
销毁 SDK 实例，释放资源

```typescript
chatApp.destroy()
```

#### sendMessage(content: string)
发送消息

```typescript
chatApp.sendMessage('你好，请介绍一下自己')
```

#### clearMessages()
清空对话

```typescript
chatApp.clearMessages()
```

## 完整示例

查看 `sdk/demo.html` 获取完整的交互式示例。

## 构建

```bash
# 安装依赖
npm install

# 构建 SDK
npm run build:sdk

# 输出目录: dist-sdk/
# - volcano-chat-sdk.umd.js  (UMD 格式，用于浏览器)
# - volcano-chat-sdk.es.js   (ESM 格式，用于打包工具)
# - volcano-chat-sdk.css     (样式文件)
```

## 技术栈

- Vue 3
- TypeScript
- Coze API (Workflow SSE, ASR, TTS)
- Web Audio API

## License

MIT

## 相关链接

- [Coze API 文档](https://www.coze.cn/open/docs)
- [项目仓库](https://github.com/your-repo/volcano-chat)
