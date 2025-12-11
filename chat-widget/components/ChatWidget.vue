<script setup lang="ts">
import { nextTick, watch, computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  sessionName: string
}>()

const emit = defineEmits<{
  (e: 'debugUrl', url: string): void
}>()

const { 
  messages, 
  conversations,
  isLoading, 
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
} = useCozeChat(props.sessionName)
const { isRecording, isTranscribing, error: voiceError, startRecording, stopRecording, cancelRecording } = useVoiceInput()

const inputContent = ref('')
const messageListRef = ref<HTMLElement | null>(null)
const showHistoryPanel = ref(false)

marked.setOptions({
  breaks: true,
  gfm: true
})

const renderMarkdown = (content: string) => {
  if (!content) return ''
  return marked.parse(content)
}

const isThinking = computed(() => {
  if (!isLoading.value) return false
  const lastMsg = messages.value[messages.value.length - 1]
  return lastMsg && lastMsg.role === 'assistant' && lastMsg.content === ''
})

watch(debugUrl, (url) => {
  if (url) {
    emit('debugUrl', url)
  }
})

const handleSend = async () => {
  if (!inputContent.value.trim() || isLoading.value) return
  const content = inputContent.value
  inputContent.value = ''
  await sendMessage(content)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

const handleVoiceStart = async () => {
  try {
    await startRecording()
  } catch (e) {
    console.error('录音启动失败:', e)
  }
}

const handleVoiceEnd = async () => {
  if (!isRecording.value) return
  try {
    const text = await stopRecording()
    if (text.trim()) {
      inputContent.value = text
    }
  } catch (e) {
    console.error('转录失败:', e)
  }
}

const handleNewConversation = async () => {
  if (isLoading.value || isCreatingConversation.value) return
  await createNewConversation()
}

const handleOpenHistory = async () => {
  showHistoryPanel.value = true
  await fetchConversationList()
}

const handleSelectConversation = async (convId: string) => {
  await switchConversation(convId)
  showHistoryPanel.value = false
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - timestamp
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

watch(messages, async () => {
  await nextTick()
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}, { deep: true })
</script>

<template>
  <div class="chat-widget">
    <div class="chat-header">
      <div class="header-left">
        <div class="bot-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.2"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <div class="header-info">
          <span class="title">AI 助手</span>
          <span class="status">在线</span>
        </div>
      </div>
      <div class="header-actions">
        <button 
          class="history-btn" 
          @click="handleOpenHistory" 
          :disabled="isLoadingConversations"
          title="历史对话"
        >
          <svg v-if="!isLoadingConversations" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span v-else class="mini-loader"></span>
        </button>
        <button 
          class="new-chat-btn" 
          @click="handleNewConversation" 
          :disabled="isLoading || isCreatingConversation"
          title="新对话"
        >
          <svg v-if="!isCreatingConversation" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span v-else class="mini-loader"></span>
        </button>
        <button class="clear-btn" @click="clearMessages" title="清空对话">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 历史对话面板 -->
    <div v-if="showHistoryPanel" class="history-panel">
      <div class="history-header">
        <span class="history-title">历史对话</span>
        <button class="history-close" @click="showHistoryPanel = false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="history-list">
        <div v-if="isLoadingConversations" class="history-loading">
          <span class="mini-loader"></span>
          <span>加载中...</span>
        </div>
        <div v-else-if="conversations.length === 0" class="history-empty">
          暂无历史对话
        </div>
        <div
          v-else
          v-for="conv in conversations"
          :key="conv.id"
          :class="['history-item', { active: conv.id === conversationId }]"
          @click="handleSelectConversation(conv.id)"
        >
          <div class="history-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="history-item-content">
            <span class="history-item-name">{{ conv.name }}</span>
            <span class="history-item-time">{{ formatTime(conv.updated_at) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="showHistoryPanel" class="history-backdrop" @click="showHistoryPanel = false"></div>

    <div ref="messageListRef" class="message-list">
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-illustration">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="empty-text">有什么可以帮您？</p>
        <p class="empty-hint">输入消息开始对话</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message-row', msg.role]"
      >
        <template v-if="!(msg.role === 'assistant' && !msg.content)">
          <div class="avatar">
            <template v-if="msg.role === 'user'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/>
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </template>
            <template v-else>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.3"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </template>
          </div>
          <div class="bubble">
            <div v-if="msg.role === 'assistant'" class="markdown-content" v-html="renderMarkdown(msg.content)"></div>
            <template v-else>{{ msg.content }}</template>
            <span v-if="msg.isStreaming && msg.content" class="typing-cursor"></span>
          </div>
        </template>
      </div>

      <div v-if="isThinking" class="thinking-indicator">
        <div class="thinking-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.3"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="thinking-bubble">
          <span class="thinking-text">思考中</span>
          <span class="thinking-dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>

      <div v-if="isLoading && messages.length === 0" class="loading-indicator">
        <div class="dot-loader">
          <span></span><span></span><span></span>
        </div>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>

    <div class="input-area">
      <button
        :class="['mic-btn', { recording: isRecording, processing: isTranscribing }]"
        :disabled="isLoading"
        @mousedown="handleVoiceStart"
        @mouseup="handleVoiceEnd"
        @mouseleave="isRecording && handleVoiceEnd()"
        @touchstart.prevent="handleVoiceStart"
        @touchend.prevent="handleVoiceEnd"
      >
        <template v-if="isRecording">
          <span class="rec-indicator"></span>
        </template>
        <template v-else-if="isTranscribing">
          <span class="mini-loader"></span>
        </template>
        <template v-else>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" stroke="currentColor" stroke-width="2"/>
            <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 19v4m-4 0h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </template>
      </button>

      <div class="text-input-wrap">
        <textarea
          v-model="inputContent"
          placeholder="输入消息..."
          rows="1"
          :disabled="isLoading || isRecording"
          @keydown="handleKeydown"
        />
      </div>

      <button
        class="send-btn"
        :disabled="!inputContent.trim() || isLoading || isRecording"
        @click="handleSend"
      >
        <svg v-if="!isLoading" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span v-else class="mini-loader light"></span>
      </button>
    </div>

    <div v-if="voiceError" class="voice-toast">{{ voiceError }}</div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500&display=swap');

.chat-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: 'Noto Sans SC', sans-serif;
  background: #fdfcfa;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: #fff;
  border-bottom: 1px solid #f0ebe4;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bot-avatar {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e57364, #d4574a);
  border-radius: 10px;
  color: #fff;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-weight: 500;
  font-size: 14px;
  color: #2d2d2d;
}

.status {
  font-size: 11px;
  color: #2d9587;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.history-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #bbb;
  cursor: pointer;
  transition: all 0.2s;
}

.history-btn:hover {
  background: #f5f0ea;
  color: #e57364;
}

.history-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.new-chat-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #bbb;
  cursor: pointer;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: #f5f0ea;
  color: #e57364;
}

.new-chat-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #bbb;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #f5f0ea;
  color: #e57364;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: linear-gradient(180deg, #fdfcfa 0%, #faf7f2 100%);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.empty-illustration {
  color: #ddd5ca;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: #666;
}

.empty-hint {
  font-size: 12px;
  color: #aaa;
}

.message-row {
  display: flex;
  gap: 8px;
  max-width: 85%;
  animation: slideUp 0.25s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-row.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.message-row.assistant {
  align-self: flex-start;
}

.avatar {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.message-row.user .avatar {
  background: linear-gradient(135deg, #2d9587, #248f7a);
  color: #fff;
}

.message-row.assistant .avatar {
  background: linear-gradient(135deg, #e57364, #d4574a);
  color: #fff;
}

.bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-row.user .bubble {
  background: linear-gradient(135deg, #2d9587, #248f7a);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message-row.assistant .bubble {
  background: #fff;
  color: #3d3d3d;
  border: 1px solid #f0ebe4;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #e57364;
  margin-left: 2px;
  animation: blink 0.7s infinite;
  vertical-align: middle;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.dot-loader {
  display: flex;
  gap: 5px;
}

.dot-loader span {
  width: 7px;
  height: 7px;
  background: #e57364;
  border-radius: 50%;
  animation: bounce 1.2s infinite;
}

.dot-loader span:nth-child(2) { animation-delay: 0.15s; }
.dot-loader span:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

.error-msg {
  padding: 10px 14px;
  background: rgba(229, 115, 100, 0.1);
  border: 1px solid rgba(229, 115, 100, 0.2);
  border-radius: 10px;
  color: #d4574a;
  font-size: 12px;
  text-align: center;
}

.input-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  background: #fff;
  border-top: 1px solid #f0ebe4;
}

.mic-btn {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f5f0;
  border: 1px solid #e8e3db;
  border-radius: 10px;
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}

.mic-btn:hover:not(:disabled) {
  background: #f0ebe4;
  color: #666;
}

.mic-btn.recording {
  background: linear-gradient(135deg, #e57364, #d4574a);
  border-color: transparent;
  color: #fff;
}

.rec-indicator {
  width: 10px;
  height: 10px;
  background: #fff;
  border-radius: 50%;
  animation: pulse 0.9s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.7; }
}

.mini-loader {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0,0,0,0.1);
  border-top-color: #888;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.mini-loader.light {
  border-color: rgba(255,255,255,0.3);
  border-top-color: #fff;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.text-input-wrap {
  flex: 1;
}

.text-input-wrap textarea {
  width: 100%;
  background: #f8f5f0;
  border: 1px solid #e8e3db;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-family: inherit;
  color: #333;
  resize: none;
  transition: all 0.2s;
}

.text-input-wrap textarea::placeholder {
  color: #bbb;
}

.text-input-wrap textarea:focus {
  outline: none;
  border-color: #2d9587;
  background: #fff;
}

.text-input-wrap textarea:disabled {
  opacity: 0.5;
}

.send-btn {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e57364, #d4574a);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(229, 115, 100, 0.25);
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.04);
  box-shadow: 0 3px 10px rgba(229, 115, 100, 0.35);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.voice-toast {
  position: absolute;
  bottom: 70px;
  left: 16px;
  right: 16px;
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 10px;
  color: #b45309;
  font-size: 12px;
  text-align: center;
}

.thinking-indicator {
  display: flex;
  gap: 8px;
  align-self: flex-start;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.thinking-avatar {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #e57364, #d4574a);
  color: #fff;
}

.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(229, 115, 100, 0.08), rgba(212, 87, 74, 0.05));
  border: 1px solid rgba(229, 115, 100, 0.15);
  border-radius: 14px;
  border-bottom-left-radius: 4px;
}

.thinking-text {
  font-size: 13px;
  color: #e57364;
  font-weight: 500;
}

.thinking-dots {
  display: flex;
  gap: 3px;
}

.thinking-dots span {
  width: 5px;
  height: 5px;
  background: #e57364;
  border-radius: 50%;
  animation: thinkBounce 1.4s infinite ease-in-out both;
}

.thinking-dots span:nth-child(1) { animation-delay: 0s; }
.thinking-dots span:nth-child(2) { animation-delay: 0.16s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.32s; }

@keyframes thinkBounce {
  0%, 80%, 100% { 
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% { 
    transform: scale(1);
    opacity: 1;
  }
}

.markdown-content {
  line-height: 1.6;
}

.markdown-content :deep(p) {
  margin: 0 0 8px;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(code) {
  background: rgba(229, 115, 100, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Fira Code', 'Monaco', monospace;
  color: #d4574a;
}

.markdown-content :deep(pre) {
  background: #1e1e2e;
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
  color: #cdd6f4;
  font-size: 12px;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.markdown-content :deep(li) {
  margin: 4px 0;
}

.markdown-content :deep(blockquote) {
  margin: 8px 0;
  padding: 8px 12px;
  border-left: 3px solid #e57364;
  background: rgba(229, 115, 100, 0.05);
  border-radius: 0 6px 6px 0;
}

.markdown-content :deep(a) {
  color: #2d9587;
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(strong) {
  font-weight: 600;
  color: #2d2d2d;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 12px 0 8px;
  font-weight: 600;
  color: #2d2d2d;
}

.markdown-content :deep(h1) { font-size: 18px; }
.markdown-content :deep(h2) { font-size: 16px; }
.markdown-content :deep(h3) { font-size: 14px; }

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid #f0ebe4;
  margin: 12px 0;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #f0ebe4;
  padding: 6px 10px;
  text-align: left;
}

.markdown-content :deep(th) {
  background: #faf7f2;
  font-weight: 500;
}

.history-panel {
  position: absolute;
  top: 60px;
  left: 12px;
  right: 12px;
  max-height: 400px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f0ebe4;
}

.history-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.history-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
}

.history-close:hover {
  background: #f5f0ea;
  color: #666;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-loading,
.history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #999;
  font-size: 13px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background: #f8f5f0;
}

.history-item.active {
  background: linear-gradient(135deg, rgba(229, 115, 100, 0.1), rgba(212, 87, 74, 0.05));
}

.history-item-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f0ea;
  border-radius: 6px;
  color: #888;
}

.history-item.active .history-item-icon {
  background: linear-gradient(135deg, #e57364, #d4574a);
  color: #fff;
}

.history-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-item-name {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-time {
  font-size: 11px;
  color: #aaa;
}

.history-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.2);
  z-index: 99;
}
</style>