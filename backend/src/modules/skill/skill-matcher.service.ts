import { Injectable, OnModuleInit } from '@nestjs/common'
import { SkillSeedService } from './skill-seed.service'
import { LlmService } from '../llm/llm.service'

export interface MatchLog {
  extracted: string
  canonical: string | null
  confidence: number
  method: 'exact' | 'contains' | 'edit-distance' | 'llm'
}

interface SkillEntry {
  id: number
  name: string
  lower: string
  core: string  // normalized with common suffixes stripped
}

// Common Chinese tech suffixes that don't change skill identity
const SKILL_SUFFIXES = [
  '系统开发', '开发', '设计', '框架', '技术', '平台', '工具',
  '应用', '编程', '语言', '算法', '模型', '架构', '服务',
  '组件', '引擎', '系统', '方案', '流程', '管理', '分析',
  '测试', '部署', '优化', '配置', '实现', '封装',
]

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-\s\.\/]/g, '')
}

function stripSuffixes(s: string): string {
  let result = s
  // Sort suffixes by length descending so longer matches are tried first
  const sorted = [...SKILL_SUFFIXES].sort((a, b) => b.length - a.length)
  for (const suffix of sorted) {
    if (result.endsWith(suffix) && result.length > suffix.length + 1) {
      result = result.slice(0, -suffix.length)
      break // only strip one suffix
    }
  }
  return result
}

@Injectable()
export class SkillMatcherService implements OnModuleInit {
  private skills: SkillEntry[] = []
  // 2-gram 倒排索引：ngram → skill index[]
  private ngramIndex = new Map<string, number[]>()

  constructor(
    private seedService: SkillSeedService,
    private llmService: LlmService,
  ) {}

  async onModuleInit() {
    const names = this.seedService.getSkillList()
    this.skills = names.map((name, i) => {
      const lower = normalize(name)
      const core = stripSuffixes(lower)
      return { id: i, name, lower, core }
    })
    this.buildNgramIndex()
    if (this.skills.length === 0) {
      console.log(`[SkillMatcher] Starting with empty index (no skill.list). Skills will be added dynamically as documents are parsed.`)
    } else {
      console.log(`[SkillMatcher] Indexed ${this.skills.length} skills (${this.ngramIndex.size} ngrams) for matching`)
    }
  }

  private buildNgramIndex() {
    for (let idx = 0; idx < this.skills.length; idx++) {
      const core = this.skills[idx].core
      for (let i = 0; i < core.length - 1; i++) {
        const ng = core.substring(i, i + 2)
        if (!this.ngramIndex.has(ng)) this.ngramIndex.set(ng, [])
        this.ngramIndex.get(ng)!.push(idx)
      }
    }
  }

  /** Get top-N candidate indices by n-gram overlap count */
  private getNgramCandidates(query: string, limit: number): SkillEntry[] {
    const counts = new Map<number, number>()
    for (let i = 0; i < query.length - 1; i++) {
      const ng = query.substring(i, i + 2)
      const entries = this.ngramIndex.get(ng)
      if (entries) {
        for (const idx of entries) {
          counts.set(idx, (counts.get(idx) || 0) + 1)
        }
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([idx]) => this.skills[idx])
  }

  /**
   * Find the best matching canonical skill ID for an LLM-extracted name.
   * Returns { id, name, confidence } or null if no good match.
   * Also returns a log entry describing the matching method used.
   */
  async match(name: string): Promise<{ result: { id: number; name: string; confidence: number } | null; log: MatchLog }> {
    if (!name || name.trim().length === 0) {
      return { result: null, log: { extracted: name, canonical: null, confidence: 0, method: 'exact' } }
    }

    // When index is empty (no skill.list), nothing to match — caller will handle dynamic creation
    if (this.skills.length === 0) {
      return { result: null, log: { extracted: name, canonical: null, confidence: 0, method: 'exact' } }
    }

    const q = normalize(name.trim())
    const qCore = stripSuffixes(q)

    // 1. Exact match on raw normalized
    for (const s of this.skills) {
      if (s.lower === q || s.lower === qCore || s.core === qCore) {
        return { result: { id: s.id, name: s.name, confidence: 1.0 }, log: { extracted: name, canonical: s.name, confidence: 1.0, method: 'exact' } }
      }
    }

    // 2. Contains match (LLM name is substring of canonical, or vice versa)
    for (const s of this.skills) {
      if (s.lower.includes(q) || q.includes(s.lower) ||
          s.lower.includes(qCore) || qCore.includes(s.lower) ||
          s.core.includes(qCore) || qCore.includes(s.core)) {
        return { result: { id: s.id, name: s.name, confidence: 0.85 }, log: { extracted: name, canonical: s.name, confidence: 0.85, method: 'contains' } }
      }
    }

    // 3. Edit distance match — use n-gram candidates to avoid scanning all skills
    if (qCore.length >= 2) {
      let best: { id: number; name: string; sim: number } | null = null
      const candidates = this.getNgramCandidates(qCore, 30)
      for (const s of candidates) {
        const maxLen = Math.max(s.core.length, qCore.length)
        const dist = this.levenshtein(qCore, s.core)
        const sim = 1 - dist / maxLen
        const threshold = qCore.length <= 3 ? 0.9 : qCore.length <= 5 ? 0.75 : 0.7
        if (sim >= threshold && (!best || sim > best.sim)) {
          best = { id: s.id, name: s.name, sim }
        }
      }
      if (best) {
        const confidence = Math.max(0.6, best.sim)
        return { result: { id: best.id, name: best.name, confidence }, log: { extracted: name, canonical: best.name, confidence, method: 'edit-distance' } }
      }
    }

    // 4. LLM 智能判别 — 对 Top-20 候选技能调用 LLM 判断是否是同一技能
    const llmCandidates = this.getLLMCandidates(name, 20)
    for (const candidate of llmCandidates) {
      const isSame = await this.isSameSkill(name, candidate.name)
      if (isSame) {
        return { result: { id: candidate.id, name: candidate.name, confidence: 0.9 }, log: { extracted: name, canonical: candidate.name, confidence: 0.9, method: 'llm' } }
      }
    }

    return { result: null, log: { extracted: name, canonical: null, confidence: 0, method: 'llm' } }
  }

  /**
   * 判断两个技能名称是否指的是同一个技能
   */
  private async isSameSkill(name1: string, name2: string): Promise<boolean> {
    const prompt = `判断以下两个技能名称是否指的是同一个技能。只返回 JSON 对象 {"isSame": true/false}。

技能A: "${name1}"
技能B: "${name2}"`

    try {
      const response = await this.llmService.callLLMForJson(
        '你是一个技能映射专家。判断两个技能是否相同。',
        prompt,
        'deepseek-v4-flash',
      )
      return (response as any).isSame === true
    } catch (err) {
      console.error(`[SkillMatcher] LLM 判别失败:`, (err as Error).message)
      return false
    }
  }

  /**
   * 获取 LLM 判别的候选技能列表
   * 基于 n-gram 重叠度和编辑距离，获取最有可能匹配的候选
   */
  private getLLMCandidates(name: string, limit: number): SkillEntry[] {
    const q = normalize(name)
    const qCore = stripSuffixes(q)
    const scored: { entry: SkillEntry; score: number }[] = []

    for (const s of this.skills) {
      let score = 0

      // 基于 n-gram 重叠度评分
      const ngramOverlap = this.getNgramOverlap(qCore, s.core)
      score += ngramOverlap * 10

      // 基于编辑距离评分
      if (qCore.length >= 2 && s.core.length >= 2) {
        const maxLen = Math.max(s.core.length, qCore.length)
        const dist = this.levenshtein(qCore, s.core)
        const sim = 1 - dist / maxLen
        if (sim >= 0.5) {
          score += sim * 5
        }
      }

      if (score > 0) {
        scored.push({ entry: s, score })
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.entry)
  }

  /**
   * 计算两个字符串的 n-gram 重叠度
   */
  private getNgramOverlap(s1: string, s2: string): number {
    if (s1.length < 2 || s2.length < 2) return 0

    const ngrams1 = new Set<string>()
    const ngrams2 = new Set<string>()

    for (let i = 0; i < s1.length - 1; i++) {
      ngrams1.add(s1.substring(i, i + 2))
    }
    for (let i = 0; i < s2.length - 1; i++) {
      ngrams2.add(s2.substring(i, i + 2))
    }

    let overlap = 0
    for (const ng of ngrams1) {
      if (ngrams2.has(ng)) overlap++
    }

    return overlap / Math.max(ngrams1.size, ngrams2.size)
  }

  /**
   * Return top-N candidate canonical skills for an extracted name.
   * Used by SkillResolutionService to provide options to the LLM fallback.
   */
  getCandidates(name: string, limit = 5): { id: number; name: string; confidence: number }[] {
    if (!name || name.trim().length === 0) return []

    const q = normalize(name.trim())
    const qCore = stripSuffixes(q)

    const scored: { id: number; name: string; confidence: number }[] = []

    for (const s of this.skills) {
      let confidence = 0

      // Exact match variants
      if (s.lower === q || s.lower === qCore || s.core === qCore) {
        confidence = 1.0
      } else if (s.lower.includes(q) || q.includes(s.lower) ||
                 s.lower.includes(qCore) || qCore.includes(s.lower) ||
                 s.core.includes(qCore) || qCore.includes(s.core)) {
        confidence = 0.85
      } else if (qCore.length >= 2) {
        // Edit distance
        const maxLen = Math.max(s.core.length, qCore.length)
        const dist = this.levenshtein(qCore, s.core)
        const sim = 1 - dist / maxLen
        const threshold = qCore.length <= 3 ? 0.9 : qCore.length <= 5 ? 0.75 : 0.7
        if (sim >= threshold) confidence = Math.max(0.6, sim)
      }

      if (confidence > 0) {
        scored.push({ id: s.id, name: s.name, confidence })
      }
    }

    scored.sort((a, b) => b.confidence - a.confidence)
    return scored.slice(0, limit)
  }

  async matchBatch(names: string[]): Promise<Array<{ result: { id: number; name: string; confidence: number } | null; log: MatchLog }>> {
    const results: Array<{ result: { id: number; name: string; confidence: number } | null; log: MatchLog }> = []
    for (const n of names) {
      results.push(await this.match(n))
    }
    return results
  }

  getById(id: number): string | undefined {
    const s = this.skills.find((s) => s.id === id)
    return s?.name
  }

  /** Return all canonical skills with id, name, and category for LLM context. */
  getAllSkills(): { id: number; name: string; category?: string }[] {
    return this.skills.map((s) => ({ id: s.id, name: s.name }))
  }

  /** Dynamically add a new skill to the in-memory index (called when LLM creates a new skill) */
  addSkill(id: number, name: string): void {
    const lower = normalize(name)
    const core = stripSuffixes(lower)

    // Dedup: if a skill with identical normalized name already exists, skip
    const existing = this.skills.find(s => s.lower === lower || s.core === core)
    if (existing) return

    const entry: SkillEntry = { id, name, lower, core }
    const idx = this.skills.length
    this.skills.push(entry)
    // Update n-gram index for the new skill
    for (let i = 0; i < core.length - 1; i++) {
      const ng = core.substring(i, i + 2)
      if (!this.ngramIndex.has(ng)) this.ngramIndex.set(ng, [])
      this.ngramIndex.get(ng)!.push(idx)
    }
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length; const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i])
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        )
      }
    }
    return dp[m][n]
  }
}
