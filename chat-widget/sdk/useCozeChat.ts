import { ref, inject } from 'vue'
import type { ChatConfig } from './index'

// 消息类型
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
}

// 会话类型
export interface Conversation {
  id: string
  name: string
  created_at: number
  updated_at: number
}

// SSE 事件类型 - 收紧定义
type SSEEventType =
  | 'conversation.chat.created'
  | 'conversation.message.delta'
  | 'conversation.message.completed'
  | 'conversation.chat.completed'
  | 'conversation.chat.failed'
  | 'done'

interface SSEChatCreatedData {
  conversation_id: string
  chat_id: string
  debug_url?: string
}

interface SSEMessageDeltaData {
  type: 'answer' | 'function_call' | 'tool_output'
  content: string
  role?: string
}

interface SSEChatFailedData {
  status: string
  code?: number
  msg?: string
}

interface SSEDoneData {
  debug_url?: string
}

// 类型守卫
function isChatCreatedData(data: unknown): data is SSEChatCreatedData {
  return typeof data === 'object' && data !== null && 'conversation_id' in data
}

function isMessageDeltaData(data: unknown): data is SSEMessageDeltaData {
  return typeof data === 'object' && data !== null && 'type' in data && 'content' in data
}

function isChatFailedData(data: unknown): data is SSEChatFailedData {
  return typeof data === 'object' && data !== null && 'status' in data
}

// Coze API 消息类型
interface CozeMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  content_type: string
  type: string
  created_at: number
}

// 生成存储 key
const getStorageKey = (sessionName: string) => `coze_conversation_${sessionName}`

export function useCozeChat(sessionName: string) {
  // 从 SDK 注入的配置获取
  const sdkConfig = inject<ChatConfig>('sdkConfig')

  if (!sdkConfig) {
    throw new Error('[VolcanoSDK] Config not found. Make sure to provide sdkConfig via app.provide()')
  }

  // 状态
  const messages = ref<ChatMessage[]>([])
  const conversations = ref<Conversation[]>([])
  const isLoading = ref(false)
  const isLoadingHistory = ref(false)
  const isCreatingConversation = ref(false)
  const isLoadingConversations = ref(false)
  const conversationId = ref<string | null>(null)
  const error = ref<string | null>(null)
  const debugUrl = ref<string | null>(null)

  // 用于中止请求
  let abortController: AbortController | null = null

  // TTS 播放状态
  const isSpeaking = ref(false)
  const speakingMessageId = ref<string | null>(null)
  let currentAudio: HTMLAudioElement | null = null

  // Token 获取
  const getToken = async (): Promise<string> => {
    if (typeof sdkConfig.token === 'function') {
      return await sdkConfig.token()
    }
    return sdkConfig.token
  }

  // 获取对话列表
  const fetchConversationList = async () => {
    try {
      isLoadingConversations.value = true
      const token = await getToken()

      const response = await fetch(`https://api.coze.cn/v1/conversations?bot_id=${sdkConfig.botId}&page_num=1&page_size=50&sort_order=DESC&connector_id=1024`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.code === 0 && result.data?.conversations) {
        conversations.value = result.data.conversations.map((c: any) => ({
          id: c.id,
          name: c.name || `对话 ${c.id.slice(-6)}`,
          created_at: c.created_at * 1000,
          updated_at: c.updated_at * 1000
        }))
      }
    } catch (e) {
      console.error('[Coze] 获取对话列表失败:', e)
    } finally {
      isLoadingConversations.value = false
    }
  }

  // 切换对话
  const switchConversation = async (convId: string) => {
    if (convId === conversationId.value) return
    
    conversationId.value = convId
    saveConversationId(convId)
    messages.value = []
    await fetchMessageHistory(convId)
  }

  // 从 Coze API 获取消息历史
  const fetchMessageHistory = async (convId: string) => {
    try {
      isLoadingHistory.value = true
      const token = await getToken()

      const response = await fetch(`https://api.coze.cn/v1/conversation/message/list?conversation_id=${convId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: 'asc',
          limit: 50
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.code === 0 && result.data) {
        messages.value = result.data
          .filter((m: CozeMessage) => m.type === 'question' || m.type === 'answer')
          .map((m: CozeMessage) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.created_at * 1000,
            isStreaming: false
          }))
      }
    } catch (e) {
      console.error('[Coze] 获取消息历史失败:', e)
    } finally {
      isLoadingHistory.value = false
    }
  }

  // 初始化：从 sessionStorage 恢复 conversationId，然后从 API 获取消息
  const initConversation = async () => {
    const storedConvId = sessionStorage.getItem(getStorageKey(sessionName))
    if (storedConvId) {
      conversationId.value = storedConvId
      await fetchMessageHistory(storedConvId)
    }
  }

  // 保存 conversationId 到 sessionStorage
  const saveConversationId = (id: string) => {
    sessionStorage.setItem(getStorageKey(sessionName), id)
  }

  // 清除存储的 conversationId
  const clearStoredConversation = () => {
    sessionStorage.removeItem(getStorageKey(sessionName))
  }

  // 立即初始化
  initConversation()

  // 统一处理 debug_url（消除重复）
  const handleDebugUrl = (url: string) => {
    debugUrl.value = url
    // 安全的 postMessage：只发给同源父窗口，如果是跨域 iframe 则需要配置具体域名
    const targetOrigin = window.location.origin
    window.parent.postMessage({ type: 'coze-debug-url', debugUrl: url }, targetOrigin)
  }

  // SSE 事件处理器（从 sendMessage 拆分出来）
  const processSSEEvent = (event: SSEEventType, data: unknown) => {
    switch (event) {
      case 'conversation.chat.created':
        if (isChatCreatedData(data)) {
          conversationId.value = data.conversation_id
          saveConversationId(data.conversation_id)
          if (data.debug_url) handleDebugUrl(data.debug_url)
        }
        break

      case 'conversation.message.delta':
        if (isMessageDeltaData(data) && data.type === 'answer') {
          const lastMsg = messages.value[messages.value.length - 1]
          if (lastMsg?.role === 'assistant') {
            lastMsg.content += data.content
            messages.value = [...messages.value]
          }
        }
        break

      case 'conversation.chat.completed': {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg) lastMsg.isStreaming = false
        break
      }

      case 'conversation.chat.failed':
        if (isChatFailedData(data)) {
          error.value = data.msg || data.status || '对话失败'
        }
        break

      case 'done': {
        const doneData = data as SSEDoneData
        if (doneData.debug_url) handleDebugUrl(doneData.debug_url)
        break
      }
    }
  }

  // 创建新对话
  const createNewConversation = async () => {
    try {
      isCreatingConversation.value = true
      error.value = null

      const token = await getToken()

      const response = await fetch('https://api.coze.cn/v1/conversation/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bot_id: sdkConfig.botId
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.code === 0 && result.data?.id) {
        messages.value = []
        conversationId.value = result.data.id
        saveConversationId(result.data.id)
        return result.data.id
      } else {
        throw new Error(result.msg || '创建对话失败')
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '创建对话失败'
      console.error('[Coze] 创建对话失败:', e)
      return null
    } finally {
      isCreatingConversation.value = false
    }
  }

  // 发送消息
  const sendMessage = async (content: string, params?: Record<string, any>) => {
    if (!content.trim() || isLoading.value) return

    error.value = null
    isLoading.value = true
    debugUrl.value = null

    // 创建新的 AbortController
    abortController = new AbortController()

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now()
    }
    messages.value.push(userMessage)

    // 创建助手消息占位
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    }
    messages.value.push(assistantMessage)

    try {
      const token = await getToken()

      const response = await fetch('https://api.coze.cn/v1/workflows/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workflow_id: sdkConfig.workflowId,
          app_id: sdkConfig.appId,
          additional_messages: [
            {
              role: 'user',
              content: content.trim(),
              content_type: 'text'
            }
          ],
          parameters: {
            user_uuid: sessionName,
            ...params
          },
          ...(conversationId.value ? { conversation_id: conversationId.value } : {})
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 读取 SSE 流
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent: SSEEventType | '' = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim() as SSEEventType
          } else if (line.startsWith('data:') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(5).trim())
              processSSEEvent(currentEvent, data)
            } catch {
              // JSON 解析失败，忽略
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 用户主动停止，不显示错误
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg?.role === 'assistant' && !lastMsg.content) {
          lastMsg.content = '[已停止]'
        }
      } else {
        error.value = e instanceof Error ? e.message : '发送失败'
        messages.value.pop()
      }
    } finally {
      isLoading.value = false
      abortController = null
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage) {
        lastMessage.isStreaming = false
      }
    }
  }

  // 停止请求
  const stopRequest = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  // 清空对话
  const clearMessages = () => {
    messages.value = []
    conversationId.value = null
    clearStoredConversation()
    error.value = null
  }

  // 复制文本到剪贴板
  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  // TTS 朗读文本 - WebSocket 流式播放
  const speakText = async (text: string, messageId: string) => {
    if (currentAudio) {
      stopSpeaking()
    }

    try {
      isSpeaking.value = true
      speakingMessageId.value = messageId

      const token = await getToken()
      const voiceId = sdkConfig.voiceId

      // 使用 WebSocket 流式 TTS
      const ws = new WebSocket(`wss://ws.coze.cn/v1/audio/speech?authorization=Bearer ${token}`)

      // 音频上下文和播放队列
      let audioContext: AudioContext | null = null
      let nextStartTime = 0
      const audioQueue: AudioBuffer[] = []
      let isPlaying = false
      let currentSource: AudioBufferSourceNode | null = null
      let stopped = false

      const playNextBuffer = () => {
        if (stopped || !audioContext || audioQueue.length === 0) {
          isPlaying = false
          currentSource = null
          return
        }
        isPlaying = true
        const buffer = audioQueue.shift()!
        const source = audioContext.createBufferSource()
        currentSource = source
        source.buffer = buffer
        source.connect(audioContext.destination)

        const startTime = Math.max(audioContext.currentTime, nextStartTime)
        source.start(startTime)
        nextStartTime = startTime + buffer.duration

        source.onended = () => {
          if (!stopped && audioQueue.length > 0) {
            playNextBuffer()
          } else {
            isPlaying = false
            currentSource = null
          }
        }
      }

      ws.onopen = () => {
        // 初始化音频上下文
        audioContext = new AudioContext({ sampleRate: 24000 })
        nextStartTime = audioContext.currentTime

        // 发送配置
        ws.send(JSON.stringify({
          id: `config-${Date.now()}`,
          event_type: 'speech.update',
          data: {
            output_audio: {
              codec: 'pcm',
              pcm_config: { sample_rate: 24000 },
              voice_id: voiceId,
              speech_rate: 0
            }
          }
        }))

        // 发送文本（分段发送避免超过1024字节限制）
        const chunks = text.match(/.{1,500}/g) || [text]
        chunks.forEach(chunk => {
          ws.send(JSON.stringify({
            id: `text-${Date.now()}`,
            event_type: 'input_text_buffer.append',
            data: { delta: chunk }
          }))
        })

        // 提交完成
        ws.send(JSON.stringify({
          id: `complete-${Date.now()}`,
          event_type: 'input_text_buffer.complete'
        }))
      }

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data)

        if (msg.event_type === 'speech.audio.update' && msg.data?.delta) {
          // 解码 base64 PCM 数据
          const binaryStr = atob(msg.data.delta)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i)
          }

          // PCM 16bit 转 Float32
          const samples = new Float32Array(bytes.length / 2)
          const dataView = new DataView(bytes.buffer)
          for (let i = 0; i < samples.length; i++) {
            samples[i] = dataView.getInt16(i * 2, true) / 32768
          }

          // 创建 AudioBuffer
          if (audioContext) {
            const audioBuffer = audioContext.createBuffer(1, samples.length, 24000)
            audioBuffer.getChannelData(0).set(samples)
            audioQueue.push(audioBuffer)

            if (!isPlaying) {
              playNextBuffer()
            }
          }
        } else if (msg.event_type === 'speech.audio.completed') {
          ws.close()
        } else if (msg.event_type === 'error') {
          ws.close()
        }
      }

      ws.onerror = () => {
        isSpeaking.value = false
        speakingMessageId.value = null
      }

      ws.onclose = () => {
        // 等待所有音频播放完成
        const checkComplete = () => {
          if (audioQueue.length === 0 && !isPlaying) {
            isSpeaking.value = false
            speakingMessageId.value = null
            if (audioContext) {
              audioContext.close()
            }
          } else {
            setTimeout(checkComplete, 100)
          }
        }
        checkComplete()
      }

      // 保存引用用于停止
      const audioState = {
        ws,
        getAudioContext: () => audioContext,
        getCurrentSource: () => currentSource,
        getAudioQueue: () => audioQueue,
        setStopped: (val: boolean) => { stopped = val }
      }
      currentAudio = audioState as any

    } catch (e) {
      isSpeaking.value = false
      speakingMessageId.value = null
    }
  }

  // 停止朗读
  const stopSpeaking = () => {
    if (currentAudio) {
      const audio = currentAudio as any

      // 设置停止标志，阻止继续播放队列
      if (audio.setStopped) {
        audio.setStopped(true)
      }

      // 停止当前正在播放的音频
      if (audio.getCurrentSource) {
        const source = audio.getCurrentSource()
        if (source) {
          try {
            source.stop()
          } catch {}
        }
      }

      // 清空队列
      if (audio.getAudioQueue) {
        const queue = audio.getAudioQueue()
        queue.length = 0
      }

      // 关闭 WebSocket
      if (audio.ws) {
        audio.ws.close()
      }

      // 关闭 AudioContext
      if (audio.getAudioContext) {
        const ctx = audio.getAudioContext()
        if (ctx) {
          try {
            ctx.close()
          } catch {}
        }
      }

      currentAudio = null
    }
    isSpeaking.value = false
    speakingMessageId.value = null
  }

  return {
    messages,
    conversations,
    isLoading,
    isLoadingHistory,
    isCreatingConversation,
    isLoadingConversations,
    conversationId,
    error,
    debugUrl,
    isSpeaking,
    speakingMessageId,
    sendMessage,
    stopRequest,
    clearMessages,
    createNewConversation,
    fetchConversationList,
    switchConversation,
    copyText,
    speakText,
    stopSpeaking
  }
}