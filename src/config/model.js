// src/config/model.js
// Centralized AI model config for easy switching
export const modelConfig = {
  default: {
    provider: 'omniroute',
    model: 'acard',
    baseUrl: import.meta.env.VITE_NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1',
    apiKey: import.meta.env.VITE_NVIDIA_API_KEY || ''
  },
  alternatives: {
    nemotron3Super: {
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      baseUrl: 'https://integrate.api.nvidia.com/v1'
    },
    llamaVision: {
      provider: 'nvidia',
      model: 'meta/llama-3.2-90b-vision-instruct',
      baseUrl: 'https://integrate.api.nvidia.com/v1'
    }
  }
}

export function getModelConfig() { return modelConfig.default }
export function getModelName() { return 'Alucard' }

export function setModel(key) {
  if (modelConfig.alternatives[key]) {
    modelConfig.default = { ...modelConfig.default, ...modelConfig.alternatives[key] }
  }
}