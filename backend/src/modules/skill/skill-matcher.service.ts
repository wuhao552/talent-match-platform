import { Injectable, OnModuleInit } from '@nestjs/common'
import { SkillSeedService } from './skill-seed.service'

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

// Known synonym/alias map (lowercase normalized)
const SKILL_ALIASES: Record<string, string> = {
  'rag': 'rag',
  '检索增强生成': 'rag',
  '大模型': 'llm',
  'llm': 'llm',
  '大语言模型': 'llm',
  'langchain': 'langchain',
  'lc': 'langchain',
  'pytorch': 'pytorch',
  'tensorflow': 'tensorflow',
  'paddlepaddle': 'paddlepaddle',
  '百度飞桨': 'paddlepaddle',
  '飞桨': 'paddlepaddle',
  'keras': 'keras',
  'scikitlearn': 'scikit-learn',
  'sklearn': 'scikit-learn',
  'opencv': 'opencv',
  'cv': 'opencv',
  'nlp': 'nlp',
  '自然语言处理': 'nlp',
  'cv计算机视觉': 'opencv',
  '计算机视觉': 'opencv',
  'k8s': 'kubernetes',
  'kubernetes': 'kubernetes',
  'docker': 'docker',
  '容器': 'docker',
  'react': 'react',
  'reactjs': 'react',
  'vue': 'vue',
  'vuejs': 'vue',
  'node': 'node.js',
  'nodejs': 'node.js',
  'postgresql': 'postgresql',
  'postgres': 'postgresql',
  'pg': 'postgresql',
  'mongodb': 'mongodb',
  'mongo': 'mongodb',
  'redis': 'redis',
  'elasticsearch': 'elasticsearch',
  'es': 'elasticsearch',
  'aws': 'aws',
  'azure': 'azure',
  'gcp': 'gcp',
  'googlecloud': 'gcp',
}

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

function resolveAlias(name: string): string {
  const key = normalize(name)
  return SKILL_ALIASES[key] || name
}

@Injectable()
export class SkillMatcherService implements OnModuleInit {
  private skills: SkillEntry[] = []

  constructor(private seedService: SkillSeedService) {}

  async onModuleInit() {
    const names = this.seedService.getSkillList()
    this.skills = names.map((name, i) => ({
      id: i, // 0-indexed, aligned with Neo4j
      name,
      lower: normalize(name),
      core: stripSuffixes(normalize(name)),
    }))
    console.log(`[SkillMatcher] Indexed ${this.skills.length} skills for matching`)
  }

  /**
   * Find the best matching canonical skill ID for an LLM-extracted name.
   * Returns { id, name, confidence } or null if no good match.
   */
  match(name: string): { id: number; name: string; confidence: number } | null {
    if (!name || name.trim().length === 0) return null

    const q = normalize(name.trim())
    const qCore = stripSuffixes(q)
    const qAlias = normalize(resolveAlias(name))

    // 1. Exact match on raw normalized
    for (const s of this.skills) {
      if (s.lower === q || s.lower === qCore || s.core === qCore) return { id: s.id, name: s.name, confidence: 1.0 }
    }

    // 2. Alias match
    if (qAlias !== q) {
      for (const s of this.skills) {
        if (s.lower === qAlias || s.core === qAlias) return { id: s.id, name: s.name, confidence: 0.95 }
      }
    }

    // 3. Contains match (LLM name is substring of canonical, or vice versa)
    for (const s of this.skills) {
      if (s.lower.includes(q) || q.includes(s.lower) ||
          s.lower.includes(qCore) || qCore.includes(s.lower) ||
          s.core.includes(qCore) || qCore.includes(s.core)) {
        return { id: s.id, name: s.name, confidence: 0.85 }
      }
    }

    // 4. Alias contains match
    if (qAlias !== q) {
      for (const s of this.skills) {
        if (s.lower.includes(qAlias) || qAlias.includes(s.lower)) {
          return { id: s.id, name: s.name, confidence: 0.82 }
        }
      }
    }

    // 5. Edit distance match — relax thresholds to catch more matches
    if (qCore.length >= 2) {
      let best: { id: number; name: string; sim: number } | null = null
      for (const s of this.skills) {
        const maxLen = Math.max(s.core.length, qCore.length)
        const dist = this.levenshtein(qCore, s.core)
        const sim = 1 - dist / maxLen
        const threshold = qCore.length <= 3 ? 0.9 : qCore.length <= 5 ? 0.75 : 0.7
        if (sim >= threshold && (!best || sim > best.sim)) {
          best = { id: s.id, name: s.name, sim }
        }
      }
      if (best) return { id: best.id, name: best.name, confidence: Math.max(0.6, best.sim) }
    }

    return null
  }

  /**
   * Return top-N candidate canonical skills for an extracted name.
   * Used by SkillResolutionService to provide options to the LLM fallback.
   */
  getCandidates(name: string, limit = 5): { id: number; name: string; confidence: number }[] {
    if (!name || name.trim().length === 0) return []

    const q = normalize(name.trim())
    const qCore = stripSuffixes(q)
    const qAlias = normalize(resolveAlias(name))

    const scored: { id: number; name: string; confidence: number }[] = []

    for (const s of this.skills) {
      let confidence = 0

      // Exact match variants
      if (s.lower === q || s.lower === qCore || s.core === qCore) {
        confidence = 1.0
      } else if (qAlias !== q && (s.lower === qAlias || s.core === qAlias)) {
        confidence = 0.95
      } else if (s.lower.includes(q) || q.includes(s.lower) ||
                 s.lower.includes(qCore) || qCore.includes(s.lower) ||
                 s.core.includes(qCore) || qCore.includes(s.core)) {
        confidence = 0.85
      } else if (qAlias !== q && (s.lower.includes(qAlias) || qAlias.includes(s.lower))) {
        confidence = 0.82
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

  matchBatch(names: string[]): { id: number; name: string; confidence: number }[] {
    return names.map((n) => this.match(n)).filter(Boolean) as { id: number; name: string; confidence: number }[]
  }

  getById(id: number): string | undefined {
    const s = this.skills.find((s) => s.id === id)
    return s?.name
  }

  /** Return all canonical skills with id, name, and category for LLM context. */
  getAllSkills(): { id: number; name: string; category?: string }[] {
    return this.skills.map((s) => ({ id: s.id, name: s.name }))
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
