// src/config/model.js
// Centralized AI model config for switching between local (OmniRoute) and production (NVIDIA NIM)

const isDev = import.meta.env.DEV

// Local OmniRoute defaults
const DEV_BASE_URL = 'http://localhost:20128/v1'
const DEV_MODEL = 'Alucard'
const DEV_API_KEY = 'sk-89d7096638aec30b-b456e4-ddf6ec7c'

// NVIDIA NIM Cloud defaults (for production deployment)
const PROD_BASE_URL = 'https://integrate.api.nvidia.com/v1'
const PROD_MODEL = 'meta/llama-3.2-11b-vision-instruct'
const PROD_API_KEY = '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'

export const modelConfig = {
  default: {
    provider: import.meta.env.VITE_AI_PROVIDER || (isDev ? 'omniroute' : 'nvidia'),
    model: import.meta.env.VITE_MODEL_NAME || (isDev ? DEV_MODEL : PROD_MODEL),
    baseUrl: import.meta.env.VITE_NVIDIA_API_URL || (isDev ? DEV_BASE_URL : PROD_BASE_URL),
    apiKey: import.meta.env.VITE_NVIDIA_API_KEY || (isDev ? DEV_API_KEY : PROD_API_KEY)
  },
  alternatives: {
    localOmniroute: {
      provider: 'omniroute',
      model: DEV_MODEL,
      baseUrl: DEV_BASE_URL,
      apiKey: DEV_API_KEY
    },
    nvidiaLlama: {
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      baseUrl: PROD_BASE_URL,
      apiKey: PROD_API_KEY
    },
    nvidiaNemotron: {
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-nano-30b-a3b',
      baseUrl: PROD_BASE_URL,
      apiKey: PROD_API_KEY
    }
  }
}

export function getModelConfig() {
  // Allow environment variables to dynamically override
  const isLocalUrl = (import.meta.env.VITE_NVIDIA_API_URL || '').includes('localhost') || (import.meta.env.VITE_NVIDIA_API_URL || '').includes('127.0.0.1')
  
  return {
    provider: import.meta.env.VITE_AI_PROVIDER || (isLocalUrl || isDev ? 'omniroute' : 'nvidia'),
    model: import.meta.env.VITE_MODEL_NAME || (isLocalUrl || isDev ? DEV_MODEL : PROD_MODEL),
    baseUrl: import.meta.env.VITE_NVIDIA_API_URL || (isDev ? DEV_BASE_URL : PROD_BASE_URL),
    apiKey: import.meta.env.VITE_NVIDIA_API_KEY || (isDev ? DEV_API_KEY : PROD_API_KEY)
  }
}

export function getModelName() {
  const cfg = getModelConfig()
  if (cfg.model === 'Alucard') return 'Alucard (Local)'
  if (cfg.model.includes('llama')) return 'NVIDIA Llama 3.2'
  if (cfg.model.includes('nemotron')) return 'NVIDIA Nemotron'
  return cfg.model
}

export function setModel(key) {
  if (modelConfig.alternatives[key]) {
    modelConfig.default = { ...modelConfig.default, ...modelConfig.alternatives[key] }
  }
}
