import { ref } from 'vue'

export function useVoiceInput() {
  const config = useRuntimeConfig()

  const isRecording = ref(false)
  const isTranscribing = ref(false)
  const error = ref<string | null>(null)

  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let scriptProcessor: ScriptProcessorNode | null = null
  let audioChunks: Float32Array[] = []
  let processCount = 0

  // 获取 token
  const getToken = (): string => {
    return config.public.tempToken as string
  }

  // 开始录音
  const startRecording = async () => {
    error.value = null
    audioChunks = []
    processCount = 0

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      // 使用默认采样率，后面再重采样
      audioContext = new AudioContext()

      // 确保 AudioContext 是 running 状态
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      console.log('AudioContext state:', audioContext.state, 'sampleRate:', audioContext.sampleRate)

      const source = audioContext.createMediaStreamSource(mediaStream)

      // ScriptProcessor 直接连接（不经过 analyser）
      const bufferSize = 4096
      scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1)

      scriptProcessor.onaudioprocess = (e) => {
        processCount++
        if (isRecording.value) {
          const inputData = e.inputBuffer.getChannelData(0)
          // 检查是否有实际音频数据（非静音）
          let hasSound = false
          for (let i = 0; i < inputData.length; i += 100) {
            if (Math.abs(inputData[i]) > 0.001) {
              hasSound = true
              break
            }
          }
          if (processCount <= 3 || processCount % 10 === 0) {
            console.log(`onaudioprocess #${processCount}, hasSound: ${hasSound}, samples: ${inputData.length}`)
          }
          audioChunks.push(new Float32Array(inputData))
        }
      }

      // 简化连接：source → scriptProcessor → destination
      source.connect(scriptProcessor)
      scriptProcessor.connect(audioContext.destination)

      isRecording.value = true
      console.log('Recording started, waiting for onaudioprocess events...')
    } catch (e) {
      error.value = e instanceof Error ? e.message : '无法访问麦克风'
      throw e
    }
  }

  // 停止录音并转录
  const stopRecording = async (): Promise<string> => {
    if (!isRecording.value) {
      throw new Error('没有正在进行的录音')
    }

    const originalSampleRate = audioContext?.sampleRate || 48000
    console.log('Stopping recording, original sampleRate:', originalSampleRate, 'processCount:', processCount)

    isRecording.value = false
    isTranscribing.value = true

    try {
      // 断开 scriptProcessor
      if (scriptProcessor) {
        scriptProcessor.disconnect()
        scriptProcessor = null
      }

      // 停止资源
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop())
        mediaStream = null
      }
      if (audioContext) {
        await audioContext.close()
        audioContext = null
      }

      // 合并音频数据
      const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0)
      console.log('Total samples collected:', totalLength, 'chunks:', audioChunks.length)

      if (totalLength === 0) {
        throw new Error('没有录到音频数据')
      }

      const mergedData = new Float32Array(totalLength)
      let offset = 0
      for (const chunk of audioChunks) {
        mergedData.set(chunk, offset)
        offset += chunk.length
      }

      // 重采样到 16kHz
      const targetSampleRate = 16000
      const resampledData = resample(mergedData, originalSampleRate, targetSampleRate)
      console.log('Resampled to', targetSampleRate, 'samples:', resampledData.length)

      // 转换为 WAV
      const wavBlob = encodeWAV(resampledData, targetSampleRate)
      console.log('WAV blob size:', wavBlob.size)

      // 转录
      const text = await transcribeAudio(wavBlob)
      return text
    } catch (e) {
      error.value = e instanceof Error ? e.message : '转录失败'
      throw e
    } finally {
      isTranscribing.value = false
      audioChunks = []
    }
  }

  // 取消录音
  const cancelRecording = () => {
    if (scriptProcessor) {
      scriptProcessor.disconnect()
      scriptProcessor = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    isRecording.value = false
    audioChunks = []
  }

  // 简单的线性插值重采样
  const resample = (data: Float32Array, fromRate: number, toRate: number): Float32Array => {
    if (fromRate === toRate) return data

    const ratio = fromRate / toRate
    const newLength = Math.round(data.length / ratio)
    const result = new Float32Array(newLength)

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, data.length - 1)
      const t = srcIndex - srcIndexFloor
      result[i] = data[srcIndexFloor] * (1 - t) + data[srcIndexCeil] * t
    }

    return result
  }

  // 编码为 WAV
  const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    // RIFF header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(view, 8, 'WAVE')

    // fmt chunk
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true) // chunk size
    view.setUint16(20, 1, true) // audio format (PCM)
    view.setUint16(22, 1, true) // num channels
    view.setUint32(24, sampleRate, true) // sample rate
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample

    // data chunk
    writeString(view, 36, 'data')
    view.setUint32(40, samples.length * 2, true)

    // PCM data
    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF
      view.setInt16(offset, val, true)
      offset += 2
    }

    return new Blob([buffer], { type: 'audio/wav' })
  }

  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // 调用 Coze ASR API
  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    const token = getToken()

    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.wav')

    console.log('Uploading audio, size:', audioBlob.size)

    const response = await fetch('https://api.coze.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    const result = await response.json()
    console.log('ASR response:', result)

    if (result.code !== 0) {
      throw new Error(result.msg || '转录失败')
    }

    return result.data?.text || ''
  }

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording
  }
}
