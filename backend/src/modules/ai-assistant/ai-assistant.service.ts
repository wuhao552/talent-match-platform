import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { MatchResult } from '../matching/match-result.entity';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { User } from '../user/user.entity';
import { LlmService } from '../llm/llm.service';
import type { LlmAssessment } from '../matching/match-result.entity';

export interface InterviewContext {
  resumeDoc: Document;
  jobDoc: Document;
  resumeSkills: DocumentSkill[];
  jobSkills: DocumentSkill[];
  matchDetails: MatchResult['matchDetails'];
  llmAssessment: LlmAssessment | null;
}

export interface CoachContext {
  userSkills: Array<{
    name: string;
    proficiency: string;
    category?: string;
  }>;
  recentMatches: Array<{
    jobTitle: string;
    companyName?: string;
    overallFit: number;
    readinessMonths: number;
    gaps: string[];
    transferableSkills: Array<{
      candidateSkill: string;
      jobRequirement: string;
      transferability: string;
    }>;
  }>;
}

export interface ChatContext {
  contextText: string;
  docType: 'resume' | 'job_description' | 'match';
}

@Injectable()
export class AiAssistantService {
  constructor(
    @InjectRepository(MatchResult) private matchRepo: Repository<MatchResult>,
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(Skill) private skillRepo: Repository<Skill>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private llm: LlmService,
  ) {}

  /**
   * 列出当前用户可作为面试题生成上下文的匹配记录。
   * 优先返回带 llmAssessment 的、按时间倒序的最近 20 条。
   */
  async listMatchesForUser(userId: string): Promise<
    Array<{
      id: string;
      overallScore: number;
      resumeDocId: string;
      jobDocId: string;
      resumeFilename: string;
      jobFilename: string;
      hasLlmAssessment: boolean;
      createdAt: Date;
    }>
  > {
    // 先找出当前用户的所有 resume 文档
    const userDocs = await this.docRepo.find({
      where: { userId, docType: 'resume' },
      select: ['id', 'originalFilename'],
    });
    if (userDocs.length === 0) return [];

    const resumeIds = userDocs.map((d) => d.id);
    const resumeNameMap = new Map(
      userDocs.map((d) => [d.id, d.originalFilename]),
    );

    // 查询这些 resume 的匹配记录
    const matches = await this.matchRepo.find({
      where: { resumeDocId: In(resumeIds) },
      order: { createdAt: 'DESC' },
      take: 20,
      relations: ['jobDoc'],
    });

    // 过滤掉 stale 的（保留最新的非 stale 记录）
    const validMatches = matches.filter((m) => m.staleAt === null);

    return validMatches.map((m) => ({
      id: m.id,
      overallScore: Number(m.overallScore),
      resumeDocId: m.resumeDocId,
      jobDocId: m.jobDocId,
      resumeFilename: resumeNameMap.get(m.resumeDocId) || '未知简历',
      jobFilename: m.jobDoc?.originalFilename || '未知职位',
      hasLlmAssessment: m.llmAssessment !== null,
      createdAt: m.createdAt,
    }));
  }

  /**
   * 加载面试题生成所需的全部上下文(校验匹配归属,防止越权读取/消耗 LLM 配额)。
   */
  async loadInterviewContext(
    matchId: string,
    userId: string,
  ): Promise<InterviewContext> {
    const match = await this.matchRepo.findOne({
      where: { id: matchId },
      relations: ['resumeDoc', 'jobDoc'],
    });
    if (!match) throw new NotFoundException('匹配记录不存在');

    // 必须是自己简历的匹配或自己岗位的匹配
    if (match.resumeDoc?.userId !== userId && match.jobDoc?.userId !== userId) {
      throw new ForbiddenException('无权访问该匹配记录');
    }

    const [resumeSkills, jobSkills] = await Promise.all([
      this.dsRepo.find({
        where: { documentId: match.resumeDocId },
        relations: ['skill'],
      }),
      this.dsRepo.find({
        where: { documentId: match.jobDocId },
        relations: ['skill'],
      }),
    ]);

    return {
      resumeDoc: match.resumeDoc,
      jobDoc: match.jobDoc,
      resumeSkills,
      jobSkills,
      matchDetails: match.matchDetails || [],
      llmAssessment: match.llmAssessment,
    };
  }

  /**
   * 加载候选人 AI 教练所需的上下文：
   * - 用户最新解析过的 resume 的技能
   * - 最近 5 条带 llmAssessment 的匹配记录
   */
  async loadCoachContext(userId: string): Promise<CoachContext> {
    // 1. 用户最新的 resume 文档
    const latestResume = await this.docRepo.findOne({
      where: { userId, docType: 'resume', status: 'parsed' },
      order: { createdAt: 'DESC' },
    });

    let userSkills: CoachContext['userSkills'] = [];
    if (latestResume) {
      const dsList = await this.dsRepo.find({
        where: { documentId: latestResume.id },
        relations: ['skill'],
      });
      userSkills = dsList.map((ds) => ({
        name: ds.skill?.name || ds.skillName || '未知',
        proficiency: ds.proficiency,
        category: ds.skill?.category || ds.category || undefined,
      }));
    }

    // 2. 最近的匹配记录（带 llmAssessment 的优先）
    const resumeDocIds: string[] = [];
    if (latestResume) resumeDocIds.push(latestResume.id);
    // 也查用户所有 resume（万一 coach 想看跨简历的匹配历史）
    const allUserResumes = await this.docRepo.find({
      where: { userId, docType: 'resume' },
      select: ['id'],
    });
    for (const r of allUserResumes) {
      if (!resumeDocIds.includes(r.id)) resumeDocIds.push(r.id);
    }

    let recentMatches: CoachContext['recentMatches'] = [];
    if (resumeDocIds.length > 0) {
      const matches = await this.matchRepo.find({
        where: {
          resumeDocId: In(resumeDocIds),
          staleAt: IsNull(),
        },
        order: { createdAt: 'DESC' },
        take: 20,
        relations: ['jobDoc'],
      });

      // 只保留有 llmAssessment 的，最多 5 条
      const withAssessment = matches
        .filter((m) => m.llmAssessment !== null)
        .slice(0, 5);

      // 加载 job 所属公司
      const jobUserIds = Array.from(
        new Set(
          withAssessment
            .map((m) => m.jobDoc?.userId)
            .filter((id): id is string => !!id),
        ),
      );
      const companyMap = new Map<string, Pick<User, 'id' | 'companyName'>>();
      if (jobUserIds.length > 0) {
        const companies = await this.userRepo.find({
          where: { id: In(jobUserIds) },
          select: ['id', 'companyName'],
        });
        for (const c of companies) companyMap.set(c.id, c);
      }

      recentMatches = withAssessment.map((m) => {
        const a = m.llmAssessment!;
        const jobDoc = m.jobDoc;
        // 从 parsed_json 中尝试取出 jobTitle
        const jobTitle =
          (jobDoc?.parsedJson?.jobTitle as string) ||
          jobDoc?.originalFilename ||
          '未知职位';
        const companyName =
          jobDoc && companyMap.get(jobDoc.userId)?.companyName;
        return {
          jobTitle,
          companyName,
          overallFit: a.overallFit,
          readinessMonths: a.readinessMonths,
          gaps: a.gaps,
          transferableSkills: a.transferableSkills.map((t) => ({
            candidateSkill: t.candidateSkill,
            jobRequirement: t.jobRequirement,
            transferability: t.transferability,
          })),
        };
      });
    }

    return { userSkills, recentMatches };
  }

  /**
   * 加载聊天上下文：根据 contextType 和 contextId 拉取相关文档/匹配数据。
   */
  async loadChatContext(
    userId: string,
    contextType: 'resume' | 'job_description' | 'match',
    contextId: string,
  ): Promise<ChatContext> {
    if (contextType === 'match') {
      const match = await this.matchRepo.findOne({
        where: { id: contextId },
        relations: ['resumeDoc', 'jobDoc'],
      });
      if (!match) throw new NotFoundException('匹配记录不存在');

      // 验证用户对该匹配的访问权（必须是 resume 或 job 的所有者）
      const resumeOwner = match.resumeDoc?.userId;
      const jobOwner = match.jobDoc?.userId;
      if (userId !== resumeOwner && userId !== jobOwner) {
        throw new NotFoundException('无权访问该匹配');
      }

      const parts: string[] = [];
      parts.push('# 匹配概况');
      parts.push(`- 综合评分: ${Number(match.overallScore)}/100`);
      if (match.scoreBreakdown) {
        parts.push(
          `- 算法分: ${match.scoreBreakdown.algorithmScore}, LLM 分: ${match.scoreBreakdown.llmScore}`,
        );
      }
      if (match.llmAssessment) {
        const a = match.llmAssessment;
        parts.push('\n# LLM 深度评估');
        parts.push(`- 匹配度: ${a.overallFit}/100`);
        parts.push(`- 上手周期: ${a.readinessMonths} 个月`);
        parts.push(`- 置信度: ${(a.confidence * 100).toFixed(0)}%`);
        if (a.strengths.length > 0)
          parts.push(`- 优势:\n  - ${a.strengths.join('\n  - ')}`);
        if (a.gaps.length > 0)
          parts.push(`- 差距:\n  - ${a.gaps.join('\n  - ')}`);
        if (a.transferableSkills.length > 0) {
          parts.push('- 可迁移技能:');
          for (const t of a.transferableSkills)
            parts.push(
              `  - ${t.candidateSkill} → ${t.jobRequirement} [${t.transferability}]: ${t.reasoning}`,
            );
        }
        if (a.reasoning) parts.push(`- 评估理由: ${a.reasoning}`);
      }
      if (match.matchDetails && match.matchDetails.length > 0) {
        parts.push('\n# 技能匹配明细');
        for (const d of match.matchDetails.slice(0, 20))
          parts.push(
            `- ${d.skillName}: 候选人[${d.personProficiency}] → 要求[${d.jobRequirement}]${d.matchMethod ? ` (${d.matchMethod})` : ''}`,
          );
      }
      if (match.embeddingTrace && match.embeddingTrace.length > 0) {
        parts.push('\n# 语义匹配明细');
        for (const e of match.embeddingTrace.slice(0, 10))
          parts.push(
            `- ${e.jobSkill} ↔ ${e.bestMatch || '(无匹配)'} (相似度 ${e.similarity.toFixed(2)})`,
          );
      }
      return {
        contextText: parts.join('\n'),
        docType: 'match',
      };
    }

    // resume / job_description
    const doc = await this.docRepo.findOne({ where: { id: contextId } });
    if (!doc) throw new NotFoundException('文档不存在');
    if (doc.userId !== userId) {
      throw new NotFoundException('无权访问该文档');
    }

    const parts: string[] = [];
    parts.push(`# 文档信息`);
    parts.push(`- 类型: ${doc.docType === 'resume' ? '简历' : '岗位描述'}`);
    parts.push(`- 文件名: ${doc.originalFilename}`);
    parts.push(`- 状态: ${doc.status}`);

    if (doc.parsedJson) {
      parts.push('\n# 结构化解析结果');
      parts.push('```json');
      parts.push(JSON.stringify(doc.parsedJson, null, 2).slice(0, 3000));
      parts.push('```');
    }

    if (doc.parsedText) {
      parts.push('\n# 原始文本');
      parts.push(doc.parsedText.slice(0, 3000));
    }

    // 关联技能
    const skills = await this.dsRepo.find({
      where: { documentId: doc.id },
      relations: ['skill'],
    });
    if (skills.length > 0) {
      parts.push('\n# 解析到的技能');
      for (const s of skills.slice(0, 30))
        parts.push(
          `- ${s.skill?.name || s.skillName} [${s.proficiency}]${s.skill?.category ? ` (${s.skill.category})` : ''}`,
        );
    }

    return {
      contextText: parts.join('\n'),
      docType: doc.docType === 'resume' ? 'resume' : 'job_description',
    };
  }

  /**
   * 列出当前用户可作为聊天上下文的文档。
   */
  async listChatContexts(userId: string): Promise<
    Array<{
      id: string;
      type: 'resume' | 'job_description' | 'match';
      label: string;
      sublabel?: string;
    }>
  > {
    const docs = await this.docRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const contexts: Array<{
      id: string;
      type: 'resume' | 'job_description' | 'match';
      label: string;
      sublabel?: string;
    }> = docs.map((d) => ({
      id: d.id,
      type: d.docType === 'resume' ? 'resume' : 'job_description',
      label: d.originalFilename,
      sublabel: d.docType === 'resume' ? '我的简历' : '我的岗位描述',
    }));

    // 加上匹配记录
    const resumeIds = docs
      .filter((d) => d.docType === 'resume')
      .map((d) => d.id);
    if (resumeIds.length > 0) {
      const matches = await this.matchRepo.find({
        where: { resumeDocId: In(resumeIds), staleAt: IsNull() },
        order: { createdAt: 'DESC' },
        take: 10,
        relations: ['jobDoc'],
      });
      for (const m of matches) {
        contexts.push({
          id: m.id,
          type: 'match',
          label: `匹配: ${m.jobDoc?.originalFilename || '未知职位'}`,
          sublabel: `综合评分 ${Number(m.overallScore)}/100${m.llmAssessment ? '（含 LLM 评估）' : ''}`,
        });
      }
    }
    return contexts;
  }

  // ── 调用 LLM 的封装（暴露给 controller） ──

  async generateInterviewQuestions(
    ctx: InterviewContext,
    onChunk?: (token: string) => void,
  ) {
    return this.llm.generateInterviewQuestions(
      {
        resumeSkills: ctx.resumeSkills.map((ds) => ({
          name: ds.skill?.name || ds.skillName || '',
          proficiency: ds.proficiency,
        })),
        jobSkills: ctx.jobSkills.map((ds) => ({
          name: ds.skill?.name || ds.skillName || '',
          proficiency: ds.proficiency,
        })),
        matchDetails: ctx.matchDetails,
        llmAssessment: ctx.llmAssessment,
        resumeText: ctx.resumeDoc?.parsedText || '',
        jobText: ctx.jobDoc?.parsedText || '',
      },
      onChunk,
    );
  }

  async generateCoachAdvice(
    ctx: CoachContext,
    onChunk?: (token: string) => void,
  ) {
    return this.llm.generateCoachAdvice(ctx, onChunk);
  }

  async chatWithContext(
    ctx: ChatContext,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    onChunk?: (token: string) => void,
  ) {
    return this.llm.chatWithContext(
      { messages, contextText: ctx.contextText, docType: ctx.docType },
      onChunk,
    );
  }
}
