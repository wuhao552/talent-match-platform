import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  MatchResult,
  MatchDetail,
  ScoreBreakdown,
  AlgorithmStep,
  LlmAssessment,
  EmbeddingTraceItem,
} from './match-result.entity';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { User } from '../user/user.entity';
import { mergeUnmatchedSkillsFromParsedJson } from '../skill/skill-display.utils';

export interface EnrichedMatch {
  id: string;
  overallScore: number;
  scoreBreakdown: ScoreBreakdown | null;
  matchDetails: MatchDetail[];
  algorithmTrace?: AlgorithmStep[] | null;
  embeddingTrace?: EmbeddingTraceItem[] | null;
  llmAssessment?: LlmAssessment | null;
  createdAt: Date;
  resumeDocId: string;
  resumeFilename: string;
  candidateName: string;
  candidateCity: string;
  candidateTopSkills: string[];
  /** 完整简历技能(含未匹配技能)，求职者/企业均可在匹配结果页查看 */
  resumeSkills: DocumentSkill[];
  jobDocId: string;
  jobFilename: string;
  companyName: string;
  jobTitle: string;
  jobCity: string;
  jobTopSkills: string[];
  /** 完整岗位技能(含未匹配技能)，求职者无需直接读取企业文档即可用于能力图谱 */
  jobSkills: DocumentSkill[];
  /** JD 结构化摘要(薪资/职责/要求/福利等),供匹配双方查看,无需访问对方文档 */
  jobStructured: Record<string, unknown> | null;
}

@Injectable()
export class MatchEnrichmentService {
  constructor(
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async enrichResults(results: MatchResult[]): Promise<EnrichedMatch[]> {
    if (results.length === 0) return [];

    const allDocIds = [
      ...new Set(results.flatMap((r) => [r.resumeDocId, r.jobDocId])),
    ];
    const [docs, allSkills] = await Promise.all([
      this.docRepo.findByIds(allDocIds),
      this.dsRepo.find({
        where: { documentId: In(allDocIds) },
        relations: ['skill'],
      }),
    ]);
    const docMap = new Map(docs.map((d) => [d.id, d]));
    const userIds = [...new Set(docs.map((d) => d.userId).filter(Boolean))];
    const users =
      userIds.length > 0 ? await this.userRepo.findByIds(userIds) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const savedSkillsByDoc = new Map<string, DocumentSkill[]>();
    for (const s of allSkills) {
      const a = savedSkillsByDoc.get(s.documentId) || [];
      a.push(s);
      savedSkillsByDoc.set(s.documentId, a);
    }

    // 补全历史文档中未落库的未匹配技能，能力图谱需要展示完整岗位/简历技能。
    const skillsByDoc = new Map<string, DocumentSkill[]>();
    for (const doc of docs) {
      const saved = savedSkillsByDoc.get(doc.id) || [];
      skillsByDoc.set(doc.id, mergeUnmatchedSkillsFromParsedJson(doc, saved));
    }

    return results.flatMap((r) => {
      const resumeDoc = docMap.get(r.resumeDocId);
      const jobDoc = docMap.get(r.jobDocId);
      if (!resumeDoc || !jobDoc) return [];

      const candidate = userMap.get(resumeDoc.userId);
      const company = userMap.get(jobDoc.userId);

      return [
        {
          id: r.id,
          overallScore: r.overallScore,
          scoreBreakdown: r.scoreBreakdown || null,
          matchDetails: r.matchDetails,
          algorithmTrace: r.algorithmTrace,
          embeddingTrace: r.embeddingTrace,
          llmAssessment: r.llmAssessment,
          createdAt: r.createdAt,
          resumeDocId: r.resumeDocId,
          resumeFilename: resumeDoc.originalFilename,
          candidateName:
            this.getStringField(resumeDoc.parsedJson, 'structured', 'name') ||
            candidate?.username ||
            '未知',
          candidateCity:
            candidate?.city ||
            this.getStringField(resumeDoc.parsedJson, 'structured', 'city') ||
            '',
          candidateTopSkills: (skillsByDoc.get(r.resumeDocId) || [])
            .slice(0, 6)
            .map((s) => s.skillName || s.skill?.name || '')
            .filter(Boolean),
          resumeSkills: skillsByDoc.get(r.resumeDocId) || [],
          jobDocId: r.jobDocId,
          jobFilename: jobDoc.originalFilename,
          companyName:
            company?.companyName ||
            this.getStringField(
              jobDoc.parsedJson,
              'structured',
              'companyName',
            ) ||
            this.getStringField(jobDoc.parsedJson, 'structured', 'company') ||
            '',
          jobTitle:
            this.getStringField(jobDoc.parsedJson, 'structured', 'jobTitle') ||
            this.getStringField(jobDoc.parsedJson, 'structured', 'title') ||
            jobDoc.originalFilename,
          jobCity:
            company?.city ||
            this.getStringField(jobDoc.parsedJson, 'structured', 'location') ||
            this.getStringField(jobDoc.parsedJson, 'structured', 'city') ||
            '',
          jobTopSkills: (skillsByDoc.get(r.jobDocId) || [])
            .slice(0, 6)
            .map((s) => s.skillName || s.skill?.name || '')
            .filter(Boolean),
          jobSkills: skillsByDoc.get(r.jobDocId) || [],
          // JD 结构化内容随匹配结果一起返回:求职者无权直接读取企业文档,
          // 但应能看到该岗位的完整信息(薪资/职责/要求/福利等)
          jobStructured:
            (
              jobDoc.parsedJson as {
                structured?: Record<string, unknown>;
              } | null
            )?.structured || null,
        },
      ];
    });
  }

  private getStringField(obj: unknown, ...keys: string[]): string | undefined {
    let current: unknown = obj;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return typeof current === 'string' ? current : undefined;
  }
}
