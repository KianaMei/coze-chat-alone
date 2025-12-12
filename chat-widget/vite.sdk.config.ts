import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// SDK 打包配置
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'sdk/index.ts'),
      name: 'VolcanoSDK',
      fileName: (format) => `volcano-chat-sdk.${format}.js`,
      formats: ['umd', 'es']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        exports: 'named',
        // 禁用代码分割，全部打包到一个文件
        inlineDynamicImports: true
      }
    },
    outDir: 'dist-sdk',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '~': resolve(__dirname, './'),
      // SDK 构建时，使用 SDK 版本的 composables
      '#app': resolve(__dirname, './sdk/runtime-stub.ts'),
      '#imports': resolve(__dirname, './sdk/imports-stub.ts')
    }
  },
  css: {
    preprocessorOptions: {}
  }
})
