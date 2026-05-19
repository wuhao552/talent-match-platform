import { Injectable } from '@nestjs/common'

export interface ExtractedSkill {
  name: string
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  yearsOfExperience?: number
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

  /**
   * 技能提取 — 简单任务，用 flash 模型
   */
  async extractSkills(text: string): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个技能提取专家。从给定的文本中提取所有技能标签，并评估熟练度。
返回纯JSON数组，格式：[{"name":"技能名","proficiency":"熟练度","yearsOfExperience":年数}]
proficiency必须是以下之一：beginner, intermediate, advanced, expert
如果没有提取到技能，返回空数组 []`

    const userMessage = `请从以下文本中提取技能：\n\n${text.slice(0, 8000)}`

    const startTime = Date.now()
    const rawResponse = await this.callLLM(systemPrompt, userMessage, this.flashModel)
    const latencyMs = Date.now() - startTime

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error(`LLM 返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`)
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string
      proficiency: string
      yearsOfExperience?: number
    }>

    const skills: ExtractedSkill[] = parsed.map((s) => ({
      name: s.name,
      proficiency: this.validateProficiency(s.proficiency),
      yearsOfExperience: s.yearsOfExperience,
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
   * 文档结构化解析 — 用 flash 模型
   */
  async parseDocument(text: string): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个文档解析专家。从给定的简历或职位描述中提取结构化信息。
返回纯JSON对象，包含以下字段：
- name: 姓名
- email: 邮箱
- phone: 手机号码
- city: 所在城市
- title: 当前职位/标题
- summary: 个人简介或职位概述(一段话)
- skills: 技能列表(字符串数组)
- education: 教育背景(数组,每项含school/major/degree/year)
- experience: 工作经历(数组,每项含company/title/duration/description)
如果没有提取到信息，对应字段为null`

    const userMessage = `请解析以下文档：\n\n${text.slice(0, 8000)}`

    const startTime = Date.now()
    const rawResponse = await this.callLLM(systemPrompt, userMessage, this.flashModel)
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
   * 核心 LLM 调用 — 关闭思考模式
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
          // 关闭思考模式
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
