// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  runtimeConfig: {
    public: {
      cozeWorkflowId: process.env.COZE_WORKFLOW_ID || '7582422134879682614',
      cozeAppId: process.env.COZE_APP_ID || '7582218686560911366',
      cozeBotId: process.env.COZE_BOT_ID || '',
      cozeVoiceId: process.env.COZE_VOICE_ID || '',
      tempToken: process.env.TEMP_TOKEN || ''
    }
  },

  ssr: false
})