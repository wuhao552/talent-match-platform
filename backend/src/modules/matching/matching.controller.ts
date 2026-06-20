import { Controller, Post, Get, Param, Query, Body, Res, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { MatchingService } from './matching.service'
import { DocumentService } from '../document/document.service'
import { Document } from '../document/document.entity'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'

@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(
    private matchingService: MatchingService,
    private documentService: DocumentService,
    private jwtService: JwtService,
    @InjectRepository(Document) private docRepo: Repository<Document>,
  ) {}

  @Post('calculate')
  async calculate(@Body() body: { resumeDocId: string; jobDocId: string }) {
    const data = await this.matchingService.calculateMatch(body.resumeDocId, body.jobDocId)
    return { code: 200, message: '匹配完成', data }
  }

  @Post('recommend')
  async recommend(@CurrentUser() user: { id: string; role: string }) {
    const data = await this.matchingService.recommend(user.id, user.role)
    return { code: 200, message: 'ok', data }
  }

  @Get('results')
  async getResults(@CurrentUser() user: { id: string }) {
    const data = await this.matchingService.getResults(user.id)
    return { code: 200, message: 'ok', data }
  }

  @Get('results/:id')
  async getResult(@Param('id') id: string) {
    const data = await this.matchingService.getResult(id)
    return { code: 200, message: 'ok', data }
  }

  @Get('by-job/:jobDocId')
  async getByJob(@Param('jobDocId') jobDocId: string) {
    const data = await this.matchingService.getMatchesByJob(jobDocId)
    return { code: 200, message: 'ok', data }
  }

  @Get('by-resume/:resumeDocId')
  async getByResume(@Param('resumeDocId') resumeDocId: string) {
    const data = await this.matchingService.getMatchesByResume(resumeDocId)
    return { code: 200, message: 'ok', data }
  }

  // ── SSE: Stream a single match pair ──
  @Get('stream')
  async streamMatch(
    @Query('resumeId') resumeId: string,
    @Query('jobId') jobId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) { res.status(401).json({ code: 401, message: '缺少 token' }); return }
    try { this.jwtService.verify(token) } catch { res.status(401).json({ code: 401, message: 'token 无效' }); return }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    try {
      send('start', { resumeId, jobId })
      const result = await this.matchingService.calculateMatchStream(
        resumeId, jobId,
        (step) => send('progress', step),
        (agent, token) => send('chunk', { agent, token }),
        (agent, systemPrompt, userMessage) => send('prompt', { agent, systemPrompt, userMessage }),
      )
      send('complete', { matchId: result.id, overallScore: result.overallScore, confidence: result.llmAssessment?.confidence })
      send('result', result)
    } catch (err) {
      send('error', { message: (err as Error).message })
    } finally {
      res.end()
    }
  }

  // ── SSE: Stream all matches for a document ──
  @Get('stream-all')
  async streamAll(
    @Query('docId') docId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) { res.status(401).json({ code: 401, message: '缺少 token' }); return }
    try { this.jwtService.verify(token) } catch { res.status(401).json({ code: 401, message: 'token 无效' }); return }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    try {
      const doc = await this.documentService.findById(docId)
      const isResume = doc.docType === 'resume'

      // Find counterpart documents
      const others = await this.docRepo.find({ where: { docType: isResume ? 'job_description' : 'resume', status: 'parsed' } })

      send('start', { docId, filename: doc.originalFilename, docType: doc.docType, matchCount: others.length })

      for (const other of others) {
        const resumeId = isResume ? docId : other.id
        const jobId = isResume ? other.id : docId

        send('match_start', { resumeId, jobId, resumeFilename: isResume ? doc.originalFilename : other.originalFilename, jobFilename: isResume ? other.originalFilename : doc.originalFilename })

        try {
          const result = await this.matchingService.calculateMatchStream(
            resumeId, jobId,
            (step) => send('progress', { ...step, resumeId, jobId }),
            (agent, tok) => send('chunk', { agent, token: tok, resumeId, jobId }),
            (agent, sp, um) => send('prompt', { agent, systemPrompt: sp, userMessage: um, resumeId, jobId }),
          )
          send('match_complete', { matchId: result.id, overallScore: result.overallScore, confidence: result.llmAssessment?.confidence, resumeId, jobId })
        } catch (err) {
          send('match_error', { message: (err as Error).message, resumeId, jobId })
        }
      }

      send('complete', { total: others.length })
    } catch (err) {
      send('error', { message: (err as Error).message })
    } finally {
      res.end()
    }
  }
}
