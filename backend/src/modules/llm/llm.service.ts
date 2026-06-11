import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'

export interface ExtractedSkill {
  name: string
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  confidence: number
  sourceText: string
}

export interface LlmCallDetail {
  model: string
  systemPrompt: string
  userMessage: string
  rawResponse: string
  parsedResult: Record<string, unknown>
  success: boolean
  errorMessage?: string
  tokensUsed?: number
  latencyMs: number
}

@Injectable()
export class LlmService {

  // 复杂任务用 v4-pro，简单任务用 v4-flash
  private readonly flashModel = 'deepseek-v4-flash'
  private readonly proModel = process.env.LLM_MODEL || 'deepseek-v4-pro'

  // In-memory LLM response cache: keyed by text hash + method + model
  private readonly _cache = new Map<string, { value: string; expires: number }>()
  private readonly CACHE_TTL = 30 * 60 * 1000 // 30 minutes
  private readonly CACHE_MAX = 100

  private cacheKey(method: string, text: string, model: string): string {
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16)
    return `${method}:${model}:${hash}`
  }

  private cacheGet(key: string): string | null {
    const entry = this._cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expires) { this._cache.delete(key); return null }
    return entry.value
  }

  private cacheSet(key: string, value: string): void {
    if (this._cache.size >= this.CACHE_MAX) {
      const oldest = this._cache.keys().next().value
      if (oldest) this._cache.delete(oldest)
    }
    this._cache.set(key, { value, expires: Date.now() + this.CACHE_TTL })
  }

  /**
   * 技能提取 — 简单任务，用 flash 模型
   */
  async extractSkills(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个技能提取专家。从给定的文本中提取所有技能标签，并评估熟练度。
返回纯JSON数组，格式：[{"name":"技能名","proficiency":"熟练度"}]
proficiency必须是以下之一：beginner, intermediate, advanced, expert
如果没有提取到技能，返回空数组 []`

    const userMessage = `请从以下文本中提取技能：\n\n${text.slice(0, 8000)}`

    const startTime = Date.now()
    let rawResponse: string

    if (onChunk) {
      rawResponse = ''
      for await (const chunk of this.callLLMStream(systemPrompt, userMessage, this.flashModel)) {
        if (!chunk.done) onChunk(chunk.token)
        rawResponse = chunk.fullText
      }
    } else {
      const ck = this.cacheKey('extractSkills', userMessage, this.flashModel)
      const cached = this.cacheGet(ck)
      if (cached) {
        rawResponse = cached
      } else {
        rawResponse = await this.callLLM(systemPrompt, userMessage, this.flashModel)
        this.cacheSet(ck, rawResponse)
      }
    }

    const latencyMs = Date.now() - startTime

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error(`LLM 返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`)
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string
      proficiency: string
    }>

    const skills: ExtractedSkill[] = parsed.map((s) => ({
      name: s.name,
      proficiency: this.validateProficiency(s.proficiency),
      confidence: 0.95,
      sourceText: '',
    }))

    return {
      skills,
      detail: {
        model: this.flashModel,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: { skills },
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    }
  }

  async parseDocument(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个文档解析专家。从给定的简历或职位描述中提取结构化信息。
返回纯JSON对象，包含以下字段：
- name: 姓名
- email: 邮箱
- phone: 手机号码
- city: 所在城市
- title: 当前职位/标题
- summary: 个人简介或职位概述(一段话)
- education: 教育背景(数组,每项含school/major/degree/year)
- experience: 工作经历(数组,每项含company/title/duration/description)
如果没有提取到信息，对应字段为null`

    const userMessage = `请解析以下文档：\n\n${text.slice(0, 8000)}`

    const startTime = Date.now()
    let rawResponse: string

    if (onChunk) {
      rawResponse = ''
      for await (const chunk of this.callLLMStream(systemPrompt, userMessage, this.flashModel)) {
        if (!chunk.done) onChunk(chunk.token)
        rawResponse = chunk.fullText
      }
    } else {
      const ck = this.cacheKey('parseDocument', userMessage, this.flashModel)
      const cached = this.cacheGet(ck)
      if (cached) {
        rawResponse = cached
      } else {
        rawResponse = await this.callLLM(systemPrompt, userMessage, this.flashModel)
        this.cacheSet(ck, rawResponse)
      }
    }

    const latencyMs = Date.now() - startTime

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`LLM 文档解析返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`)
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      parsed,
      detail: {
        model: this.flashModel,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: parsed,
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    }
  }

  /**
   * 岗位描述解析 — 企业端专用，提取字段与简历完全不同
   */
  async parseJobDescription(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个招聘岗位分析专家。从给定的岗位描述(JD)中提取结构化信息。
返回纯JSON对象，包含以下字段：
- companyName: 公司名称
- companyIndustry: 所属行业
- companySize: 公司规模(如"50-200人"、"1000人以上")
- jobTitle: 岗位名称
- department: 所属部门
- location: 工作地点(城市/区域)
- salaryRange: 薪资范围(如"15k-25k"、"面议")
- jobType: 工作类型(全职/兼职/实习/外包)
- experienceRequired: 经验要求(如"1-3年"、"5年以上")
- educationRequired: 学历要求(如"本科"、"硕士及以上")
- responsibilities: 岗位职责(字符串数组，每项一句话)
- requirements: 任职要求(字符串数组，每项一句话)
- benefits: 福利待遇(字符串数组)
- summary: 岗位概述(一段话)
如果没有提取到信息，对应字段为null`

    const userMessage = `请解析以下岗位描述：\n\n${text.slice(0, 8000)}`

    const startTime = Date.now()
    let rawResponse: string

    if (onChunk) {
      rawResponse = ''
      for await (const chunk of this.callLLMStream(systemPrompt, userMessage, this.flashModel)) {
        if (!chunk.done) onChunk(chunk.token)
        rawResponse = chunk.fullText
      }
    } else {
      const ck = this.cacheKey('parseJobDescription', userMessage, this.flashModel)
      const cached = this.cacheGet(ck)
      if (cached) {
        rawResponse = cached
      } else {
        rawResponse = await this.callLLM(systemPrompt, userMessage, this.flashModel)
        this.cacheSet(ck, rawResponse)
      }
    }

    const latencyMs = Date.now() - startTime

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`LLM 岗位解析返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`)
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      parsed,
      detail: {
        model: this.flashModel,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: parsed,
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    }
  }

  /**
   * 岗位技能提取 — 企业端专用，提取任职要求中的技能及期望熟练度
   */
  async extractJobSkills(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个招聘需求分析专家。从岗位描述中提取所有要求/期望的技能，并评估该岗位对每项技能的熟练度要求。
返回纯JSON数组，格式：[{"name":"技能名","proficiency":"熟练度"}]
proficiency必须是以下之一：beginner, intermediate, advanced, expert
注意：请区分"必备技能"和"加分技能"——必备技能通常对应advanced/expert，加分技能通常对应beginner/intermediate。
如果岗位描述中没有明确的技能要求，返回空数组 []`

    const userMessage = `请从以下岗位描述中提取技能要求：\n\n${text.slice(0, 8000)}`

    const startTime = Date.now()
    let rawResponse: string

    if (onChunk) {
      rawResponse = ''
      for await (const chunk of this.callLLMStream(systemPrompt, userMessage, this.flashModel)) {
        if (!chunk.done) onChunk(chunk.token)
        rawResponse = chunk.fullText
      }
    } else {
      const ck = this.cacheKey('extractJobSkills', userMessage, this.flashModel)
      const cached = this.cacheGet(ck)
      if (cached) {
        rawResponse = cached
      } else {
        rawResponse = await this.callLLM(systemPrompt, userMessage, this.flashModel)
        this.cacheSet(ck, rawResponse)
      }
    }

    const latencyMs = Date.now() - startTime

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error(`LLM 岗位技能提取返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`)
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string
      proficiency: string
    }>

    const skills: ExtractedSkill[] = parsed.map((s) => ({
      name: s.name,
      proficiency: this.validateProficiency(s.proficiency),
      confidence: 0.95,
      sourceText: '',
    }))

    return {
      skills,
      detail: {
        model: this.flashModel,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: { skills },
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    }
  }

  /**
   * 流式 LLM 调用 — 逐个 token 返回，同时累积完整响应
   */
  async *callLLMStream(
    systemPrompt: string,
    userMessage: string,
    model: string,
  ): AsyncGenerator<{ token: string; done: boolean; fullText: string }> {
    const apiKey = process.env.LLM_API_KEY
    if (!apiKey) throw new Error('LLM_API_KEY 未配置')

    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com'

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    let fullText = ''

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 16000,
          stream: true,
          thinking: { type: 'disabled' },
        }),
      })
      clearTimeout(timeout)

      if (!response.ok) {
        const errBody = await response.text()
        let errMsg = `LLM API 错误 ${response.status}`
        try {
          const errJson = JSON.parse(errBody)
          errMsg += `: ${errJson.error?.message || errBody}`
        } catch {
          errMsg += `: ${errBody.slice(0, 200)}`
        }
        throw new Error(errMsg)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('流式响应 body 为空')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const json = trimmed.slice(5).trim()
          if (json === '[DONE]') continue

          try {
            const parsed = JSON.parse(json)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              fullText += delta
              yield { token: delta, done: false, fullText }
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      yield { token: '', done: true, fullText }
    } finally {
      clearTimeout(timeout)
    }
  }

  async callLLMForJson(
    systemPrompt: string,
    userMessage: string,
    model?: string,
  ): Promise<Record<string, unknown>> {
    const raw = await this.callLLM(systemPrompt, userMessage, model || this.flashModel)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`LLM JSON 解析失败，原始响应: ${raw.slice(0, 300)}`)
    }
    return JSON.parse(jsonMatch[0])
  }

  /**
   * Streaming version: emits tokens via onChunk, then returns parsed JSON array.
   */
  async callLLMForJsonArrayStream(
    systemPrompt: string,
    userMessage: string,
    onChunk?: (token: string) => void,
    model?: string,
  ): Promise<Record<string, unknown>[]> {
    const startTime = Date.now()
    let rawResponse = ''

    if (onChunk) {
      for await (const chunk of this.callLLMStream(systemPrompt, userMessage, model || this.flashModel)) {
        if (!chunk.done) onChunk(chunk.token)
        rawResponse = chunk.fullText
      }
    } else {
      rawResponse = await this.callLLM(systemPrompt, userMessage, model || this.flashModel)
    }

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error(`LLM JSON 数组解析失败，原始响应: ${rawResponse.slice(0, 300)}`)
    }
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>[]
  }

  /**
   * 核心 LLM 调用 — 关闭思考模式（非流式）
   */
  private async callLLM(
    systemPrompt: string,
    userMessage: string,
    model: string,
  ): Promise<string> {
    const apiKey = process.env.LLM_API_KEY
    if (!apiKey) {
      throw new Error('LLM_API_KEY 未配置，请在 .env 中设置 API Key')
    }

    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com'

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 16000,
          thinking: { type: 'disabled' },
        }),
      })
      clearTimeout(timeout)

      if (!response.ok) {
        const errBody = await response.text()
        let errMsg = `LLM API 错误 ${response.status}`
        try {
          const errJson = JSON.parse(errBody)
          errMsg += `: ${errJson.error?.message || errBody}`
        } catch {
          errMsg += `: ${errBody.slice(0, 200)}`
        }
        throw new Error(errMsg)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        usage?: { total_tokens: number }
      }

      const content = data.choices[0]?.message?.content || ''
      if (!content.trim()) {
        throw new Error(`LLM 返回空内容 (model=${model}, thinking=disabled)`)
      }

      return content
    } finally {
      clearTimeout(timeout)
    }
  }

  private validateProficiency(p: string): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const valid = ['beginner', 'intermediate', 'advanced', 'expert']
    const lower = p?.toLowerCase()
    const map: Record<string, string> = {
      '初级': 'beginner', '入门': 'beginner', '了解': 'beginner',
      '中级': 'intermediate', '熟悉': 'intermediate',
      '高级': 'advanced', '熟练': 'advanced', '掌握': 'advanced',
      '专家': 'expert', '精通': 'expert', '擅长': 'expert',
    }
    const mapped = map[lower] || lower
    return valid.includes(mapped)
      ? (mapped as 'beginner' | 'intermediate' | 'advanced' | 'expert')
      : 'intermediate'
  }
}
