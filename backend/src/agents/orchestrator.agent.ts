import { Injectable } from '@nestjs/common'
import { DocumentParserAgent } from './document-parser.agent'
import { SkillExtractorAgent } from './skill-extractor.agent'
import { SkillMatcherService } from '../modules/skill/skill-matcher.service'
import { SkillResolutionService } from '../modules/skill/skill-resolution.service'
import { SkillService } from '../modules/skill/skill.service'
import { CommunityDetectionService } from '../modules/graph/community-detection.service'
import { SkillSimilarityService } from '../modules/skill/skill-similarity.service'
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
export type ChunkCallback = (agent: string, token: string) => void

@Injectable()
export class OrchestratorAgent {
  constructor(
    private docParser: DocumentParserAgent,
    private skillExtractor: SkillExtractorAgent,
    private skillMatcher: SkillMatcherService,
    private skillResolution: SkillResolutionService,
    private skillService: SkillService,
    private communityDetection: CommunityDetectionService,
    private skillSimilarity: SkillSimilarityService,
  ) {}

  async runParsePipeline(document: {
    id: string; userId: string; docType: string; filePath: string; fileFormat: string
  }): Promise<AgentResult> {
    return this.runParsePipelineStream(document, undefined)
  }

  async runParsePipelineStream(
    document: {
      id: string; userId: string; docType: string; filePath: string; fileFormat: string
    },
    onProgress?: ProgressCallback,
    onChunk?: ChunkCallback,
  ): Promise<AgentResult> {
    const sessionId = `parse-${document.id}`
    const collectedSteps: PipelineStep[] = []
    const emit = (step: PipelineStep) => {
      collectedSteps.push(step)
      onProgress?.(step)
    }

    // Step 0: Extract raw text (prerequisite for both agents)
    emit({ agent: 'text_extractor', status: 'running', summary: '正在读取文档文本...', timestamp: Date.now() })

    let parsedText: string
    try {
      parsedText = await this.docParser.extractText(document.filePath, document.fileFormat)
    } catch (err) {
      emit({ agent: 'text_extractor', status: 'error', summary: '文档读取失败', error: (err as Error).message, timestamp: Date.now() })
      return { success: false, data: {}, summary: '文档读取失败', error: (err as Error).message }
    }

    if (!parsedText || parsedText.trim().length === 0) {
      emit({ agent: 'text_extractor', status: 'error', summary: '文档内容为空', error: '文件解析后无文本内容', timestamp: Date.now() })
      return { success: false, data: {}, summary: '文档内容为空', error: '文件解析后无文本内容' }
    }

    emit({
      agent: 'text_extractor', status: 'done',
      summary: `文本提取完成: ${parsedText.length} 字符`,
      data: { textLength: parsedText.length, textPreview: parsedText },
      timestamp: Date.now(),
    })

    // Step 1: Run DocumentParser and SkillExtractor in parallel
    emit({ agent: 'document_parser', status: 'running', summary: '正在结构化解析文档...', timestamp: Date.now() })
    emit({ agent: 'skill_extractor', status: 'running', summary: '正在提取技能标签...', timestamp: Date.now() })

    const [parseSettled, extractSettled] = await Promise.allSettled([
      this.docParser.execute({
        sessionId, userId: document.userId,
        input: { rawText: parsedText, docType: document.docType },
        onChunk: onChunk ? (t: string) => onChunk('document_parser', t) : undefined,
      }),
      this.skillExtractor.execute({
        sessionId, userId: document.userId,
        input: { parsedText, docType: document.docType },
        onChunk: onChunk ? (t: string) => onChunk('skill_extractor', t) : undefined,
      }),
    ])

    // Process DocumentParser result
    let parseResult: AgentResult
    if (parseSettled.status === 'fulfilled') {
      parseResult = parseSettled.value
      const parsedJson = parseResult.data['parsedJson'] as Record<string, unknown> | null
      const llmParseDetail = parseResult.data['llmParseDetail']

      if (parseResult.success) {
        emit({
          agent: 'document_parser', status: 'done',
          summary: `文档结构化解析完成`,
          data: {
            structured: parsedJson,
            ...(llmParseDetail ? {
              model: (llmParseDetail as any).model,
              latencyMs: (llmParseDetail as any).latencyMs,
              rawResponse: (llmParseDetail as any).rawResponse,
            } : {}),
          },
          timestamp: Date.now(),
        })
      } else {
        emit({ agent: 'document_parser', status: 'error', summary: '文档解析失败', error: parseResult.error, timestamp: Date.now() })
      }
    } else {
      parseResult = { success: false, data: {}, summary: '文档解析异常', error: parseSettled.reason?.message || String(parseSettled.reason) }
      emit({ agent: 'document_parser', status: 'error', summary: '文档解析异常', error: parseResult.error, timestamp: Date.now() })
    }

    // Process SkillExtractor result
    let extractedSkills: Array<{ name: string; proficiency: string }> = []
    let skillLlmDetail = null

    if (extractSettled.status === 'fulfilled') {
      const extractResult = extractSettled.value
      if (extractResult.success) {
        extractedSkills = (extractResult.data['skills'] as any[]) || []
        skillLlmDetail = extractResult.data['llmDetail']
        emit({
          agent: 'skill_extractor', status: 'done',
          summary: `提取 ${extractedSkills.length} 个技能标签`,
          data: {
            skillCount: extractedSkills.length,
            skills: extractedSkills.map((s: any) => ({ name: s.name, proficiency: s.proficiency })),
            ...(skillLlmDetail ? {
              model: (skillLlmDetail as any).model,
              latencyMs: (skillLlmDetail as any).latencyMs,
              rawResponse: (skillLlmDetail as any).rawResponse,
            } : {}),
          },
          timestamp: Date.now(),
        })
      } else {
        emit({ agent: 'skill_extractor', status: 'error', summary: '技能提取失败', error: extractResult.error, timestamp: Date.now() })
      }
    } else {
      emit({ agent: 'skill_extractor', status: 'error', summary: '技能提取异常', error: extractSettled.reason?.message || String(extractSettled.reason), timestamp: Date.now() })
    }

    // Step 2: Map extracted names to canonical skill IDs via string matching
    const mappedSkills: { skillId: number; proficiency: string; name: string }[] = []
    const seenSkillIds = new Set<number>()
    const matchedNames = new Set<string>()
    const matchingLogs: Array<{ extracted: string; canonical: string | null; confidence: number; method: string }> = []

    for (const s of extractedSkills) {
      const { result: match, log } = await this.skillMatcher.match(s.name)
      matchingLogs.push(log)

      if (match) {
        matchedNames.add(s.name)
        if (seenSkillIds.has(match.id)) continue
        seenSkillIds.add(match.id)
        mappedSkills.push({ skillId: match.id, proficiency: s.proficiency, name: match.name })
      }
    }

    const unmatchedSkills = extractedSkills
      .filter((s) => !matchedNames.has(s.name))
      .map((s) => ({ name: s.name, proficiency: s.proficiency }))

    // Step 3: LLM resolution of unmatched skills (supports any industry)
    if (unmatchedSkills.length > 0) {
      emit({
        agent: 'skill_resolver', status: 'running',
        summary: `正在智能解析 ${unmatchedSkills.length} 个未匹配技能...`,
        timestamp: Date.now(),
      })

      try {
        const resolved = await this.skillResolution.resolveBatch(
          unmatchedSkills.map((s) => s.name),
          onChunk ? (t: string) => onChunk('skill_resolver', t) : undefined,
        )

        const stillUnmatched: typeof unmatchedSkills = []
        const resolvedDetails: Array<{ extracted: string; canonical: string; method: 'matched' | 'created' | 'failed' }> = []

        for (const us of unmatchedSkills) {
          const result = resolved.get(us.name)
          if (result?.matched) {
            // Matched to existing canonical skill
            if (!seenSkillIds.has(result.matched.id)) {
              seenSkillIds.add(result.matched.id)
              mappedSkills.push({ skillId: result.matched.id, proficiency: us.proficiency, name: result.matched.name })
            }
            resolvedDetails.push({ extracted: us.name, canonical: result.matched.name, method: 'matched' })
          } else if (result?.newSkill) {
            // LLM couldn't match → auto-create new skill
            try {
              const newSkill = await this.skillService.createDynamicSkill(
                result.newSkill.canonicalName,
                result.newSkill.category,
              )
              seenSkillIds.add(newSkill.id)
              mappedSkills.push({ skillId: newSkill.id, proficiency: us.proficiency, name: newSkill.name })
              resolvedDetails.push({ extracted: us.name, canonical: newSkill.name, method: 'created' })
            } catch (err) {
              console.error(`[Orchestrator] Failed to create dynamic skill "${result.newSkill.canonicalName}":`, (err as Error).message)
              stillUnmatched.push(us)
              resolvedDetails.push({ extracted: us.name, canonical: '', method: 'failed' })
            }
          } else {
            stillUnmatched.push(us)
            resolvedDetails.push({ extracted: us.name, canonical: '', method: 'failed' })
          }
        }

        emit({
          agent: 'skill_resolver', status: 'done',
          summary: `LLM 解析完成: ${unmatchedSkills.length - stillUnmatched.length}/${unmatchedSkills.length} 个技能已解析`,
          data: {
            totalExtracted: unmatchedSkills.length,
            matched: unmatchedSkills.length - stillUnmatched.length,
            details: resolvedDetails,
          },
          timestamp: Date.now(),
        })

        // Update unmatched list
        unmatchedSkills.length = 0
        unmatchedSkills.push(...stillUnmatched)
      } catch (err) {
        emit({
          agent: 'skill_resolver', status: 'error',
          summary: 'LLM 技能解析失败',
          error: (err as Error).message,
          timestamp: Date.now(),
        })
      }
    }

    // Step 4: Community detection (Leiden)
    emit({
      agent: 'community_detection', status: 'running',
      summary: '正在运行 Leiden 社区发现...',
      timestamp: Date.now(),
    })

    try {
      const communities = await this.communityDetection.detectWithProgress(
        (progress) => {
          emit({
            agent: 'community_detection', status: 'running',
            summary: progress.description,
            timestamp: Date.now(),
          })
        },
      )
      this.skillSimilarity.updateCommunities(communities)
      const communityCount = new Set(communities.values()).size

      // Build skillId → name lookup from mappedSkills
      const skillNameMap = new Map<number, string>()
      for (const ms of mappedSkills) skillNameMap.set(ms.skillId, ms.name)

      // Group skills by community
      const groups = new Map<number, string[]>()
      for (const [skillId, commId] of communities) {
        const name = skillNameMap.get(skillId)
        if (!name) continue  // skip skills not in current document
        if (!groups.has(commId)) groups.set(commId, [])
        groups.get(commId)!.push(name)
      }
      const communityGroups = [...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([, members]) => members)

      emit({
        agent: 'community_detection', status: 'done',
        summary: `社区发现完成: ${communityCount} 个社区，${communities.size} 个技能`,
        data: { communityCount, totalNodes: communities.size, groups: communityGroups },
        timestamp: Date.now(),
      })
    } catch (err) {
      emit({
        agent: 'community_detection', status: 'error',
        summary: '社区发现失败（不影响匹配功能）',
        error: (err as Error).message,
        timestamp: Date.now(),
      })
    }

    return {
      success: parseResult.success || extractedSkills.length > 0,
      data: {
        parsedText,
        parsedJson: parseResult.data['parsedJson'] || {},
        llmParseDetail: parseResult.data['llmParseDetail'],
        extractedSkills,
        skillLlmDetail,
        mappedSkills,
        unmatchedSkills,
        matchingLogs,
        pipelineSteps: collectedSteps,
      },
      summary: [
        parseResult.summary,
        `技能提取: ${extractedSkills.length} 个 (匹配 ${mappedSkills.length} 个)`,
      ].join(' | '),
    }
  }
}
