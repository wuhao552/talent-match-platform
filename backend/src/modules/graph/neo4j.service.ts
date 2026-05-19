import { Injectable, OnModuleDestroy } from '@nestjs/common'
import neo4j, { Driver, Session } from 'neo4j-driver'

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

  // Create/update Person HAS_SKILL relationship
  async addPersonSkill(
    userId: string,
    skillId: number,
    proficiency?: string,
    years?: number,
  ) {
    const params: Record<string, unknown> = { userId, skillId }
    let setClause = 'SET r.proficiency = $proficiency'
    params['proficiency'] = proficiency || 'intermediate'

    if (years !== undefined && years !== null) {
      setClause += ', r.yearsOfExperience = $years'
      params['years'] = years
    }

    return this.run(
      `
      MERGE (p:Person {userId: $userId})
      MERGE (s:Skill {id: $skillId})
      MERGE (p)-[r:HAS_SKILL]->(s)
      ${setClause}
      `,
      params,
    )
  }

  // Create/update JobPosition REQUIRES_SKILL relationship
  async addJobSkill(
    documentId: string,
    skillId: number,
    importance?: string,
    proficiency?: string,
  ) {
    return this.run(
      `
      MERGE (j:JobPosition {documentId: $documentId})
      MERGE (s:Skill {id: $skillId})
      MERGE (j)-[r:REQUIRES_SKILL]->(s)
      SET r.importance = $importance,
          r.proficiency = $proficiency
      `,
      {
        documentId,
        skillId,
        importance: importance || 'required',
        proficiency: proficiency || 'intermediate',
      },
    )
  }

  // Get person skill graph
  async getPersonGraph(userId: string) {
    const result = await this.run(
      `
      MATCH (p:Person {userId: $userId})-[r:HAS_SKILL]->(s:Skill)
      OPTIONAL MATCH (s)-[c:CO_OCCURS_WITH]-(related:Skill)
      WHERE p-[:HAS_SKILL]->(related) OR NOT (p)-[:HAS_SKILL]->(related)
      RETURN p, r, s, c, related
      LIMIT 200
      `,
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
        nodes.push({
          id: skillId,
          label: `技能 ${record.get('s').properties.id}`,
          type: 'skill',
          proficiency: record.get('r')?.properties?.proficiency,
        })
        edges.push({
          source: `person-${userId}`,
          target: skillId,
          weight: 1,
        })
      }

      if (record.get('related')) {
        const relatedId = `skill-${record.get('related').properties.id}`
        if (!seen.has(relatedId)) {
          seen.add(relatedId)
          nodes.push({
            id: relatedId,
            label: `技能 ${record.get('related').properties.id}`,
            type: 'related_skill',
          })
        }
        edges.push({
          source: skillId,
          target: relatedId,
          weight: record.get('c')?.properties?.freq_COMPANY || 0.5,
        })
      }
    }

    return { nodes, edges }
  }

  // Get job position skill graph
  async getPositionGraph(documentId: string) {
    const result = await this.run(
      `
      MATCH (j:JobPosition {documentId: $documentId})-[r:REQUIRES_SKILL]->(s:Skill)
      OPTIONAL MATCH (s)-[c:CO_OCCURS_WITH]-(related:Skill)
      RETURN j, r, s, c, related
      LIMIT 200
      `,
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
        nodes.push({
          id: skillId,
          label: `技能 ${record.get('s').properties.id}`,
          type: 'skill',
        })
        edges.push({
          source: `job-${documentId}`,
          target: skillId,
          weight: 1,
        })
      }
    }

    return { nodes, edges }
  }

  // Get skill co-occurrence network
  async getSkillNetwork(skillId?: number) {
    let query: string
    let params: Record<string, unknown> = {}

    if (skillId) {
      query = `
        MATCH (s:Skill {id: $skillId})-[r:CO_OCCURS_WITH]-(neighbor:Skill)
        RETURN s, r, neighbor
        LIMIT 100
      `
      params = { skillId }
    } else {
      query = `
        MATCH (a:Skill)-[r:CO_OCCURS_WITH]->(b:Skill)
        WHERE r.freq_COMPANY > 100
        RETURN a, r, b
        LIMIT 200
      `
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
        nodes.push({ id: aId, label: `技能 ${record.get('a').properties.id}`, type: 'skill' })
      }
      if (!seen.has(bId)) {
        seen.add(bId)
        nodes.push({ id: bId, label: `技能 ${record.get('b').properties.id}`, type: 'skill' })
      }

      edges.push({
        source: aId,
        target: bId,
        weight: record.get('r')?.properties?.freq_COMPANY || 1,
      })
    }

    return { nodes, edges }
  }

  // Get related skills
  async getRelatedSkills(skillId: number, limit = 10): Promise<number[]> {
    const int = require('neo4j-driver').int
    const result = await this.run(
      `
      MATCH (s:Skill {id: $skillId})-[r:CO_OCCURS_WITH]-(neighbor:Skill)
      RETURN neighbor.id AS id
      ORDER BY r.freq_COMPANY DESC
      LIMIT $limit
      `,
      { skillId, limit: int(limit) },
    )
    return result.records.map((r) => r.get('id').toNumber())
  }

  // Get skill frequency from co-occurrence data
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
