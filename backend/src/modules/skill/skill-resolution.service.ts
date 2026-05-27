import { Injectable } from '@nestjs/common'
import { SkillMatcherService } from './skill-matcher.service'
import { LlmService } from '../llm/llm.service'

export interface ResolvedSkill {
  id: number
  name: string
}

interface CacheEntry {
  results: Map<string, ResolvedSkill | null>
  timestamp: number
}

const CACHE_TTL_MS = 30 * 60 * 1000

@Injectable()
export class SkillResolutionService {
  private cache = new Map<string, CacheEntry>()

  constructor(
    private skillMatcher: SkillMatcherService,
    private llmService: LlmService,
  ) {}

  /**
   * Resolve a single skill name via batch call (for backward compat).
   */
  async resolve(name: string, onChunk?: (token: string) => void): Promise<ResolvedSkill | null> {
    const results = await this.resolveBatch([name], onChunk)
    return results.get(name) || null
  }

  /**
   * Batch-resolve extracted skill names to canonical skills via LLM.
   * All names are sent in a single LLM call for efficiency.
   * Tokens are streamed via onChunk for real-time display.
   */
  async resolveBatch(
    names: string[],
    onChunk?: (token: string) => void,
  ): Promise<Map<string, ResolvedSkill | null>> {
    if (names.length === 0) return new Map()

    // Normalize and deduplicate
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    if (unique.length === 0) return new Map()

    // Check cache
    const cacheKey = unique.sort().join('||')
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.results
    }

    // Build the canonical skill list
    const skillList = this.skillMatcher.getAllSkills()
    if (skillList.length === 0) return new Map()

    const skillListText = skillList
      .map((s) => `${s.id}. ${s.name}${s.category ? ` (${s.category})` : ''}`)
      .join('\n')

    const extractedText = unique.map((n, i) => `${i + 1}. ${n}`).join('\n')

    const systemPrompt = `你是一个技能标签匹配专家。给定一组从文档中提取的技能名称和标准技能列表，将每个提取的技能映射到最匹配的标准技能。

规则：
1. 如果技能描述的是同一个技术能力（即使表述不同），匹配到对应的标准技能。例如"agent工作流设计"→"Agent"，"智能体编排"→"Agent"
2. 如果技能是某个标准技能的子领域/具体实现，匹配到那个标准技能。例如"YOLO目标检测"→"目标检测"
3. 对中文和英文的技能名都要正确识别。例如"百度飞桨"→"PaddlePaddle"，"k8s"→"Kubernetes"
4. 如果提取的技能与所有标准技能都不相关，matchedId和matchedName设为null
5. 确保每个提取的技能都有对应的一条结果

返回纯JSON数组（不要markdown包裹）：
[{"extractedName":"提取的技能名","matchedId":数字或null,"matchedName":"标准技能名或null"}, ...]`

    const userMessage = `标准技能列表:
${skillListText}

提取的技能:
${extractedText}

请返回匹配结果JSON数组。`

    try {
      const responseArray = await this.llmService.callLLMForJsonArrayStream(
        systemPrompt,
        userMessage,
        onChunk,
      )

      const results = new Map<string, ResolvedSkill | null>()
      for (const item of responseArray) {
        const extractedName = item['extractedName'] as string
        const matchedId = item['matchedId'] as number | null
        const matchedName = item['matchedName'] as string | null

        if (extractedName && matchedId && matchedName && typeof matchedId === 'number') {
          results.set(extractedName, { id: matchedId, name: matchedName })
        } else if (extractedName) {
          results.set(extractedName, null)
        }
      }

      // Ensure all requested names have a result (LLM might miss some)
      for (const name of unique) {
        if (!results.has(name)) {
          results.set(name, null)
        }
      }

      // Cache the results
      this.cache.set(cacheKey, { results, timestamp: Date.now() })

      return results
    } catch (err) {
      console.warn(`[SkillResolution] LLM batch resolution failed: ${(err as Error).message}`)
      // Return all nulls on failure — skills stay unmatched
      const results = new Map<string, ResolvedSkill | null>()
      for (const name of unique) results.set(name, null)
      return results
    }
  }
}
