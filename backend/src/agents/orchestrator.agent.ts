import { Injectable } from '@nestjs/common'
import { DocumentParserAgent } from './document-parser.agent'
import { SkillExtractorAgent } from './skill-extractor.agent'
import { GraphBuilderAgent } from './graph-builder.agent'
import type { AgentResult } from './agent.interface'

export interface PipelineStep {
  agent: string
  status: 'pending' | 'running' | 'done' | 'error'
  summary: string
  data?: Record<string, unknown>
  error?: string
  timestamp: number
}

export type ProgressCallback = (step: PipelineStep) => void

@Injectable()
export class OrchestratorAgent {
  constructor(
    private docParser: DocumentParserAgent,
    private skillExtractor: SkillExtractorAgent,
    private graphBuilder: GraphBuilderAgent,
  ) {}

  async runParsePipeline(document: {
    id: string; userId: string; docType: string; filePath: string; fileFormat: string
  }): Promise<AgentResult> {
    return this.runParsePipelineStream(document, undefined)
  }

  /**
   * Full pipeline with streaming progress via callback.
   */
  async runParsePipelineStream(
    document: {
      id: string; userId: string; docType: string; filePath: string; fileFormat: string
    },
    onProgress?: ProgressCallback,
  ): Promise<AgentResult> {
    const sessionId = `parse-${document.id}`
    const emit = (step: PipelineStep) => onProgress?.(step)

    // Step 1: Dcoument Parser Agent
    emit({ agent: 'document_parser', status: 'running', summary: '正在读取并解析文档...', timestamp: Date.now() })
    const parseResult = await this.docParser.execute({
      sessionId, userId: document.userId,
      input: { filePath: document.filePath, fileFormat: document.fileFormat },
    })

    const parsedText = parseResult.data['parsedText'] as string
    const parsedJson = parseResult.data['parsedJson'] as Record<string, unknown> | null
    const llmParseDetail = parseResult.data['llmParseDetail']

    if (parseResult.success && parsedText) {
      emit({
        agent: 'document_parser', status: 'done',
        summary: `文档解析完成: 提取 ${parsedText.length} 字符`,
        data: {
          textLength: parsedText.length,
          textPreview: parsedText.slice(0, 200),
          structured: parsedJson,
          ...(llmParseDetail ? {
            model: (llmParseDetail as any).model,
            latencyMs: (llmParseDetail as any).latencyMs,
            rawResponse: (llmParseDetail as any).rawResponse?.slice(0, 500),
          } : {}),
        },
        timestamp: Date.now(),
      })
    } else {
      emit({ agent: 'document_parser', status: 'error', summary: '文档解析失败', error: parseResult.error, timestamp: Date.now() })
      return { success: false, data: {}, summary: parseResult.summary, error: parseResult.error }
    }

    // Step 2: Skill Extractor Agent
    let extractedSkills: Array<{ name: string; proficiency: string; yearsOfExperience?: number }> = []
    let skillLlmDetail = null

    emit({ agent: 'skill_extractor', status: 'running', summary: '正在调用大模型提取技能标签...', timestamp: Date.now() })

    try {
      const extractResult = await this.skillExtractor.execute({
        sessionId, userId: document.userId,
        input: { parsedText },
      })

      if (extractResult.success) {
        extractedSkills = (extractResult.data['skills'] as any[]) || []
        skillLlmDetail = extractResult.data['llmDetail']
        emit({
          agent: 'skill_extractor', status: 'done',
          summary: `大模型提取 ${extractedSkills.length} 个技能标签`,
          data: {
            skillCount: extractedSkills.length,
            skills: extractedSkills.slice(0, 20).map((s: any) => ({ name: s.name, proficiency: s.proficiency, years: s.yearsOfExperience })),
            ...(skillLlmDetail ? {
              model: (skillLlmDetail as any).model,
              latencyMs: (skillLlmDetail as any).latencyMs,
              rawResponse: (skillLlmDetail as any).rawResponse?.slice(0, 500),
            } : {}),
          },
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      emit({ agent: 'skill_extractor', status: 'error', summary: '技能提取失败', error: (err as Error).message, timestamp: Date.now() })
    }

    // Step 3: Graph Builder Agent
    const mappedSkills = extractedSkills.map((s) => ({
      skillId: this.hashSkillName(s.name),
      proficiency: s.proficiency,
      years: s.yearsOfExperience,
      name: s.name,
    }))

    let graphResult: AgentResult = { success: true, data: {}, summary: '' }
    if (mappedSkills.length > 0) {
      emit({ agent: 'graph_builder', status: 'running', summary: `正在构建知识图谱 (${mappedSkills.length} 个节点)...`, timestamp: Date.now() })

      graphResult = await this.graphBuilder.execute({
        sessionId, userId: document.userId,
        input: { documentId: document.id, docType: document.docType, skills: mappedSkills, userId: document.userId },
      })

      emit({
        agent: 'graph_builder', status: 'done',
        summary: `知识图谱构建完成: ${mappedSkills.length} 个技能关系已写入 Neo4j`,
        data: { nodeCount: mappedSkills.length },
        timestamp: Date.now(),
      })
    } else {
      emit({ agent: 'graph_builder', status: 'done', summary: '无技能数据，跳过图谱构建', timestamp: Date.now() })
    }

    return {
      success: true,
      data: { parsedText, parsedJson: parsedJson || {}, llmParseDetail, extractedSkills, skillLlmDetail, mappedSkills, graphResult },
      summary: [parseResult.summary, `技能提取: ${extractedSkills.length} 个`, graphResult.summary].join(' | '),
    }
  }

  private hashSkillName(name: string): number {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
    return Math.abs(hash) % 314
  }
}
