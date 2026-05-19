import { registerAs } from '@nestjs/config'

export default registerAs('llm', () => ({
  provider: process.env.LLM_PROVIDER || 'openai',
  apiKey: process.env.LLM_API_KEY || '',
  baseUrl: process.env.LLM_BASE_URL || '',
  model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
}))
