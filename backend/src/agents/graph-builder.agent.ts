import { Injectable } from '@nestjs/common'
import type { IAgent, AgentContext, AgentResult, AgentDefinition } from './agent.interface'
import { Neo4jService } from '../modules/graph/neo4j.service'
import { SkillService } from '../modules/skill/skill.service'

@Injectable()
export class GraphBuilderAgent implements IAgent {
  constructor(
    private neo4j: Neo4jService,
    private skillService: SkillService,
  ) {}

  readonly definition: AgentDefinition = {
    agentType: 'graph_builder',
    description: '构建/更新个人或职位的能力图谱',
    whenToUse: '技能提取完成后',
    tools: ['neo4jWrite', 'skillLink'],
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { documentId, docType, skills, userId } = context.input as {
      documentId: string
      docType: string
      skills: Array<{ skillId: number; proficiency: string; years?: number }>
      userId: string
    }

    try {
      if (docType === 'resume') {
        for (const skill of skills) {
          await this.skillService.getOrCreate(skill.skillId)
          await this.neo4j.addPersonSkill(
            userId,
            skill.skillId,
            skill.proficiency,
            skill.years,
          )
        }
      } else {
        for (const skill of skills) {
          await this.skillService.getOrCreate(skill.skillId)
          await this.neo4j.addJobSkill(
            documentId,
            skill.skillId,
            'required',
            skill.proficiency,
          )
        }
      }

      return {
        success: true,
        data: { nodesAdded: skills.length },
        summary: `图谱构建完成，添加 ${skills.length} 个技能关系`,
      }
    } catch (err) {
      return {
        success: false,
        data: {},
        summary: '图谱构建失败',
        error: err instanceof Error ? err.message : '未知错误',
      }
    }
  }
}
