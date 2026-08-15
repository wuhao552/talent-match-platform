import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MatchingService } from './matching.service';
import { DocumentService } from '../document/document.service';
import { Document } from '../document/document.entity';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

@Controller('matching')
export class MatchingController {
  constructor(
    private matchingService: MatchingService,
    private documentService: DocumentService,
    private jwtService: JwtService,
    @InjectRepository(Document) private docRepo: Repository<Document>,
  ) {}

  @Post('calculate')
  @UseGuards(JwtAuthGuard)
  async calculate(
    @Body() body: { resumeDocId: string; jobDocId: string },
    @CurrentUser() user: { id: string; role: string },
  ) {
    // 校验用户至少拥有简历或岗位中的一个文档,防止对任意文档触发 LLM 匹配
    await this.matchingService.assertPairAccess(
      body.resumeDocId,
      body.jobDocId,
      user.id,
      user.role,
    );
    const data = await this.matchingService.calculateMatch(
      body.resumeDocId,
      body.jobDocId,
    );
    return { code: 200, message: '匹配完成', data };
  }

  @Post('recommend')
  @UseGuards(JwtAuthGuard)
  async recommend(@CurrentUser() user: { id: string; role: string }) {
    const data = await this.matchingService.recommend(user.id, user.role);
    return { code: 200, message: 'ok', data };
  }

  @Get('results')
  @UseGuards(JwtAuthGuard)
  async getResults(@CurrentUser() user: { id: string }) {
    const data = await this.matchingService.getResults(user.id);
    return { code: 200, message: 'ok', data };
  }

  @Get('results/:id')
  @UseGuards(JwtAuthGuard)
  async getResult(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    await this.matchingService.assertResultAccess(id, user.id, user.role);
    const data = await this.matchingService.getResult(id);
    return { code: 200, message: 'ok', data };
  }

  @Get('by-job/:jobDocId')
  @UseGuards(JwtAuthGuard)
  async getByJob(
    @Param('jobDocId') jobDocId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    await this.matchingService.assertDocAccess(jobDocId, user.id, user.role);
    const data = await this.matchingService.getMatchesByJob(jobDocId);
    return { code: 200, message: 'ok', data };
  }

  @Get('by-resume/:resumeDocId')
  @UseGuards(JwtAuthGuard)
  async getByResume(
    @Param('resumeDocId') resumeDocId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    await this.matchingService.assertDocAccess(resumeDocId, user.id, user.role);
    const data = await this.matchingService.getMatchesByResume(resumeDocId);
    return { code: 200, message: 'ok', data };
  }

  // ── SSE: Single match pair (no JwtAuthGuard — token verified manually from query) ──
  @Get('stream')
  async streamMatch(
    @Query('resumeId') resumeId: string,
    @Query('jobId') jobId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      res.status(401).json({ code: 401, message: '缺少 token' });
      return;
    }
    let payload: { sub: string; role?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; role?: string }>(token);
    } catch {
      res.status(401).json({ code: 401, message: 'token 无效' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      // 校验用户至少拥有简历或岗位中的一个文档
      await this.matchingService.assertPairAccess(
        resumeId,
        jobId,
        payload.sub,
        payload.role,
      );
      send('start', { resumeId, jobId });
      const result = await this.matchingService.calculateMatchStream(
        resumeId,
        jobId,
        (step) => send('progress', step),
        (agent, token) => send('chunk', { agent, token }),
        (agent, systemPrompt, userMessage) =>
          send('prompt', { agent, systemPrompt, userMessage }),
      );
      send('complete', {
        matchId: result.id,
        overallScore: result.overallScore,
        confidence: result.llmAssessment?.confidence,
      });
      send('result', result);
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }

  // ── SSE: All matches for a document (no JwtAuthGuard — token verified manually from query) ──
  // 两阶段：算法分预筛 Top-3 → LLM 深度评估 → 最终分 = 算法分×0.5 + LLM分×0.5
  @Get('stream-all')
  async streamAll(
    @Query('docId') docId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      res.status(401).json({ code: 401, message: '缺少 token' });
      return;
    }
    let payload: { sub: string; role?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; role?: string }>(token);
    } catch {
      res.status(401).json({ code: 401, message: 'token 无效' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      // 校验文档归属,防止对任意文档触发完整 LLM 匹配流水线
      const doc = await this.documentService.findById(docId, payload.sub);
      const isResume = doc.docType === 'resume';

      // 阶段一：算法分预筛 Top-3
      const TOP_K = 3;
      const embeddingResults: Array<{
        jobSkill: string;
        bestMatch: string | null;
        similarity: number;
      }> = [];
      send('progress', {
        phase: 'algorithm_prefilter',
        label: '算法预筛',
        status: 'running',
        summary: `正在为所有候选计算算法技能匹配分...`,
      });
      const scored = await this.matchingService.getTopKByAlgorithmScore(
        docId,
        TOP_K,
        (step) => {
          send('progress', step);
          if (step.data?.jobSkill) {
            embeddingResults.push({
              jobSkill: step.data.jobSkill as string,
              bestMatch: (step.data.matchedResume as string) || null,
              similarity: (step.data.similarity as number) || 0,
            });
          }
        },
      );
      const candidates = scored.map((s) => s.doc);
      send('progress', {
        phase: 'algorithm_prefilter',
        label: '算法预筛',
        status: 'done',
        summary: `算法分排序完成，选出 Top-${candidates.length}`,
      });
      send('progress', {
        phase: 'embedding_matching',
        label: '语义匹配',
        status: 'done',
        summary: `${embeddingResults.filter((r) => r.bestMatch).length} 项语义匹配`,
        data: { embeddingResults },
      });

      send('start', {
        docId,
        filename: doc.originalFilename,
        docType: doc.docType,
        matchCount: candidates.length,
      });

      if (candidates.length === 0) {
        send('complete', { total: 0 });
        res.end();
        return;
      }

      // 发送预筛结果（算法分 + 维度拆解）
      for (let i = 0; i < scored.length; i++) {
        const s = scored[i];
        const resumeId = isResume ? docId : s.doc.id;
        const jobId = isResume ? s.doc.id : docId;
        send('match_start', {
          resumeId,
          jobId,
          resumeFilename: isResume
            ? doc.originalFilename
            : s.doc.originalFilename,
          jobFilename: isResume ? s.doc.originalFilename : doc.originalFilename,
          algorithmScore: s.score,
          algorithmDimensions: s.dimensions,
          rank: i + 1,
        });
      }

      // 阶段二：LLM 深度评估（≤3 个候选用并发逐对模式，否则并行 p-limit(3)）
      // 注意：此处每个候选都会独立发起一次 LLM 调用，确保评分有区分度。
      const BATCH_THRESHOLD = 3;

      if (candidates.length <= BATCH_THRESHOLD) {
        // 并发逐对模式：对每个候选发起独立的 LLM 调用并并发执行
        try {
          const results = await this.matchingService.calculateBatchMatchStream(
            doc,
            candidates,
            isResume,
            (step, resumeId, jobId) =>
              send('progress', { ...step, resumeId, jobId }),
            (agent, tok, resumeId, jobId) =>
              send('chunk', { agent, token: tok, resumeId, jobId }),
            (agent, sp, um, resumeId, jobId) =>
              send('prompt', {
                agent,
                systemPrompt: sp,
                userMessage: um,
                resumeId,
                jobId,
              }),
            embeddingResults,
          );
          for (const r of results) {
            send('match_complete', {
              matchId: r.id,
              overallScore: r.overallScore,
              confidence: r.llmAssessment?.confidence,
              resumeId: r.resumeId,
              jobId: r.jobId,
            });
          }
        } catch (err) {
          for (const other of candidates) {
            const resumeId = isResume ? docId : other.id;
            const jobId = isResume ? other.id : docId;
            send('match_error', {
              message: (err as Error).message,
              resumeId,
              jobId,
            });
          }
        }
      } else {
        // 并行模式：p-limit(3) 并发逐个评估
        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(3);

        await Promise.allSettled(
          candidates.map((other) =>
            limit(async () => {
              const resumeId = isResume ? docId : other.id;
              const jobId = isResume ? other.id : docId;
              try {
                const result = await this.matchingService.calculateMatchStream(
                  resumeId,
                  jobId,
                  (step) => send('progress', { ...step, resumeId, jobId }),
                  (agent, tok) =>
                    send('chunk', { agent, token: tok, resumeId, jobId }),
                  (agent, sp, um) =>
                    send('prompt', {
                      agent,
                      systemPrompt: sp,
                      userMessage: um,
                      resumeId,
                      jobId,
                    }),
                  embeddingResults,
                );
                send('match_complete', {
                  matchId: result.id,
                  overallScore: result.overallScore,
                  confidence: result.llmAssessment?.confidence,
                  resumeId,
                  jobId,
                });
              } catch (err) {
                send('match_error', {
                  message: (err as Error).message,
                  resumeId,
                  jobId,
                });
              }
            }),
          ),
        );
      }

      send('complete', { total: candidates.length });
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }
}
