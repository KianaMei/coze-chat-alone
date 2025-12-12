/**
 * Volcano Chat SDK
 * 一个轻量级的聊天组件 SDK，支持工作流对话、语音输入、语音朗读
 */

import { createApp, h, type App } from 'vue'
// @ts-ignore - ChatWidget 会自动使用 SDK 版本的 composables（通过 alias）
import ChatWidget from '../components/ChatWidget.vue'
import chatWidgetStyles from '../assets/css/chat-widget.css?inline'

// 导出类型
export interface ChatConfig {
  /** 工作流 ID */
  workflowId: string
  /** 应用 ID */
  appId: string
  /** 访问令牌，可以是字符串或返回 token 的函数 */
  token: string | (() => Promise<string>)
  /** 语音 ID（可选，用于 TTS） */
  voiceId?: string
  /** Bot ID（可选，用于历史会话） */
  botId?: string
}

export interface UserInfo {
  /** 用户 ID，用于会话隔离 */
  id: string
  /** 用户昵称 */
  nickname?: string
  /** 用户头像 URL */
  avatar?: string
}

export interface UIConfig {
  /** 标题 */
  title?: string
  /** 图标 URL */
  icon?: string
  /** 主题色 */
  primaryColor?: string
  /** 宽度 */
  width?: number | string
  /** 高度 */
  height?: number | string
  /** 自定义 CSS 类名 */
  className?: string
}

export interface FeatureConfig {
  /** 启用语音输入 */
  voiceInput?: boolean
  /** 启用语音朗读 */
  tts?: boolean
  /** 启用历史会话 */
  history?: boolean
  /** 启用新建对话 */
  newConversation?: boolean
}

export interface ChatAppOptions {
  /** 聊天配置 */
  config: ChatConfig
  /** 用户信息 */
  userInfo?: UserInfo
  /** UI 配置 */
  ui?: UIConfig
  /** 功能配置 */
  features?: FeatureConfig
  /** 挂载容器，CSS 选择器或 DOM 元素 */
  container: string | HTMLElement
  /** 消息回调 */
  onMessage?: (message: { role: string; content: string }) => void
  /** 错误回调 */
  onError?: (error: Error) => void
}

// SDK 版本
export const VERSION = '0.1.0'

/**
 * Chat App SDK 主类
 */
export class ChatApp {
  private options: ChatAppOptions
  private app: App | null = null
  private iframe: HTMLIFrameElement | null = null
  private containerEl: HTMLElement | null = null

  constructor(options: ChatAppOptions) {
    this.options = this.mergeDefaults(options)
    this.init()
  }

  private mergeDefaults(options: ChatAppOptions): ChatAppOptions {
    return {
      ...options,
      userInfo: {
        id: options.userInfo?.id || `user_${Date.now()}`,
        nickname: options.userInfo?.nickname || 'User',
        avatar: options.userInfo?.avatar || '',
      },
      ui: {
        title: options.ui?.title || 'AI 助手',
        width: options.ui?.width || '100%',
        height: options.ui?.height || '100%',
        ...options.ui,
      },
      features: {
        voiceInput: options.features?.voiceInput ?? true,
        tts: options.features?.tts ?? true,
        history: options.features?.history ?? true,
        newConversation: options.features?.newConversation ?? true,
        ...options.features,
      },
    }
  }

  private init() {
    // 获取容器元素
    if (typeof this.options.container === 'string') {
      this.containerEl = document.querySelector(this.options.container)
    } else {
      this.containerEl = this.options.container
    }

    if (!this.containerEl) {
      throw new Error(`[VolcanoSDK] Container not found: ${this.options.container}`)
    }

    // 创建 iframe 来隔离样式
    this.createIframe()
  }

  private createIframe() {
    if (!this.containerEl) return

    this.iframe = document.createElement('iframe')
    this.iframe.style.cssText = `
      width: ${typeof this.options.ui?.width === 'number' ? this.options.ui.width + 'px' : this.options.ui?.width};
      height: ${typeof this.options.ui?.height === 'number' ? this.options.ui.height + 'px' : this.options.ui?.height};
      border: none;
      background: transparent;
    `

    if (this.options.ui?.className) {
      this.iframe.className = this.options.ui.className
    }

    this.containerEl.appendChild(this.iframe)

    // 写入基础 HTML 并立即渲染
    const iframeDoc = this.iframe.contentDocument
    if (iframeDoc) {
      iframeDoc.open()
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500&display=swap">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body, #sdk-root { width: 100%; height: 100%; }
            ${chatWidgetStyles}
          </style>
        </head>
        <body>
          <div id="sdk-root"></div>
        </body>
        </html>
      `)
      iframeDoc.close()

      // 立即渲染
      this.renderApp()
    }
  }

  private renderApp() {
    if (!this.iframe?.contentDocument) return

    const root = this.iframe.contentDocument.getElementById('sdk-root')
    if (!root) return

    // 创建 Vue 应用
    this.app = createApp({
      setup: () => {
        return () => h(ChatWidget, {
          sessionName: this.options.userInfo?.id || 'default',
          onDebugUrl: (url: string) => {
            console.log('[VolcanoSDK] Debug URL:', url)
          }
        })
      }
    })

    // 提供配置
    this.app.provide('sdkConfig', this.options.config)
    this.app.provide('sdkUserInfo', this.options.userInfo)
    this.app.provide('sdkUI', this.options.ui)
    this.app.provide('sdkFeatures', this.options.features)

    this.app.mount(root)
  }

  /**
   * 销毁 SDK 实例
   */
  destroy() {
    if (this.app) {
      this.app.unmount()
      this.app = null
    }
    if (this.iframe) {
      this.iframe.remove()
      this.iframe = null
    }
  }

  /**
   * 发送消息
   */
  sendMessage(content: string) {
    // TODO: 通过事件总线发送消息
    console.log('[VolcanoSDK] Send message:', content)
  }

  /**
   * 清空对话
   */
  clearMessages() {
    // TODO: 通过事件总线清空消息
    console.log('[VolcanoSDK] Clear messages')
  }
}

// 全局变量（UMD 构建时使用）
if (typeof window !== 'undefined') {
  (window as any).VolcanoSDK = {
    ChatApp,
    VERSION
  }
}
