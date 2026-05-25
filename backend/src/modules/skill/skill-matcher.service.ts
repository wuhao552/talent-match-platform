import { Injectable, OnModuleInit } from '@nestjs/common'
import { SkillSeedService } from './skill-seed.service'

interface SkillEntry {
  id: number
  name: string
  lower: string
}

@Injectable()
export class SkillMatcherService implements OnModuleInit {
  private skills: SkillEntry[] = []

  constructor(private seedService: SkillSeedService) {}

  async onModuleInit() {
    const names = this.seedService.getSkillList()
    this.skills = names.map((name, i) => ({
      id: i + 1,
      name,
      lower: name.toLowerCase().replace(/[-\s]/g, ''),
    }))
    console.log(`[SkillMatcher] Indexed ${this.skills.length} skills for matching`)
  }

  /**
   * Find the best matching canonical skill ID for an LLM-extracted name.
   * Returns { id, name, confidence } or null if no good match.
   */
  match(name: string): { id: number; name: string; confidence: number } | null {
    if (!name || name.trim().length === 0) return null

    const q = name.trim().toLowerCase().replace(/[-\s]/g, '')

    // 1. Exact match
    for (const s of this.skills) {
      if (s.lower === q) return { id: s.id, name: s.name, confidence: 1.0 }
    }

    // 2. Contains match (LLM name is substring of canonical, or vice versa)
    for (const s of this.skills) {
      if (s.lower.includes(q) || q.includes(s.lower)) {
        return { id: s.id, name: s.name, confidence: 0.85 }
      }
    }

    // 3. Edit distance match for short strings
    if (q.length >= 3) {
      let best: { id: number; name: string; dist: number } | null = null
      for (const s of this.skills) {
        if (Math.abs(s.lower.length - q.length) > 4) continue
        const dist = this.levenshtein(q, s.lower)
        const threshold = Math.min(2, Math.floor(q.length * 0.3))
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { id: s.id, name: s.name, dist }
        }
      }
      if (best) return { id: best.id, name: best.name, confidence: Math.max(0.6, 1 - best.dist / q.length) }
    }

    return null
  }

  matchBatch(names: string[]): { id: number; name: string; confidence: number }[] {
    return names.map((n) => this.match(n)).filter(Boolean) as { id: number; name: string; confidence: number }[]
  }

  getById(id: number): string | undefined {
    const s = this.skills.find((s) => s.id === id)
    return s?.name
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
