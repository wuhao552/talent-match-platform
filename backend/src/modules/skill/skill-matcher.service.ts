import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from './skill.entity';
import { normalize, stripSuffixes } from './skill.utils';

export interface MatchLog {
  extracted: string;
  canonical: string | null;
  confidence: number;
  method: 'exact' | 'contains' | 'edit-distance';
}

function levenshtein(a: string, b: string): number {
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

interface SkillEntry {
  id: number;
  name: string;
  core: string;
}

@Injectable()
export class SkillMatcherService implements OnModuleInit {
  private skills: SkillEntry[] = [];
  // 2-gram inverted index: ngram → skill index[]
  private ngramIndex = new Map<string, number[]>();

  constructor(
    @InjectRepository(Skill) private skillRepo: Repository<Skill>,
  ) {}

  async onModuleInit() {
    // Load skills from database instead of file
    const rows = await this.skillRepo.find({
      select: ['id', 'name', 'coreName'],
    });
    this.skills = rows.map((r) => ({
      id: r.id,
      name: r.name,
      core: r.coreName || stripSuffixes(normalize(r.name || '')),
    }));
    this.buildNgramIndex();

    if (this.skills.length === 0) {
      console.log(
        `[SkillMatcher] No skills in database. Skills will be added dynamically as documents are parsed.`,
      );
    } else {
      console.log(
        `[SkillMatcher] Indexed ${this.skills.length} skills (${this.ngramIndex.size} ngrams) from database`,
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
   * Loads skills from database on startup, uses in-memory n-gram index + edit distance.
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

    // 1. Exact match on normalized name or core
    for (const s of this.skills) {
      const lower = normalize(s.name);
      if (lower === q || lower === qCore || s.core === qCore) {
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

    // 2. Contains match (bidirectional)
    for (const s of this.skills) {
      const lower = normalize(s.name);
      if (
        lower.includes(q) ||
        q.includes(lower) ||
        lower.includes(qCore) ||
        qCore.includes(lower) ||
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
        const dist = levenshtein(qCore, s.core);
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
}
