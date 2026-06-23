import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { MatchResult } from '../matching/match-result.entity';
import { User } from '../user/user.entity';

interface EnrichedMatch {
  id: string;
  overallScore: number;
  scoreBreakdown: any;
  matchDetails: any;
  algorithmTrace: any;
  llmAssessment: any;
  createdAt: Date;
  resumeDocId: string;
  resumeFilename: string;
  candidateName: string;
  candidateCity: string;
  candidateTopSkills: string[];
  jobDocId: string;
  jobFilename: string;
  companyName: string;
  jobTitle: string;
  jobCity: string;
  jobTopSkills: string[];
}

@Controller('dashboard')
export class DashboardController {
  constructor(
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(MatchResult) private matchRepo: Repository<MatchResult>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getDashboard(
    @CurrentUser() user: { id: string; role: string },
  ) {
    const isIndividual = user.role === 'individual';

    // ── Query 1: 用户文档 ──
    const documents = await this.docRepo.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    const parsedIds = documents
      .filter((d) => d.status === 'parsed')
      .map((d) => d.id);

    // 没有已解析文档时直接返回
    if (parsedIds.length === 0) {
      return {
        code: 200,
        message: 'ok',
        data: { documents, skillsMap: {}, matches: [] },
      };
    }

    // 我方文档 ID（按角色筛选类型）
    const myDocIds = documents
      .filter((d) => d.status === 'parsed' && d.docType === (isIndividual ? 'resume' : 'job_description'))
      .map((d) => d.id);

    // ── Query 2 & 3: 技能 + 匹配结果（并行） ──
    const [allSkills, rawMatches] = await Promise.all([
      // 技能（含关联 skill 表，一次性查完）
      this.dsRepo.find({
        where: { documentId: In(parsedIds) },
        relations: ['skill'],
      }),
      // 匹配结果（直接查，不走 recommend 的冗余查询）
      myDocIds.length > 0
        ? this.matchRepo
            .createQueryBuilder('mr')
            .where(
              isIndividual
                ? 'mr.resumeDocId IN (:...myIds)'
                : 'mr.jobDocId IN (:...myIds)',
              { myIds: myDocIds },
            )
            .andWhere('mr.staleAt IS NULL')
            .orderBy('mr.overallScore', 'DESC')
            .getMany()
        : Promise.resolve([]),
    ]);

    // 按 documentId 分组技能
    const skillsMap: Record<string, DocumentSkill[]> = {};
    for (const s of allSkills) {
      (skillsMap[s.documentId] ??= []).push(s);
    }

    // 没有匹配结果时提前返回
    if (rawMatches.length === 0) {
      return {
        code: 200,
        message: 'ok',
        data: { documents, skillsMap, matches: [] },
      };
    }

    // ── Query 4 & 5: 对方文档 + 用户（并行） ──
    // 收集匹配结果中涉及的对方文档 ID 和所有用户 ID
    const otherDocIds = new Set<string>();
    const allUserIds = new Set<string>();

    for (const m of rawMatches) {
      otherDocIds.add(isIndividual ? m.jobDocId : m.resumeDocId);
    }
    // 从已有文档中收集用户 ID
    for (const d of documents) {
      if (d.userId) allUserIds.add(d.userId);
    }

    const [otherDocs, otherUsers] = await Promise.all([
      // 对方文档（我方文档已在 documents 中，不需要重复查）
      otherDocIds.size > 0
        ? this.docRepo.find({ where: { id: In([...otherDocIds]) } })
        : Promise.resolve([]),
      // 用户信息
      allUserIds.size > 0
        ? this.userRepo.findByIds([...allUserIds])
        : Promise.resolve([]),
    ]);

    // 对方文档中也可能有用户 ID
    for (const d of otherDocs) {
      if (d.userId) allUserIds.add(d.userId);
    }
    // 如果新增了用户 ID，再查一次（通常很少）
    const existingUserIds = new Set(otherUsers.map((u) => u.id));
    const missingUserIds = [...allUserIds].filter((id) => !existingUserIds.has(id));
    if (missingUserIds.length > 0) {
      const extraUsers = await this.userRepo.findByIds(missingUserIds);
      otherUsers.push(...extraUsers);
    }

    // ── 构建 Map ──
    const docMap = new Map<string, Document>();
    for (const d of documents) docMap.set(d.id, d);
    for (const d of otherDocs) docMap.set(d.id, d);

    const userMap = new Map(otherUsers.map((u) => [u.id, u]));

    const skillsByDoc = new Map<string, DocumentSkill[]>();
    for (const s of allSkills) {
      const arr = skillsByDoc.get(s.documentId) || [];
      arr.push(s);
      skillsByDoc.set(s.documentId, arr);
    }

    // ── 组装 EnrichedMatch ──
    const matches: EnrichedMatch[] = rawMatches.flatMap((r) => {
      const resumeDoc = docMap.get(r.resumeDocId);
      const jobDoc = docMap.get(r.jobDocId);
      if (!resumeDoc || !jobDoc) return [];

      const candidate = userMap.get(resumeDoc.userId);
      const company = userMap.get(jobDoc.userId);
      const jobParsed = (jobDoc.parsedJson as any)?.structured || {};
      const resumeParsed = (resumeDoc.parsedJson as any)?.structured || {};

      return [
        {
          id: r.id,
          overallScore: r.overallScore,
          scoreBreakdown: r.scoreBreakdown || null,
          matchDetails: r.matchDetails,
          algorithmTrace: r.algorithmTrace,
          llmAssessment: r.llmAssessment,
          createdAt: r.createdAt,
          resumeDocId: r.resumeDocId,
          resumeFilename: resumeDoc.originalFilename,
          candidateName: resumeParsed?.name || candidate?.username || '未知',
          candidateCity: candidate?.city || resumeParsed?.city || '',
          candidateTopSkills: (skillsByDoc.get(r.resumeDocId) || [])
            .slice(0, 6)
            .map((s) => s.skillName || s.skill?.name || '')
            .filter(Boolean),
          jobDocId: r.jobDocId,
          jobFilename: jobDoc.originalFilename,
          companyName:
            company?.companyName ||
            jobParsed?.companyName ||
            jobParsed?.company ||
            '',
          jobTitle:
            jobParsed?.jobTitle || jobParsed?.title || jobDoc.originalFilename,
          jobCity:
            company?.city || jobParsed?.location || jobParsed?.city || '',
          jobTopSkills: (skillsByDoc.get(r.jobDocId) || [])
            .slice(0, 6)
            .map((s) => s.skillName || s.skill?.name || '')
            .filter(Boolean),
        },
      ];
    });

    return {
      code: 200,
      message: 'ok',
      data: { documents, skillsMap, matches },
    };
  }
}
