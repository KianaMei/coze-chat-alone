import { ref, reactive, onMounted } from 'vue'

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

// SSE 事件数据类型
interface SSEEventData {
  id?: string
  conversation_id?: string
  chat_id?: string
  content?: string
  type?: string
  role?: string
  status?: string
  debug_url?: string
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
  const config = useRuntimeConfig()

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

  // Token 获取
  const getToken = async (): Promise<string> => {
    return config.public.tempToken as string
  }

  // 获取对话列表
  const fetchConversationList = async () => {
    try {
      isLoadingConversations.value = true
      const token = await getToken()

      const response = await fetch(`https://api.coze.cn/v1/conversations?bot_id=${config.public.cozeBotId}&page_num=1&page_size=50&sort_order=DESC&connector_id=1024`, {
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
      console.log('[Coze] 获取对话列表:', result)

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
      console.log('[Coze] 获取消息历史:', result)

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
        console.log('[Coze] 恢复消息:', messages.value.length, '条')
      }
    } catch (e) {
      console.error('[Coze] 获取消息历史失败:', e)
    } finally {
      isLoadingHistory.value = false
    }
  }

  // 初始化：从 sessionStorage 恢复 conversationId，然后从 API 获取消息
  const initConversation = async () => {
    if (typeof window !== 'undefined') {
      const storedConvId = sessionStorage.getItem(getStorageKey(sessionName))
      if (storedConvId) {
        conversationId.value = storedConvId
        console.log('[Coze] 恢复 conversationId:', storedConvId)
        await fetchMessageHistory(storedConvId)
      }
    }
  }

  // 保存 conversationId 到 sessionStorage
  const saveConversationId = (id: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(getStorageKey(sessionName), id)
      console.log('[Coze] 保存 conversationId:', id)
    }
  }

  // 清除存储的 conversationId
  const clearStoredConversation = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(getStorageKey(sessionName))
    }
  }

  // 立即初始化
  initConversation()

  // 解析 SSE 数据流
  const parseSSELine = (line: string): { event: string; data: SSEEventData } | null => {
    if (!line.trim()) return null

    const eventMatch = line.match(/^event:\s*(.+)$/)
    const dataMatch = line.match(/^data:\s*(.+)$/)

    if (eventMatch) {
      return { event: eventMatch[1], data: {} }
    }

    if (dataMatch) {
      try {
        return { event: '', data: JSON.parse(dataMatch[1]) }
      } catch {
        return null
      }
    }

    return null
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
          bot_id: config.public.cozeBotId
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('[Coze] 创建新对话:', result)

      if (result.code === 0 && result.data?.id) {
        messages.value = []
        conversationId.value = result.data.id
        saveConversationId(result.data.id)
        console.log('[Coze] 新对话 ID:', result.data.id)
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
          workflow_id: config.public.cozeWorkflowId,
          app_id: config.public.cozeAppId,
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
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 读取 SSE 流
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.replace('event:', '').trim()
            console.log('[SSE EVENT]', currentEvent)
          } else if (line.startsWith('data:')) {
            const dataStr = line.replace('data:', '').trim()
            console.log('[SSE DATA]', currentEvent, dataStr)
            try {
              const data: SSEEventData = JSON.parse(dataStr)

              // 处理不同事件
              switch (currentEvent) {
                case 'conversation.chat.created':
                  console.log('=== conversation.chat.created ===', data)
                  if (data.conversation_id) {
                    conversationId.value = data.conversation_id
                    saveConversationId(data.conversation_id)
                  }
                  if (data.debug_url) {
                    console.log('收到 debug_url:', data.debug_url)
                    debugUrl.value = data.debug_url
                    window.parent.postMessage({
                      type: 'coze-debug-url',
                      debugUrl: data.debug_url
                    }, '*')
                    console.log('已发送 postMessage')
                  }
                  break

                case 'conversation.message.delta':
                  if (data.type === 'answer' && data.content) {
                    console.log(data.content)
                    const lastMsg = messages.value[messages.value.length - 1]
                    if (lastMsg && lastMsg.role === 'assistant') {
                      lastMsg.content += data.content
                      messages.value = [...messages.value]
                    }
                  }
                  break

                case 'conversation.message.completed':
                  break

                case 'conversation.chat.completed':
                  const lastMessage = messages.value[messages.value.length - 1]
                  if (lastMessage) {
                    lastMessage.isStreaming = false
                  }
                  break

                case 'conversation.chat.failed':
                  error.value = data.status || '对话失败'
                  break

                case 'done':
                  if (data.debug_url) {
                    console.log('收到 debug_url:', data.debug_url)
                    debugUrl.value = data.debug_url
                    window.parent.postMessage({
                      type: 'coze-debug-url',
                      debugUrl: data.debug_url
                    }, '*')
                    console.log('已发送 postMessage')
                  }
                  break
              }
            } catch (e) {
              // JSON 解析失败，忽略
            }
          }
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '发送失败'
      messages.value.pop()
    } finally {
      isLoading.value = false
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage) {
        lastMessage.isStreaming = false
      }
    }
  }

  // 清空对话
  const clearMessages = () => {
    messages.value = []
    conversationId.value = null
    clearStoredConversation()
    error.value = null
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
    sendMessage,
    clearMessages,
    createNewConversation,
    fetchConversationList,
    switchConversation
  }
}