import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Res,
  Query,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DocumentService } from './document.service';
import type { PipelineStep } from '../../agents/orchestrator.agent';
import { v4 as uuid } from 'uuid';

function decodeFileName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

@Controller('documents')
export class DocumentController {
  constructor(
    private documentService: DocumentService,
    private jwtService: JwtService,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const name = `${uuid()}${extname(decodeFileName(file.originalname))}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx'];
        const ext = extname(decodeFileName(file.originalname)).toLowerCase();
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('仅支持 PDF、DOC、DOCX 格式'), false);
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
    @CurrentUser() user: { id: string },
  ) {
    const doc = await this.documentService.create(
      file,
      docType as 'resume' | 'job_description',
      user.id,
    );
    // 上传后由前端调用 /api/documents/:id/parse-stream 触发解析
    return { code: 200, message: '上传成功', data: doc };
  }

  @Post('upload-batch')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const name = `${uuid()}${extname(decodeFileName(file.originalname))}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx'];
        const ext = extname(decodeFileName(file.originalname)).toLowerCase();
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('仅支持 PDF、DOC、DOCX 格式'), false);
        }
      },
    }),
  )
  async uploadBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('docType') docType: string,
    @CurrentUser() user: { id: string },
  ) {
    const docs = await this.documentService.createBatch(
      files,
      docType as 'resume' | 'job_description',
      user.id,
    );
    return { code: 200, message: `成功上传 ${docs.length} 个文件`, data: docs };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: { id: string }) {
    const docs = await this.documentService.findByUser(user.id);
    return { code: 200, message: 'ok', data: docs };
  }

  @Get('skills/batch')
  @UseGuards(JwtAuthGuard)
  async getSkillsBatch(
    @Query('ids') ids: string | string[],
    @CurrentUser() user: { id: string },
  ) {
    const idList = Array.isArray(ids)
      ? ids
      : (ids || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    if (idList.length === 0) return { code: 200, message: 'ok', data: [] };
    // 校验全部文档归属,防止越权批量读取他人文档技能
    await this.documentService.assertOwnedBatch(idList, user.id);
    const skills = await this.documentService.getDocumentSkillsBatch(idList);
    return { code: 200, message: 'ok', data: skills };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    const doc = await this.documentService.findById(id, user.id);
    return { code: 200, message: 'ok', data: doc };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.documentService.delete(id, user.id);
    return { code: 200, message: '删除成功', data: null };
  }

  @Post(':id/parse')
  @UseGuards(JwtAuthGuard)
  async parse(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    // 校验文档归属后再触发解析
    await this.documentService.findById(id, user.id);
    // Fire-and-forget: parse in background, return immediately
    this.documentService
      .parseDocument(id)
      .catch((err) => console.error(`Parse failed for ${id}:`, err.message));
    return { code: 200, message: '解析任务已提交，请稍后刷新查看结果' };
  }

  @Get(':id/skills')
  @UseGuards(JwtAuthGuard)
  async getSkills(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.documentService.findById(id, user.id);
    const skills = await this.documentService.getDocumentSkills(id);
    return { code: 200, message: 'ok', data: skills };
  }

  // SSE 流式推送 Agent 流水线执行过程（token 通过 query 传入，因为 EventSource 不支持自定义 Header）
  @Get(':id/parse-stream')
  async parseStream(
    @Param('id') id: string,
    @Query('token') token: string,
    @Query('force') force: string,
    @Res() res: Response,
  ) {
    // Verify JWT manually (EventSource doesn't support custom headers)
    if (!token) {
      res.status(401).json({ code: 401, message: '缺少 token 参数' });
      return;
    }
    let userId: string;
    try {
      const payload = this.jwtService.verify(token);
      userId = payload.sub;
    } catch (err) {
      res
        .status(401)
        .json({ code: 401, message: 'token 无效: ' + (err as Error).message });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = (step: PipelineStep) => {
      send('progress', step);
    };

    const onChunk = (agent: string, token: string) => {
      send('chunk', { agent, token });
    };

    try {
      const doc = await this.documentService.findById(id, userId);
      send('start', { documentId: id, filename: doc.originalFilename, userId });

      // Skip re-parsing if already parsed (e.g. background parseDocument finished first)
      // unless force=true is requested (e.g. to re-extract skills)
      let result;
      if (doc.status === 'parsed' && force !== 'true') {
        result = {
          success: true,
          data: {
            parsedText: doc.parsedText,
            parsedJson: doc.parsedJson,
            extractedSkills: [],
            mappedSkills: [],
            unmatchedSkills: [],
            pipelineSteps: [],
          },
          summary: '已解析',
        };
      } else {
        result = await this.documentService.parseDocumentStream(
          id,
          onProgress,
          onChunk,
          force === 'true',
        );
      }

      send('complete', {
        success: result.success,
        skillCount: (result.data['extractedSkills'] as any[])?.length || 0,
        summary: result.summary,
      });

      // Send the full parsed doc as final data so frontend can update
      const updatedDoc = await this.documentService.findById(id);
      send('result', {
        status: updatedDoc.status,
        parsedJson: updatedDoc.parsedJson,
        parsedText: updatedDoc.parsedText,
      });
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }
}
