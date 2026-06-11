import { Injectable, OnModuleDestroy } from '@nestjs/common'
import neo4j, { Driver, Session } from 'neo4j-driver'

export interface CooccurrenceEdge {
  neighborId: number
  freqCompany: number
  freqSkill: number
  freqL2Occupation: number
  freqL1Occupation: number
  freqRegion: number
}

export interface BatchCooccurrence {
  sourceId: number
  targetId: number
  freqSkill: number
  freqCompany: number
  freqL2Occupation: number
}

@Injectable()
export class Neo4jService implements OnModuleDestroy {
  private driver: Driver

  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME || 'neo4j',
        process.env.NEO4J_PASSWORD || '12345678',
      ),
    )
  }

  /** Safe conversion: handles both neo4j-driver v5 Integer objects and v6 native numbers */
  private toNum(val: unknown): number {
    if (val === null || val === undefined) return 0
    if (typeof val === 'number') return val
    if (typeof val === 'bigint') return Number(val)
    if (typeof (val as any)?.toNumber === 'function') return (val as any).toNumber()
    return Number(val) || 0
  }

  getSession(): Session {
    return this.driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })
  }

  async run(query: string, params?: Record<string, unknown>) {
    const session = this.getSession()
    try {
      return await session.run(query, params)
    } finally {
      await session.close()
    }
  }

  // ───── Person / Job skill graph ─────

  async addPersonSkill(userId: string, skillId: number, skillName: string, proficiency?: string) {
    return this.run(
      `MERGE (p:Person {userId: $userId})
       MERGE (s:Skill {id: $skillId})
       SET s.name = COALESCE(s.name, $skillName)
       MERGE (p)-[r:HAS_SKILL]->(s)
       SET r.proficiency = $proficiency`,
      { userId, skillId, skillName, proficiency: proficiency || 'intermediate' },
    )
  }

  async addPersonSkills(userId: string, skills: Array<{ skillId: number; skillName: string; proficiency?: string }>) {
    if (skills.length === 0) return
    const session = this.getSession()
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `MERGE (p:Person {userId: $userId})
           WITH p
           UNWIND $skills AS sk
           MERGE (s:Skill {id: sk.skillId})
           SET s.name = COALESCE(s.name, sk.skillName)
           MERGE (p)-[r:HAS_SKILL]->(s)
           SET r.proficiency = sk.proficiency`,
          {
            userId,
            skills: skills.map((s) => ({
              skillId: s.skillId,
              skillName: s.skillName,
              proficiency: s.proficiency || 'intermediate',
            })),
          },
        ),
      )
    } finally {
      await session.close()
    }
  }

  async addJobSkill(
    documentId: string, skillId: number, skillName: string,
    importance?: string, proficiency?: string,
  ) {
    return this.run(
      `MERGE (j:JobPosition {documentId: $documentId})
       MERGE (s:Skill {id: $skillId})
       SET s.name = COALESCE(s.name, $skillName)
       MERGE (j)-[r:REQUIRES_SKILL]->(s)
       SET r.importance = $importance,
           r.proficiency = $proficiency`,
      { documentId, skillId, skillName, importance: importance || 'required', proficiency: proficiency || 'intermediate' },
    )
  }

  async addJobSkills(
    documentId: string, skills: Array<{ skillId: number; skillName: string; importance?: string; proficiency?: string }>,
  ) {
    if (skills.length === 0) return
    const session = this.getSession()
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `MERGE (j:JobPosition {documentId: $documentId})
           WITH j
           UNWIND $skills AS sk
           MERGE (s:Skill {id: sk.skillId})
           SET s.name = COALESCE(s.name, sk.skillName)
           MERGE (j)-[r:REQUIRES_SKILL]->(s)
           SET r.importance = sk.importance,
               r.proficiency = sk.proficiency`,
          {
            documentId,
            skills: skills.map((s) => ({
              skillId: s.skillId,
              skillName: s.skillName,
              importance: s.importance || 'required',
              proficiency: s.proficiency || 'intermediate',
            })),
          },
        ),
      )
    } finally {
      await session.close()
    }
  }

  async getPersonGraph(userId: string) {
    const result = await this.run(
      `MATCH (p:Person {userId: $userId})-[r:HAS_SKILL]->(s:Skill)
       OPTIONAL MATCH (s)-[c:CO_OCCURS_WITH]-(related:Skill)
       WHERE p-[:HAS_SKILL]->(related) OR NOT (p)-[:HAS_SKILL]->(related)
       RETURN p, r, s, c, related LIMIT 200`,
      { userId },
    )
    const nodes: { id: string; label: string; type: string; proficiency?: string }[] = []
    const edges: { source: string; target: string; weight?: number }[] = []
    const seen = new Set<string>()

    nodes.push({ id: `person-${userId}`, label: '个人能力', type: 'person' })

    for (const record of result.records) {
      const skillId = `skill-${record.get('s').properties.id}`
      if (!seen.has(skillId)) {
        seen.add(skillId)
        const sName = record.get('s').properties?.name || `技能 ${record.get('s').properties.id}`
        nodes.push({ id: skillId, label: sName, type: 'skill', proficiency: record.get('r')?.properties?.proficiency })
        edges.push({ source: `person-${userId}`, target: skillId, weight: 1 })
      }
      if (record.get('related')) {
        const relatedId = `skill-${record.get('related').properties.id}`
        if (!seen.has(relatedId)) {
          seen.add(relatedId)
          const rName = record.get('related').properties?.name || `技能 ${record.get('related').properties.id}`
          nodes.push({ id: relatedId, label: rName, type: 'related_skill' })
        }
        edges.push({ source: skillId, target: relatedId, weight: record.get('c')?.properties?.freq_COMPANY || 0.5 })
      }
    }
    return { nodes, edges }
  }

  async getPositionGraph(documentId: string) {
    const result = await this.run(
      `MATCH (j:JobPosition {documentId: $documentId})-[r:REQUIRES_SKILL]->(s:Skill)
       OPTIONAL MATCH (s)-[c:CO_OCCURS_WITH]-(related:Skill)
       RETURN j, r, s, c, related LIMIT 200`,
      { documentId },
    )
    const nodes: { id: string; label: string; type: string }[] = []
    const edges: { source: string; target: string; weight?: number }[] = []
    const seen = new Set<string>()

    nodes.push({ id: `job-${documentId}`, label: '职位要求', type: 'position' })

    for (const record of result.records) {
      const skillId = `skill-${record.get('s').properties.id}`
      if (!seen.has(skillId)) {
        seen.add(skillId)
        const sName = record.get('s').properties?.name || `技能 ${record.get('s').properties.id}`
        nodes.push({ id: skillId, label: sName, type: 'skill' })
        edges.push({ source: `job-${documentId}`, target: skillId, weight: 1 })
      }
    }
    return { nodes, edges }
  }

  async getSkillNetwork(skillId?: number) {
    let query: string
    let params: Record<string, unknown> = {}

    if (skillId) {
      query = `MATCH (s:Skill {id: $skillId})-[r:CO_OCCURS_WITH]-(neighbor:Skill) RETURN s, r, neighbor LIMIT 100`
      params = { skillId }
    } else {
      query = `MATCH (a:Skill)-[r:CO_OCCURS_WITH]->(b:Skill) WHERE r.freq_COMPANY > 100 RETURN a, r, b LIMIT 200`
    }

    const result = await this.run(query, params)
    const nodes: { id: string; label: string; type: string }[] = []
    const edges: { source: string; target: string; weight?: number }[] = []
    const seen = new Set<string>()

    for (const record of result.records) {
      const aId = `skill-${record.get('a').properties.id}`
      const bId = `skill-${record.get('b').properties.id}`

      if (!seen.has(aId)) {
        seen.add(aId)
        nodes.push({ id: aId, label: record.get('a').properties?.name || `技能 ${record.get('a').properties.id}`, type: 'skill' })
      }
      if (!seen.has(bId)) {
        seen.add(bId)
        nodes.push({ id: bId, label: record.get('b').properties?.name || `技能 ${record.get('b').properties.id}`, type: 'skill' })
      }
      edges.push({ source: aId, target: bId, weight: record.get('r')?.properties?.freq_COMPANY || 1 })
    }
    return { nodes, edges }
  }

  async deleteJobPosition(documentId: string) {
    return this.run(`MATCH (j:JobPosition {documentId: $documentId}) DETACH DELETE j`, { documentId })
  }

  // ───── Co-occurrence queries ─────

  /**
   * Get related skills with multi-granularity frequency data.
   * Returns all co-occurrence properties for weighted scoring.
   */
  async getRelatedSkillsDetailed(skillId: number, limit = 10): Promise<CooccurrenceEdge[]> {
    const int = require('neo4j-driver').int
    const result = await this.run(
      `MATCH (s:Skill {id: $skillId})-[r:CO_OCCURS_WITH]-(neighbor:Skill)
       RETURN neighbor.id AS id,
              coalesce(r.freq_COMPANY, 0) AS freqCompany,
              coalesce(r.freq_SKILL, 0) AS freqSkill,
              coalesce(r.freq_L2_OCCUPATION, 0) AS freqL2,
              coalesce(r.freq_L1_OCCUPATION, 0) AS freqL1,
              coalesce(r.freq_REGION, 0) AS freqRegion
       ORDER BY coalesce(r.freq_SKILL, 0) DESC
       LIMIT $limit`,
      { skillId, limit: int(limit) },
    )
    return result.records.map((r) => ({
      neighborId: this.toNum(r.get('id')),
      freqCompany: this.toNum(r.get('freqCompany')),
      freqSkill: this.toNum(r.get('freqSkill')),
      freqL2Occupation: this.toNum(r.get('freqL2')),
      freqL1Occupation: this.toNum(r.get('freqL1')),
      freqRegion: this.toNum(r.get('freqRegion')),
    }))
  }

  /**
   * Batch query: find all co-occurrence relationships between two sets of skill IDs.
   * Replaces N individual getRelatedSkills calls with a single query.
   */
  async batchGetCooccurrences(
    sourceSkillIds: number[],
    targetSkillIds: number[],
  ): Promise<BatchCooccurrence[]> {
    if (sourceSkillIds.length === 0 || targetSkillIds.length === 0) return []
    const int = require('neo4j-driver').int

    const result = await this.run(
      `MATCH (a:Skill)-[r:CO_OCCURS_WITH]-(b:Skill)
       WHERE a.id IN $sourceIds AND b.id IN $targetIds
       RETURN a.id AS sourceId, b.id AS targetId,
              coalesce(r.freq_SKILL, 0) AS freqSkill,
              coalesce(r.freq_COMPANY, 0) AS freqCompany,
              coalesce(r.freq_L2_OCCUPATION, 0) AS freqL2
       ORDER BY coalesce(r.freq_SKILL, 0) DESC
       LIMIT 500`,
      {
        sourceIds: sourceSkillIds.map((id: number) => int(id)),
        targetIds: targetSkillIds.map((id: number) => int(id)),
      },
    )
    return result.records.map((r) => ({
      sourceId: this.toNum(r.get('sourceId')),
      targetId: this.toNum(r.get('targetId')),
      freqSkill: this.toNum(r.get('freqSkill')),
      freqCompany: this.toNum(r.get('freqCompany')),
      freqL2Occupation: this.toNum(r.get('freqL2')),
    }))
  }

  /** Simple related skill IDs (backward compat) */
  async getRelatedSkills(skillId: number, limit = 10): Promise<number[]> {
    const int = require('neo4j-driver').int
    const result = await this.run(
      `MATCH (s:Skill {id: $skillId})-[r:CO_OCCURS_WITH]-(neighbor:Skill)
       RETURN neighbor.id AS id
       ORDER BY coalesce(r.freq_COMPANY, 0) DESC
       LIMIT $limit`,
      { skillId, limit: int(limit) },
    )
    return result.records.map((r) => this.toNum(r.get('id')))
  }

  async getSkillFrequency(skillId: number): Promise<Record<string, number>> {
    const q = `MATCH (a:Skill {id: $skillId})-[r:CO_OCCURS_WITH]->(b) RETURN r LIMIT 1`
    const result = await this.run(q, { skillId })
    if (result.records.length === 0) return {}
    const props = result.records[0].get('r').properties
    return {
      L1_OCCUPATION: props.freq_L1_OCCUPATION || 0,
      L2_OCCUPATION: props.freq_L2_OCCUPATION || 0,
      SKILL: props.freq_SKILL || 0,
      COMPANY: props.freq_COMPANY || 0,
      REGION: props.freq_REGION || 0,
    }
  }

  async onModuleDestroy() {
    await this.driver.close()
  }
}
