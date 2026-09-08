import { registerAs } from '@nestjs/config';

export default registerAs('llm', () => ({
  provider: process.env.LLM_PROVIDER || 'openai',
  apiKey: process.env.LLM_API_KEY || '',
  baseUrl: process.env.LLM_BASE_URL || '',
  model: process.env.LLM_MODEL || 'deepseek-v4-flash',
  fallbackModel:
    process.env.LLM_FALLBACK_MODEL ||
    process.env.LLM_BACKUP_MODEL ||
    '',
  fallbackApiKey:
    process.env.LLM_FALLBACK_API_KEY ||
    process.env.LLM_BACKUP_API_KEY ||
    '',
  fallbackBaseUrl:
    process.env.LLM_FALLBACK_BASE_URL ||
    process.env.LLM_BACKUP_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  backupModel:
    process.env.LLM_BACKUP_MODEL ||
    process.env.LLM_FALLBACK_MODEL ||
    '',
  backupApiKey:
    process.env.LLM_BACKUP_API_KEY ||
    process.env.LLM_FALLBACK_API_KEY ||
    '',
  backupBaseUrl:
    process.env.LLM_BACKUP_BASE_URL ||
    process.env.LLM_FALLBACK_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
}));
