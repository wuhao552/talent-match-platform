import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiAssistantService } from './ai-assistant.service';
import { ChatStreamDto } from './ai-assistant.dto';
import { verifySseUser, setupSse, sendSse } from '../../common/sse/sse.util';

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(
    private aiService: AiAssistantService,
    private jwtService: JwtService,
  ) {}

  // ── 数据加载端点（普通 REST，JwtAuthGuard 保护） ──

  /** 列出当前用户可作为面试题生成上下文的匹配记录 */
  @Get('interview-questions/matches')
  @UseGuards(JwtAuthGuard)
  async listMatchesForInterview(@CurrentUser() user: { id: string }) {
    const data = await this.aiService.listMatchesForUser(user.id);
    return { code: 200, message: 'ok', data };
  }

  /** 列出当前用户可作为聊天上下文的文档/匹配 */
  @Get('chat/contexts')
  @UseGuards(JwtAuthGuard)
  async listChatContexts(@CurrentUser() user: { id: string }) {
    const data = await this.aiService.listChatContexts(user.id);
    return { code: 200, message: 'ok', data };
  }

  // ── SSE 端点 1：面试题生成（EventSource 友好） ──
  // 事件流：start → chunk(多个) → result → complete / error
  @Get('interview-questions/stream')
  async streamInterviewQuestions(
    @Query('matchId') matchId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const user = verifySseUser(this.jwtService, token, res);
    if (!user) return;

    setupSse(res);
    const send = (event: string, data: unknown) => sendSse(res, event, data);

    try {
      if (!matchId) throw new Error('缺少 matchId 参数');

      const ctx = await this.aiService.loadInterviewContext(
        matchId,
        user.userId,
      );
      send('start', {
        matchId,
        resumeFilename: ctx.resumeDoc?.originalFilename,
        jobFilename: ctx.jobDoc?.originalFilename,
      });

      send('progress', {
        phase: 'generation',
        label: 'LLM 面试题生成',
        status: 'running',
        summary: '正在调用大模型生成定制面试题...',
      });

      const result = await this.aiService.generateInterviewQuestions(
        ctx,
        (tok) => send('chunk', { token: tok }),
      );

      send('progress', {
        phase: 'generation',
        label: 'LLM 面试题生成',
        status: 'done',
        summary: `已生成 ${result.questions.length} 道面试题`,
      });

      send('result', { questions: result.questions, raw: result.raw });
      send('complete', { count: result.questions.length });
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }

  // ── SSE 端点 2：候选人 AI 教练（EventSource 友好） ──
  @Get('coach/stream')
  async streamCoach(@Query('token') token: string, @Res() res: Response) {
    const user = verifySseUser(this.jwtService, token, res);
    if (!user) return;

    setupSse(res);
    const send = (event: string, data: unknown) => sendSse(res, event, data);

    try {
      const ctx = await this.aiService.loadCoachContext(user.userId);
      send('start', {
        skillCount: ctx.userSkills.length,
        matchCount: ctx.recentMatches.length,
      });

      if (ctx.userSkills.length === 0 && ctx.recentMatches.length === 0) {
        send('error', {
          message:
            '尚无足够的数据生成职业规划建议。请先上传简历并完成匹配评估后再来。',
        });
        res.end();
        return;
      }

      send('progress', {
        phase: 'coach_generation',
        label: 'AI 教练规划中',
        status: 'running',
        summary: '正在基于你的技能图谱和匹配历史生成职业成长计划...',
      });

      const result = await this.aiService.generateCoachAdvice(ctx, (tok) =>
        send('chunk', { token: tok }),
      );

      send('progress', {
        phase: 'coach_generation',
        label: 'AI 教练规划中',
        status: 'done',
        summary: `已生成 ${result.plan.shortTermGoals.length} 个短期目标、${result.plan.skillGapsToFill.length} 项补齐计划、${result.plan.learningPath.length} 步学习路径`,
      });

      send('result', { plan: result.plan, raw: result.raw });
      send('complete', { ok: true });
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }

  // ── SSE 端点 3：智能问答（POST + 流式响应，因 EventSource 不支持 body） ──
  // 用 fetch + ReadableStream 在前端消费
  @Post('chat/stream')
  @UseGuards(JwtAuthGuard)
  async streamChat(
    @Body()
    body: ChatStreamDto,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    setupSse(res);
    const send = (event: string, data: unknown) => sendSse(res, event, data);

    try {
      const ctx = await this.aiService.loadChatContext(
        user.id,
        body.contextType,
        body.contextId,
      );

      send('start', {
        contextType: ctx.docType,
        contextId: body.contextId,
      });

      send('progress', {
        phase: 'chat',
        label: 'AI 助手回答中',
        status: 'running',
        summary: '正在基于上下文生成回答...',
      });

      const reply = await this.aiService.chatWithContext(
        ctx,
        body.messages,
        (tok) => send('chunk', { token: tok }),
      );

      send('progress', {
        phase: 'chat',
        label: 'AI 助手回答中',
        status: 'done',
        summary: '回答完成',
      });

      send('result', { reply });
      send('complete', { ok: true });
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }
}
