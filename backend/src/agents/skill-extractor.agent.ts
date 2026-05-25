import { Injectable } from '@nestjs/common'
import type { IAgent, AgentContext, AgentResult, AgentDefinition } from './agent.interface'
import { LlmService } from '../modules/llm/llm.service'

@Injectable()
export class SkillExtractorAgent implements IAgent {
  constructor(private llmService: LlmService) {}

  readonly definition: AgentDefinition = {
    agentType: 'skill_extractor',
    description: '调用大模型从文档文本中提取技能标签',
    whenToUse: '文档解析完成后',
    tools: ['llmExtract'],
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { parsedText } = context.input as { parsedText: string }

    if (!parsedText || parsedText.trim().length === 0) {
      return {
        success: false,
        data: {},
        summary: '无文本可分析',
        error: '文档解析后文本为空',
      }
    }

    const result = await this.llmService.extractSkills(parsedText, context.onChunk)

    return {
      success: true,
      data: {
        skills: result.skills,
        llmDetail: result.detail,
        count: result.skills.length,
      },
      summary: `大模型提取到 ${result.skills.length} 个技能标签 (模型: ${result.detail.model}, 耗时: ${result.detail.latencyMs}ms)`,
    }
  }
}
