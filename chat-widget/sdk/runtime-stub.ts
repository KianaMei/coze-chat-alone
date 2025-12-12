// Stub for Nuxt runtime (#app) in SDK mode
// 替换 Nuxt 的 useRuntimeConfig

export function useRuntimeConfig() {
  throw new Error('[VolcanoSDK] useRuntimeConfig is not available in SDK mode. Use inject to get config.')
}
