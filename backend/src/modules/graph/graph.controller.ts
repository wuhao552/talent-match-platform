import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Neo4jService } from './neo4j.service'

@Controller('graph')
@UseGuards(JwtAuthGuard)
export class GraphController {
  constructor(private neo4j: Neo4jService) {}

  @Get('person/:userId')
  async getPersonGraph(@Param('userId') userId: string) {
    const data = await this.neo4j.getPersonGraph(userId)
    return { code: 200, message: 'ok', data }
  }

  @Get('position/:docId')
  async getPositionGraph(@Param('docId') docId: string) {
    const data = await this.neo4j.getPositionGraph(docId)
    return { code: 200, message: 'ok', data }
  }

  @Get('skill-network')
  async getSkillNetwork(@Query('skillId') skillId?: string) {
    const data = await this.neo4j.getSkillNetwork(
      skillId ? parseInt(skillId) : undefined,
    )
    return { code: 200, message: 'ok', data }
  }
}
