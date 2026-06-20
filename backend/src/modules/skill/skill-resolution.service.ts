import { Injectable } from '@nestjs/common'
import { SkillMatcherService } from './skill-matcher.service'
import { LlmService } from '../llm/llm.service'

export interface ResolvedSkill {
  id: number
  name: string
}

export interface ResolvedResult {
  /** Matched to existing canonical skill (null if new skill needed) */
  matched: ResolvedSkill | null
  /** If no match: canonical name and category for creating a new skill */
  newSkill?: { canonicalName: string; category: string }
}

interface CacheEntry {
  results: Map<string, ResolvedResult>
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

  async resolve(name: string, onChunk?: (token: string) => void): Promise<ResolvedResult> {
    const results = await this.resolveBatch([name], onChunk)
    return results.get(name) || { matched: null }
  }

  /**
   * Batch-resolve extracted skill names to canonical skills via LLM.
   * When LLM cannot match to an existing skill, it returns canonicalName + category
   * so the caller can auto-create a new skill.
   */
  async resolveBatch(
    names: string[],
    onChunk?: (token: string) => void,
  ): Promise<Map<string, ResolvedResult>> {
    if (names.length === 0) return new Map()

    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    if (unique.length === 0) return new Map()

    // Check cache
    const cacheKey = unique.sort().join('||')
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.results
    }

    const skillList = this.skillMatcher.getAllSkills()
    if (skillList.length === 0) return new Map()

    const skillListText = skillList
      .map((s) => `${s.id}. ${s.name}${s.category ? ` (${s.category})` : ''}`)
      .join('\n')

    const extractedText = unique.map((n, i) => `${i + 1}. ${n}`).join('\n')

    const systemPrompt = `你是一个技能标签匹配专家，服务于通用人才匹配系统（覆盖IT、零售、会计、医疗、金融、制造等各行各业）。

给定一组从文档中提取的技能名称和标准技能列表，将每个提取的技能映射到最匹配的标准技能。

规则：
1. 先尝试匹配到标准技能列表（同义词、中英文翻译、缩写、上下位概念都算匹配）
2. 如果成功匹配：设 matchedId 和 matchedName，canonicalName 设为空字符串，category 设为空字符串
3. 如果确实无法匹配到任何标准技能：设 matchedId 为 null，matchedName 设为 null，但必须提供：
   - canonicalName: 标准化的技能名（简洁明确，如"门店运营管理"、"税务筹划"、"护理评估"）
   - category: 行业/领域分类（如"零售"、"会计/财务"、"医疗"、"金融"、"制造"、"教育"、"法务"、"人力资源"、"设计"、"市场/运营"等）
4. 确保每个提取的技能都有对应的一条结果

返回纯JSON数组（不要markdown包裹）：
[{"extractedName":"提取的技能名","matchedId":数字或null,"matchedName":"标准技能名或null","canonicalName":"","category":""}, ...]`

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

      const results = new Map<string, ResolvedResult>()
      for (const item of responseArray) {
        const extractedName = item['extractedName'] as string
        const matchedId = item['matchedId'] as number | null
        const matchedName = item['matchedName'] as string | null
        const canonicalName = (item['canonicalName'] as string) || ''
        const category = (item['category'] as string) || ''

        if (extractedName && matchedId && matchedName && typeof matchedId === 'number') {
          results.set(extractedName, { matched: { id: matchedId, name: matchedName } })
        } else if (extractedName && canonicalName) {
          results.set(extractedName, {
            matched: null,
            newSkill: { canonicalName, category: category || '其他' },
          })
        } else if (extractedName) {
          results.set(extractedName, { matched: null })
        }
      }

      for (const name of unique) {
        if (!results.has(name)) results.set(name, { matched: null })
      }

      this.cache.set(cacheKey, { results, timestamp: Date.now() })
      return results
    } catch (err) {
      console.warn(`[SkillResolution] LLM batch resolution failed: ${(err as Error).message}`)
      const results = new Map<string, ResolvedResult>()
      for (const name of unique) results.set(name, { matched: null })
      return results
    }
  }
}
