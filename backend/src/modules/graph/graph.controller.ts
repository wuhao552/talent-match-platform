import { Controller, Get, Param, Query, UseGuards, Post, Body, Res } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Neo4jService } from './neo4j.service'
import { CommunityDetectionService } from './community-detection.service'
import { SkillSimilarityService } from '../skill/skill-similarity.service'

@Controller('graph')
@UseGuards(JwtAuthGuard)
export class GraphController {
  constructor(
    private neo4j: Neo4jService,
    private communityDetection: CommunityDetectionService,
    private skillSimilarity: SkillSimilarityService,
    private jwtService: JwtService,
  ) {}

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

  @Post('cooccurrence-batch')
  async getBatchCooccurrence(@Body() body: { skillIds: number[] }) {
    if (!body.skillIds || body.skillIds.length < 2) {
      return { code: 200, message: 'ok', data: [] }
    }
    try {
      const data = await this.neo4j.batchGetCooccurrences(body.skillIds, body.skillIds)
      return { code: 200, message: 'ok', data }
    } catch (err) {
      console.error('[GraphController] batchGetCooccurrences failed:', (err as Error).message)
      return { code: 200, message: 'ok', data: [] }
    }
  }

  // SSE: 实时社区发现
  @Get('community-stream')
  async communityStream(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      res.status(401).json({ code: 401, message: '缺少 token 参数' })
      return
    }
    try {
      this.jwtService.verify(token)
    } catch (err) {
      res.status(401).json({ code: 401, message: 'token 无效: ' + (err as Error).message })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const communities = await this.communityDetection.detectWithProgress(
        (progress) => send('progress', progress),
      )

      // Update SkillSimilarityService with the new community data
      this.skillSimilarity.updateCommunities(communities)

      send('complete', {
        communities: new Set(communities.values()).size,
        totalNodes: communities.size,
      })
    } catch (err) {
      send('error', { message: (err as Error).message })
    } finally {
      res.end()
    }
  }
}
