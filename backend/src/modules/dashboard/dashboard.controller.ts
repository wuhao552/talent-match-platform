import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { MatchingService } from '../matching/matching.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    private matchingService: MatchingService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getDashboard(@CurrentUser() user: { id: string; role: string }) {
    // 用户自己的文档
    const documents = await this.docRepo.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    const parsedIds = documents
      .filter((d) => d.status === 'parsed')
      .map((d) => d.id);

    if (parsedIds.length === 0) {
      return {
        code: 200,
        message: 'ok',
        data: { documents, skillsMap: {}, matches: [] },
      };
    }

    // 用户文档涉及的全部技能，按文档分组
    const allSkills = await this.dsRepo.find({
      where: { documentId: In(parsedIds) },
      relations: ['skill'],
    });
    const skillsMap: Record<string, DocumentSkill[]> = {};
    for (const s of allSkills) {
      (skillsMap[s.documentId] ??= []).push(s);
    }

    // 匹配结果富化逻辑统一复用 MatchingService，避免 Dashboard 重复实现
    const matches = await this.matchingService.getResults(user.id);
    matches.sort((a, b) => b.overallScore - a.overallScore);

    return {
      code: 200,
      message: 'ok',
      data: { documents, skillsMap, matches },
    };
  }
}
