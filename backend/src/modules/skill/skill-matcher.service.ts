import { Injectable, OnModuleInit } from '@nestjs/common';
import { SkillSeedService } from './skill-seed.service';

export interface MatchLog {
  extracted: string;
  canonical: string | null;
  confidence: number;
  method: 'exact' | 'contains' | 'edit-distance' | 'llm';
}

interface SkillEntry {
  id: number;
  name: string;
  lower: string;
  core: string; // normalized with common suffixes stripped
}

// Common Chinese tech suffixes that don't change skill identity
const SKILL_SUFFIXES = [
  '系统开发',
  '开发',
  '设计',
  '框架',
  '技术',
  '平台',
  '工具',
  '应用',
  '编程',
  '语言',
  '算法',
  '模型',
  '架构',
  '服务',
  '组件',
  '引擎',
  '系统',
  '方案',
  '流程',
  '管理',
  '分析',
  '测试',
  '部署',
  '优化',
  '配置',
  '实现',
  '封装',
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-\s\.\/]/g, '');
}

function stripSuffixes(s: string): string {
  let result = s;
  // Sort suffixes by length descending so longer matches are tried first
  const sorted = [...SKILL_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suffix of sorted) {
    if (result.endsWith(suffix) && result.length > suffix.length + 1) {
      result = result.slice(0, -suffix.length);
      break; // only strip one suffix
    }
  }
  return result;
}

@Injectable()
export class SkillMatcherService implements OnModuleInit {
  private skills: SkillEntry[] = [];
  // 2-gram 倒排索引：ngram → skill index[]
  private ngramIndex = new Map<string, number[]>();

  constructor(private seedService: SkillSeedService) {}

  async onModuleInit() {
    const names = this.seedService.getSkillList();
    this.skills = names.map((name, i) => {
      const lower = normalize(name);
      const core = stripSuffixes(lower);
      return { id: i, name, lower, core };
    });
    this.buildNgramIndex();
    if (this.skills.length === 0) {
      console.log(
        `[SkillMatcher] Starting with empty index (no skill.list). Skills will be added dynamically as documents are parsed.`,
      );
    } else {
      console.log(
        `[SkillMatcher] Indexed ${this.skills.length} skills (${this.ngramIndex.size} ngrams) for matching`,
      );
    }
  }

  private buildNgramIndex() {
    for (let idx = 0; idx < this.skills.length; idx++) {
      const core = this.skills[idx].core;
      for (let i = 0; i < core.length - 1; i++) {
        const ng = core.substring(i, i + 2);
        if (!this.ngramIndex.has(ng)) this.ngramIndex.set(ng, []);
        this.ngramIndex.get(ng)!.push(idx);
      }
    }
  }

  /** Get top-N candidate indices by n-gram overlap count */
  private getNgramCandidates(query: string, limit: number): SkillEntry[] {
    const counts = new Map<number, number>();
    for (let i = 0; i < query.length - 1; i++) {
      const ng = query.substring(i, i + 2);
      const entries = this.ngramIndex.get(ng);
      if (entries) {
        for (const idx of entries) {
          counts.set(idx, (counts.get(idx) || 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([idx]) => this.skills[idx]);
  }

  /**
   * Find the best matching canonical skill ID for an LLM-extracted name.
   * Returns { id, name, confidence } or null if no good match.
   * Also returns a log entry describing the matching method used.
   */
  async match(name: string): Promise<{
    result: { id: number; name: string; confidence: number } | null;
    log: MatchLog;
  }> {
    if (!name || name.trim().length === 0) {
      return {
        result: null,
        log: {
          extracted: name,
          canonical: null,
          confidence: 0,
          method: 'exact',
        },
      };
    }

    // When index is empty (no skill.list), nothing to match — caller will handle dynamic creation
    if (this.skills.length === 0) {
      return {
        result: null,
        log: {
          extracted: name,
          canonical: null,
          confidence: 0,
          method: 'exact',
        },
      };
    }

    const q = normalize(name.trim());
    const qCore = stripSuffixes(q);

    // 1. Exact match on raw normalized
    for (const s of this.skills) {
      if (s.lower === q || s.lower === qCore || s.core === qCore) {
        return {
          result: { id: s.id, name: s.name, confidence: 1.0 },
          log: {
            extracted: name,
            canonical: s.name,
            confidence: 1.0,
            method: 'exact',
          },
        };
      }
    }

    // 2. Contains match (LLM name is substring of canonical, or vice versa)
    for (const s of this.skills) {
      if (
        s.lower.includes(q) ||
        q.includes(s.lower) ||
        s.lower.includes(qCore) ||
        qCore.includes(s.lower) ||
        s.core.includes(qCore) ||
        qCore.includes(s.core)
      ) {
        return {
          result: { id: s.id, name: s.name, confidence: 0.85 },
          log: {
            extracted: name,
            canonical: s.name,
            confidence: 0.85,
            method: 'contains',
          },
        };
      }
    }

    // 3. Edit distance match — use n-gram candidates to avoid scanning all skills
    if (qCore.length >= 2) {
      let best: { id: number; name: string; sim: number } | null = null;
      const candidates = this.getNgramCandidates(qCore, 30);
      for (const s of candidates) {
        const maxLen = Math.max(s.core.length, qCore.length);
        const dist = this.levenshtein(qCore, s.core);
        const sim = 1 - dist / maxLen;
        const threshold =
          qCore.length <= 3 ? 0.9 : qCore.length <= 5 ? 0.75 : 0.7;
        if (sim >= threshold && (!best || sim > best.sim)) {
          best = { id: s.id, name: s.name, sim };
        }
      }
      if (best) {
        const confidence = Math.max(0.6, best.sim);
        return {
          result: { id: best.id, name: best.name, confidence },
          log: {
            extracted: name,
            canonical: best.name,
            confidence,
            method: 'edit-distance',
          },
        };
      }
    }

    // No match found
    return {
      result: null,
      log: {
        extracted: name,
        canonical: null,
        confidence: 0,
        method: 'edit-distance',
      },
    };
  }

  getById(id: number): string | undefined {
    const s = this.skills.find((s) => s.id === id);
    return s?.name;
  }

  /** Return all canonical skills with id, name, and category for LLM context. */
  getAllSkills(): { id: number; name: string; category?: string }[] {
    return this.skills.map((s) => ({ id: s.id, name: s.name }));
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[m][n];
  }
}
