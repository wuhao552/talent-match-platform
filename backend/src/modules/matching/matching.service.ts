import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import {
  MatchResult,
  MatchDetail,
  ScoreBreakdown,
  AlgorithmStep,
  LlmAssessment,
} from './match-result.entity';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { User } from '../user/user.entity';
import { LlmMatchingService } from './llm-matching.service';
import { EmbeddingService } from '../llm/embedding.service';

// ── Interfaces ──

export interface EnrichedMatch {
  id: string;
  overallScore: number;
  scoreBreakdown: ScoreBreakdown | null;
  matchDetails: MatchDetail[];
  algorithmTrace?: AlgorithmStep[] | null;
  llmAssessment?: LlmAssessment | null;
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

/** Pre-loaded data to avoid per-pair DB queries in recommend() */
interface MatchPreload {
  docMap: Map<string, Document>;
  skillsByDoc: Map<string, DocumentSkill[]>;
  userMap: Map<string, User>;
  skillMetaMap: Map<number, Skill>;
}

// ── Service ──

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(MatchResult) private matchRepo: Repository<MatchResult>,
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Skill) private skillRepo: Repository<Skill>,
    private llmMatching: LlmMatchingService,
    private embeddingService: EmbeddingService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  //  Matching
  // ══════════════════════════════════════════════════════════════

  async calculateMatch(
    resumeDocId: string,
    jobDocId: string,
    preload?: MatchPreload,
  ): Promise<MatchResult> {
    try {
      return await this._graphRAGMatch(resumeDocId, jobDocId, preload);
    } catch (err) {
      console.error(
        `[Matching] calculateMatch FAILED resume=${resumeDocId?.slice(0, 8)} job=${jobDocId?.slice(0, 8)}:`,
        (err as Error).message,
      );
      return this.matchRepo.save(
        this.matchRepo.create({
          resumeDocId,
          jobDocId,
          overallScore: 0,
          skillMatchScore: 0,
          cityMatchBonus: 0,
          matchDetails: [],
          algorithmTrace: null,
          llmAssessment: null,
          scoreBreakdown: {
            algorithmScore: 0,
            llmScore: 0,
            overallScore: 0,
            matchStatus: 'fallback',
          },
        }),
      );
    }
  }

  /**
   * Streaming version — emits progress and LLM tokens via callbacks for SSE.
   */
  async calculateMatchStream(
    resumeDocId: string,
    jobDocId: string,
    onProgress: (step: {
      phase: string;
      label: string;
      status: string;
      summary: string;
      data?: Record<string, unknown>;
      durationMs?: number;
    }) => void,
    onChunk: (agent: string, token: string) => void,
    onPrompt?: (
      agent: string,
      systemPrompt: string,
      userMessage: string,
    ) => void,
  ): Promise<MatchResult> {
    const trace: AlgorithmStep[] = [];

    // ━━━ Step 1: Load data ━━━
    const t0 = Date.now();
    let resumeSkills: DocumentSkill[];
    let jobSkills: DocumentSkill[];
    let resumeDoc: Document | null;
    let jobDoc: Document | null;
    let skillMetaMap: Map<number, Skill>;
    let person: User | null = null;
    let company: User | null = null;

    onProgress({
      phase: 'data_loading',
      label: '数据加载',
      status: 'running',
      summary: '正在加载简历和职位数据...',
    });
    [resumeSkills, jobSkills, resumeDoc, jobDoc] = await Promise.all([
      this.dsRepo.find({
        where: { documentId: resumeDocId },
        relations: ['skill'],
      }),
      this.dsRepo.find({
        where: { documentId: jobDocId },
        relations: ['skill'],
      }),
      this.docRepo.findOne({ where: { id: resumeDocId } }),
      this.docRepo.findOne({ where: { id: jobDocId } }),
    ]);
    const allSkillIds = new Set<number>();
    for (const ds of resumeSkills) allSkillIds.add(ds.skillId);
    for (const ds of jobSkills) allSkillIds.add(ds.skillId);
    skillMetaMap = new Map<number, Skill>();
    if (allSkillIds.size > 0) {
      const skillEntities = await this.skillRepo.findBy({
        id: In([...allSkillIds]),
      });
      for (const s of skillEntities) skillMetaMap.set(s.id, s);
    }
    if (resumeDoc)
      person = await this.userRepo.findOne({ where: { id: resumeDoc.userId } });
    if (jobDoc)
      company = await this.userRepo.findOne({ where: { id: jobDoc.userId } });

    if (!resumeDoc || !jobDoc) throw new Error('Document not found');
    const dataStep: AlgorithmStep = {
      phase: 'data_loading',
      label: '数据加载',
      status: 'done',
      durationMs: Date.now() - t0,
      summary: `简历 ${resumeSkills.length} 项技能, 职位 ${jobSkills.length} 项技能`,
    };
    onProgress(dataStep);
    trace.push(dataStep);

    // ━━━ Step 2: Skill matching ━━━
    const t1 = Date.now();
    onProgress({
      phase: 'skill_matching',
      label: '技能匹配识别',
      status: 'running',
      summary: '正在识别匹配技能...',
    });
    const matchDetails: MatchDetail[] = [];
    const resumeById = new Map<number, DocumentSkill>();
    for (const ds of resumeSkills) resumeById.set(ds.skillId, ds);
    const jobById = new Map<number, DocumentSkill>();
    for (const ds of jobSkills) jobById.set(ds.skillId, ds);
    const usedResumeSkillIds = new Set<number>();
    const usedJobSkillIds = new Set<number>();

    for (const [skillId, jobSkill] of jobById) {
      if (resumeById.has(skillId)) {
        matchDetails.push({
          skillId,
          skillName:
            jobSkill.skillName || jobSkill.skill?.name || `skill-${skillId}`,
          personProficiency: resumeById.get(skillId)!.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: skillId,
          jobSkillId: skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        });
        usedResumeSkillIds.add(skillId);
        usedJobSkillIds.add(skillId);
      }
    }
    const resumeRemaining = resumeSkills.filter(
      (s) => !usedResumeSkillIds.has(s.skillId),
    );
    const jobRemaining = jobSkills.filter(
      (s) => !usedJobSkillIds.has(s.skillId),
    );
    const usedFuzzyResume = new Set<number>();
    for (const jobSkill of jobRemaining) {
      let best: { rs: DocumentSkill; sim: number } | null = null;
      for (const rs of resumeRemaining) {
        if (usedFuzzyResume.has(rs.skillId)) continue;
        // embedding 语义相似度
        let sim = 0;
        try {
          sim = await this.embeddingService.semanticSimilarity(
            jobSkill.skillName || '',
            rs.skillName || '',
          );
        } catch {
          // embedding API 失败时，保持 sim = 0
        }
        if (sim >= 0.5 && (!best || sim > best.sim)) best = { rs, sim };
      }
      if (best) {
        usedFuzzyResume.add(best.rs.skillId);
        matchDetails.push({
          skillId: -Math.round(best.sim * 100),
          skillName: `${best.rs.skillName || best.rs.skill?.name} ↔ ${jobSkill.skillName || jobSkill.skill?.name}`,
          personProficiency: best.rs.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: best.rs.skillId,
          jobSkillId: jobSkill.skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        });
        usedResumeSkillIds.add(best.rs.skillId);
        usedJobSkillIds.add(jobSkill.skillId);
      }
    }

    onProgress({
      phase: 'skill_matching',
      label: '技能匹配识别',
      status: 'done',
      durationMs: Date.now() - t1,
      summary: `${matchDetails.length} 项技能匹配 (ID: ${matchDetails.filter((d) => d.skillId > 0).length}, 模糊: ${matchDetails.filter((d) => d.skillId < 0).length})`,
      data: {
        matchDetails: matchDetails.map((d) => ({
          name: d.skillName,
          prof: d.personProficiency,
          req: d.jobRequirement,
        })),
      },
    });
    trace.push({
      phase: 'skill_matching',
      label: '技能匹配识别',
      status: 'done',
      durationMs: Date.now() - t1,
      summary: `${matchDetails.length} 项技能匹配 (ID: ${matchDetails.filter((d) => d.skillId > 0).length}, 模糊: ${matchDetails.filter((d) => d.skillId < 0).length})`,
    });

    // ━━━ Step 3: LLM Deep Assessment (streaming) ━━━
    const algoResult = this.calculateAlgorithmScore(
      matchDetails,
      resumeSkills,
      jobSkills,
    );
    let llmAssessment: LlmAssessment | null = null;
    try {
      const llmResult = await this.llmMatching.assessMatchStream(
        {
          resumeDoc,
          jobDoc,
          resumeSkills,
          jobSkills,
          skillMetaMap,
          person,
          company,
          matchDetails: matchDetails.map((d) => ({
            skillName: d.skillName,
            personProficiency: d.personProficiency,
            jobRequirement: d.jobRequirement,
          })),
        },
        (step) =>
          onProgress({ ...step, durationMs: step.data?.durationMs as number }),
        onChunk,
        onPrompt,
      );
      llmAssessment = llmResult.assessment;
      trace.push(llmResult.step);
    } catch (err) {
      onProgress({
        phase: 'llm_assessment',
        label: 'LLM 深度评估',
        status: 'error',
        summary: `评估失败: ${(err as Error).message}`,
      });
    }

    // ━━━ Step 4: Compose result ━━━
    const algorithmScore = algoResult.score;
    const llmScore = llmAssessment?.overallFit ?? 0;
    const overallScore = llmAssessment
      ? Math.round((algorithmScore * 0.5 + llmScore * 0.5) * 10) / 10
      : algorithmScore;
    const skillMatchScore =
      matchDetails.length > 0
        ? Math.min(
            100,
            (matchDetails.filter((d) => d.skillId > 0).length /
              Math.max(1, matchDetails.length)) *
              100,
          )
        : 0;
    const scoreBreakdown: ScoreBreakdown = {
      algorithmScore,
      llmScore,
      overallScore,
      matchStatus: llmAssessment ? 'computed' : 'fallback',
      algorithmDimensions: algoResult.dimensions,
    };
    trace.push({
      phase: 'result',
      label: '最终结果',
      status: 'done',
      durationMs: 0,
      summary: `算法分: ${algorithmScore.toFixed(1)}/100, LLM分: ${llmScore.toFixed(1)}/100, 最终: ${overallScore.toFixed(1)}/100`,
    });
    const entityData = {
      overallScore,
      skillMatchScore,
      cityMatchBonus: 0,
      matchDetails,
      scoreBreakdown,
      algorithmTrace: trace,
      llmAssessment,
    };

    let match = await this.matchRepo.findOne({
      where: { resumeDocId, jobDocId },
      order: { createdAt: 'DESC' },
    });
    if (match) {
      Object.assign(match, entityData, { staleAt: null });
      match = await this.matchRepo.save(match);
    } else {
      match = await this.matchRepo.save(
        this.matchRepo.create({ resumeDocId, jobDocId, ...entityData }),
      );
    }

    return match;
  }

  /**
   * 多文档对并发评估版本 — 对每个候选文档对独立发起一次 LLM 调用，且并发执行。
   * 预加载所有数据，对每个文档对运行算法匹配，随后逐对并发调用 LLM 评估。
   * 返回所有文档对的结果（顺序与入参一致）。
   */
  async calculateBatchMatchStream(
    sourceDoc: Document,
    candidates: Document[],
    isResume: boolean,
    onProgress: (
      step: {
        phase: string;
        label: string;
        status: string;
        summary: string;
        data?: Record<string, unknown>;
        durationMs?: number;
      },
      resumeId: string,
      jobId: string,
    ) => void,
    onChunk: (
      agent: string,
      token: string,
      resumeId: string,
      jobId: string,
    ) => void,
    onPrompt?: (
      agent: string,
      systemPrompt: string,
      userMessage: string,
      resumeId: string,
      jobId: string,
    ) => void,
  ): Promise<
    Array<{
      id: string;
      overallScore: number;
      llmAssessment: LlmAssessment | null;
      resumeId: string;
      jobId: string;
    }>
  > {
    const pairsInfo = candidates.map((other) => {
      const resumeDoc = isResume ? sourceDoc : other;
      const jobDoc = isResume ? other : sourceDoc;
      return { resumeDoc, jobDoc, resumeId: resumeDoc.id, jobId: jobDoc.id };
    });

    // ━━━ Step 1: Batch load all data ━━━
    const t0 = Date.now();
    for (const p of pairsInfo) {
      onProgress(
        {
          phase: 'data_loading',
          label: '数据加载',
          status: 'running',
          summary: '正在批量加载文档数据...',
        },
        p.resumeId,
        p.jobId,
      );
    }

    const allDocIds = [
      ...new Set(pairsInfo.flatMap((p) => [p.resumeDoc.id, p.jobDoc.id])),
    ];
    const userIds = [
      ...new Set(
        pairsInfo
          .flatMap((p) => [p.resumeDoc.userId, p.jobDoc.userId])
          .filter(Boolean),
      ),
    ];
    const [allDocSkills, allUsers] = await Promise.all([
      this.dsRepo.find({
        where: { documentId: In(allDocIds) },
        relations: ['skill'],
      }),
      userIds.length > 0
        ? this.userRepo.find({ where: { id: In(userIds) } })
        : Promise.resolve([]),
    ]);

    const skillsByDoc = new Map<string, DocumentSkill[]>();
    for (const s of allDocSkills) {
      const arr = skillsByDoc.get(s.documentId) || [];
      arr.push(s);
      skillsByDoc.set(s.documentId, arr);
    }

    const allSkillIds = new Set(allDocSkills.map((s) => s.skillId));
    const skillMetaMap = new Map<number, Skill>();
    if (allSkillIds.size > 0) {
      const entities = await this.skillRepo.findBy({
        id: In([...allSkillIds]),
      });
      for (const s of entities) skillMetaMap.set(s.id, s);
    }
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    for (const p of pairsInfo) {
      const resumeSkills = skillsByDoc.get(p.resumeDoc.id) || [];
      const jobSkills = skillsByDoc.get(p.jobDoc.id) || [];
      const dataStep: AlgorithmStep = {
        phase: 'data_loading',
        label: '数据加载',
        status: 'done',
        durationMs: Date.now() - t0,
        summary: `简历 ${resumeSkills.length} 项技能, 职位 ${jobSkills.length} 项技能`,
      };
      onProgress(dataStep, p.resumeId, p.jobId);
      // Stash trace on pairsInfo for later use
      (p as any).trace = [dataStep];
    }

    // ━━━ Step 2: Run algorithm matching for each pair ━━━
    interface BatchPairData {
      resumeDoc: Document;
      jobDoc: Document;
      resumeSkills: DocumentSkill[];
      jobSkills: DocumentSkill[];
      skillMetaMap: Map<number, Skill>;
      person: User | null;
      company: User | null;
      matchDetails: MatchDetail[];
      resumeId: string;
      jobId: string;
      trace: AlgorithmStep[];
    }
    const pairsData: BatchPairData[] = [];

    for (const p of pairsInfo) {
      const t1 = Date.now();
      onProgress(
        {
          phase: 'skill_matching',
          label: '技能匹配识别',
          status: 'running',
          summary: '正在识别匹配技能...',
        },
        p.resumeId,
        p.jobId,
      );

      const resumeSkills = skillsByDoc.get(p.resumeDoc.id) || [];
      const jobSkills = skillsByDoc.get(p.jobDoc.id) || [];
      const person = userMap.get(p.resumeDoc.userId) || null;
      const company = userMap.get(p.jobDoc.userId) || null;
      const matchDetails = await this.runSkillMatching(resumeSkills, jobSkills);
      const algoResult = this.calculateAlgorithmScore(
        matchDetails,
        resumeSkills,
        jobSkills,
      );

      const skillStep: AlgorithmStep = {
        phase: 'skill_matching',
        label: '技能匹配识别',
        status: 'done',
        durationMs: Date.now() - t1,
        summary: `${matchDetails.length} 项技能匹配 (ID: ${matchDetails.filter((d) => d.skillId > 0).length}, 模糊: ${matchDetails.filter((d) => d.skillId < 0).length}), 算法分: ${algoResult.score}`,
      };
      onProgress(skillStep, p.resumeId, p.jobId);

      pairsData.push({
        resumeDoc: p.resumeDoc,
        jobDoc: p.jobDoc,
        resumeSkills,
        jobSkills,
        skillMetaMap,
        person,
        company,
        matchDetails,
        resumeId: p.resumeId,
        jobId: p.jobId,
        trace: [...((p as any).trace || []), skillStep],
      });
    }

    // ━━━ Step 3: LLM assessment (per-pair) ━━━
    // assessBatchStream 现在对每个文档对独立发起一次 LLM 调用。为了让每对的进度/流式 token/
    // prompt 都正确路由到前端对应的匹配卡片，需要把回调绑定到具体的 resumeId/jobId。
    const llmResults = await this.llmMatching.assessBatchStream(
      pairsData.map((p) => ({
        resumeDoc: p.resumeDoc,
        jobDoc: p.jobDoc,
        resumeSkills: p.resumeSkills,
        jobSkills: p.jobSkills,
        skillMetaMap: p.skillMetaMap,
        person: p.person,
        company: p.company,
        matchDetails: p.matchDetails.map((d) => ({
          skillName: d.skillName,
          personProficiency: d.personProficiency,
          jobRequirement: d.jobRequirement,
        })),
        resumeId: p.resumeId,
        jobId: p.jobId,
      })),
      (step, resumeId, jobId) => onProgress(step, resumeId, jobId),
      (agent, token, resumeId, jobId) => onChunk(agent, token, resumeId, jobId),
      onPrompt
        ? (agent, systemPrompt, userMessage, resumeId, jobId) =>
            onPrompt(agent, systemPrompt, userMessage, resumeId, jobId)
        : undefined,
    );

    // ━━━ Step 4: Save all results ━━━
    const results: Array<{
      id: string;
      overallScore: number;
      llmAssessment: LlmAssessment | null;
      resumeId: string;
      jobId: string;
    }> = [];

    for (let i = 0; i < pairsData.length; i++) {
      const p = pairsData[i];
      const llmResult = llmResults[i];
      const llmAssessment = llmResult?.assessment || null;

      const algoResult = this.calculateAlgorithmScore(
        p.matchDetails,
        p.resumeSkills,
        p.jobSkills,
      );
      const algorithmScore = algoResult.score;
      const llmScore = llmAssessment?.overallFit ?? 0;
      const overallScore = llmAssessment
        ? Math.round((algorithmScore * 0.5 + llmScore * 0.5) * 10) / 10
        : algorithmScore;
      const skillMatchScore =
        p.matchDetails.length > 0
          ? Math.min(
              100,
              (p.matchDetails.filter((d) => d.skillId > 0).length /
                Math.max(1, p.matchDetails.length)) *
                100,
            )
          : 0;
      const scoreBreakdown: ScoreBreakdown = {
        algorithmScore,
        llmScore,
        overallScore,
        matchStatus: llmAssessment ? 'computed' : 'fallback',
        algorithmDimensions: algoResult.dimensions,
      };

      // Build complete trace: data_loading → skill_matching → llm_assessment → result
      const trace: AlgorithmStep[] = [...p.trace];
      if (llmResult) trace.push(llmResult.step);
      trace.push({
        phase: 'result',
        label: '最终结果',
        status: 'done',
        durationMs: 0,
        summary: `算法分: ${algorithmScore.toFixed(1)}/100, LLM分: ${llmScore.toFixed(1)}/100, 最终: ${overallScore.toFixed(1)}/100`,
      });

      const entityData = {
        overallScore,
        skillMatchScore,
        cityMatchBonus: 0,
        matchDetails: p.matchDetails,
        scoreBreakdown,
        algorithmTrace: trace,
        llmAssessment,
      };

      let match = await this.matchRepo.findOne({
        where: { resumeDocId: p.resumeId, jobDocId: p.jobId },
        order: { createdAt: 'DESC' },
      });
      if (match) {
        Object.assign(match, entityData, { staleAt: null });
        match = await this.matchRepo.save(match);
      } else {
        match = await this.matchRepo.save(
          this.matchRepo.create({
            resumeDocId: p.resumeId,
            jobDocId: p.jobId,
            ...entityData,
          }),
        );
      }

      results.push({
        id: match.id,
        overallScore,
        llmAssessment,
        resumeId: p.resumeId,
        jobId: p.jobId,
      });
    }

    return results;
  }

  private async _graphRAGMatch(
    resumeDocId: string,
    jobDocId: string,
    preload?: MatchPreload,
  ): Promise<MatchResult> {
    const trace: AlgorithmStep[] = [];

    // ━━━ Step 1: Load data ━━━
    const t0 = Date.now();
    let resumeSkills: DocumentSkill[];
    let jobSkills: DocumentSkill[];
    let resumeDoc: Document | null;
    let jobDoc: Document | null;
    let skillMetaMap: Map<number, Skill>;
    let person: User | null = null;
    let company: User | null = null;

    if (preload) {
      resumeSkills = preload.skillsByDoc.get(resumeDocId) || [];
      jobSkills = preload.skillsByDoc.get(jobDocId) || [];
      resumeDoc = preload.docMap.get(resumeDocId) || null;
      jobDoc = preload.docMap.get(jobDocId) || null;
      skillMetaMap = preload.skillMetaMap;
      if (resumeDoc) person = preload.userMap.get(resumeDoc.userId) || null;
      if (jobDoc) company = preload.userMap.get(jobDoc.userId) || null;
    } else {
      [resumeSkills, jobSkills, resumeDoc, jobDoc] = await Promise.all([
        this.dsRepo.find({
          where: { documentId: resumeDocId },
          relations: ['skill'],
        }),
        this.dsRepo.find({
          where: { documentId: jobDocId },
          relations: ['skill'],
        }),
        this.docRepo.findOne({ where: { id: resumeDocId } }),
        this.docRepo.findOne({ where: { id: jobDocId } }),
      ]);
      const allSkillIds = new Set<number>();
      for (const ds of resumeSkills) allSkillIds.add(ds.skillId);
      for (const ds of jobSkills) allSkillIds.add(ds.skillId);
      skillMetaMap = new Map<number, Skill>();
      if (allSkillIds.size > 0) {
        const skillEntities = await this.skillRepo.findBy({
          id: In([...allSkillIds]),
        });
        for (const s of skillEntities) skillMetaMap.set(s.id, s);
      }
      if (resumeDoc)
        person = await this.userRepo.findOne({
          where: { id: resumeDoc.userId },
        });
      if (jobDoc)
        company = await this.userRepo.findOne({ where: { id: jobDoc.userId } });
    }

    if (!resumeDoc || !jobDoc) throw new Error('Document not found');

    trace.push({
      phase: 'data_loading',
      label: '数据加载',
      status: 'done',
      durationMs: Date.now() - t0,
      summary: `简历 ${resumeSkills.length} 项技能, 职位 ${jobSkills.length} 项技能`,
    });

    // ━━━ Step 2: Identify matching skills ━━━
    const t1 = Date.now();
    const matchDetails: MatchDetail[] = [];

    const resumeById = new Map<number, DocumentSkill>();
    for (const ds of resumeSkills) resumeById.set(ds.skillId, ds);
    const jobById = new Map<number, DocumentSkill>();
    for (const ds of jobSkills) jobById.set(ds.skillId, ds);

    const usedResumeSkillIds = new Set<number>();
    const usedJobSkillIds = new Set<number>();

    // 2a: ID-based
    for (const [skillId, jobSkill] of jobById) {
      if (resumeById.has(skillId)) {
        matchDetails.push({
          skillId,
          skillName:
            jobSkill.skillName || jobSkill.skill?.name || `skill-${skillId}`,
          personProficiency: resumeById.get(skillId)!.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: skillId,
          jobSkillId: skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        });
        usedResumeSkillIds.add(skillId);
        usedJobSkillIds.add(skillId);
      }
    }

    // 2b: Fuzzy match
    const resumeRemaining = resumeSkills.filter(
      (s) => !usedResumeSkillIds.has(s.skillId),
    );
    const jobRemaining = jobSkills.filter(
      (s) => !usedJobSkillIds.has(s.skillId),
    );
    const usedFuzzyResume = new Set<number>();

    for (const jobSkill of jobRemaining) {
      let best: { rs: DocumentSkill; sim: number } | null = null;
      for (const rs of resumeRemaining) {
        if (usedFuzzyResume.has(rs.skillId)) continue;
        // embedding 语义相似度
        let sim = 0;
        try {
          sim = await this.embeddingService.semanticSimilarity(
            jobSkill.skillName || '',
            rs.skillName || '',
          );
        } catch {
          // embedding API 失败时，保持 sim = 0
        }
        if (sim >= 0.5 && (!best || sim > best.sim)) best = { rs, sim };
      }
      if (best) {
        usedFuzzyResume.add(best.rs.skillId);
        matchDetails.push({
          skillId: -Math.round(best.sim * 100),
          skillName: `${best.rs.skillName || best.rs.skill?.name} ↔ ${jobSkill.skillName || jobSkill.skill?.name}`,
          personProficiency: best.rs.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: best.rs.skillId,
          jobSkillId: jobSkill.skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        });
        usedResumeSkillIds.add(best.rs.skillId);
        usedJobSkillIds.add(jobSkill.skillId);
      }
    }

    trace.push({
      phase: 'skill_matching',
      label: '技能匹配识别',
      status: 'done',
      durationMs: Date.now() - t1,
      summary: `${matchDetails.length} 项技能匹配 (ID: ${matchDetails.filter((d) => d.skillId > 0).length}, 模糊: ${matchDetails.filter((d) => d.skillId < 0).length})`,
      data: {
        unmatchedJobSkills: jobRemaining
          .filter((s) => !usedJobSkillIds.has(s.skillId))
          .map((s) => s.skillName || s.skill?.name),
      },
    });

    // ━━━ Step 3: LLM Deep Assessment ━━━
    const algoResult = this.calculateAlgorithmScore(
      matchDetails,
      resumeSkills,
      jobSkills,
    );
    let llmAssessment: LlmAssessment | null = null;

    try {
      const llmResult = await this.llmMatching.assessMatch({
        resumeDoc,
        jobDoc,
        resumeSkills,
        jobSkills,
        skillMetaMap,
        person,
        company,
        matchDetails: matchDetails.map((d) => ({
          skillName: d.skillName,
          personProficiency: d.personProficiency,
          jobRequirement: d.jobRequirement,
        })),
      });
      llmAssessment = llmResult.assessment;
      trace.push(llmResult.step);
    } catch (err) {
      console.error(
        `[Matching] LLM assessment failed:`,
        (err as Error).message,
      );
      trace.push({
        phase: 'llm_assessment',
        label: 'LLM 深度评估',
        status: 'error',
        durationMs: 0,
        summary: `评估失败: ${(err as Error).message}`,
      });
    }

    // ━━━ Step 4: Compose result ━━━
    const algorithmScore = algoResult.score;
    const llmScore = llmAssessment?.overallFit ?? 0;
    const overallScore = llmAssessment
      ? Math.round((algorithmScore * 0.5 + llmScore * 0.5) * 10) / 10
      : algorithmScore;
    const skillMatchScore =
      matchDetails.length > 0
        ? Math.min(
            100,
            (matchDetails.filter((d) => d.skillId > 0).length /
              Math.max(1, matchDetails.length)) *
              100,
          )
        : 0;
    const scoreBreakdown: ScoreBreakdown = {
      algorithmScore,
      llmScore,
      overallScore,
      matchStatus: llmAssessment ? 'computed' : 'fallback',
      algorithmDimensions: algoResult.dimensions,
    };

    trace.push({
      phase: 'result',
      label: '最终结果',
      status: 'done',
      durationMs: 0,
      summary: `算法分: ${algorithmScore.toFixed(1)}/100, LLM分: ${llmScore.toFixed(1)}/100, 最终: ${overallScore.toFixed(1)}/100`,
    });

    console.log(
      `[Matching] resume=${resumeDocId.slice(0, 8)} job=${jobDocId.slice(0, 8)} | skills=${matchDetails.length} | score=${overallScore.toFixed(1)} | confidence=${llmAssessment?.confidence?.toFixed(2) || 'N/A'}`,
    );

    const entityData = {
      overallScore,
      skillMatchScore,
      cityMatchBonus: 0,
      matchDetails,
      scoreBreakdown,
      algorithmTrace: trace,
      llmAssessment,
    };

    const match = await this.matchRepo.findOne({
      where: { resumeDocId, jobDocId },
      order: { createdAt: 'DESC' },
    });
    if (match) {
      Object.assign(match, entityData, { staleAt: null });
      return this.matchRepo.save(match);
    }
    return this.matchRepo.save(
      this.matchRepo.create({ resumeDocId, jobDocId, ...entityData }),
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  Recommend (single method for both roles)
  // ══════════════════════════════════════════════════════════════

  async recommend(userId: string, userRole: string): Promise<EnrichedMatch[]> {
    const isIndividual = userRole === 'individual';

    const myDocs = await this.docRepo.find({
      where: {
        userId,
        docType: isIndividual ? 'resume' : 'job_description',
        status: 'parsed',
      },
    });
    if (myDocs.length === 0) return [];

    const otherDocs = await this.docRepo.find({
      where: {
        docType: isIndividual ? 'job_description' : 'resume',
        status: 'parsed',
      },
    });
    if (otherDocs.length === 0) return [];

    const myIds = myDocs.map((d) => d.id);
    const otherIds = otherDocs.map((d) => d.id);

    // Cached matches
    const existingMatches = await this.matchRepo
      .createQueryBuilder('mr')
      .where(
        'mr.resumeDocId IN (:...resumeIds) AND mr.jobDocId IN (:...jobIds)',
        {
          resumeIds: isIndividual ? myIds : otherIds,
          jobIds: isIndividual ? otherIds : myIds,
        },
      )
      .andWhere('mr.staleAt IS NULL')
      .orderBy('mr.createdAt', 'DESC')
      .getMany();

    const matchCache = new Map<string, MatchResult>();
    for (const m of existingMatches) {
      const key = `${m.resumeDocId}-${m.jobDocId}`;
      if (!matchCache.has(key)) matchCache.set(key, m);
    }

    // Separate cached from missing
    const results: MatchResult[] = [];

    for (const my of myDocs) {
      for (const other of otherDocs) {
        const resumeId = isIndividual ? my.id : other.id;
        const jobId = isIndividual ? other.id : my.id;
        const key = `${resumeId}-${jobId}`;
        const cached = matchCache.get(key);
        if (cached) results.push(cached);
      }
    }

    // NOTE: Missing pairs are not computed here — LLM calls are too slow for a
    // dashboard list. They should be computed via the Pipeline page (streaming).

    return this.enrichResults(
      results.sort((a, b) => b.overallScore - a.overallScore),
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  Algorithm pre-filter
  // ══════════════════════════════════════════════════════════════

  /**
   * 算法分预筛：为所有候选文档计算算法技能匹配分，返回 Top-K。
   * 替代向量预筛，更准确且不依赖向量数据。
   */
  async getTopKByAlgorithmScore(
    docId: string,
    k: number,
  ): Promise<
    Array<{
      doc: Document;
      score: number;
      dimensions: {
        coverage: number;
        adequacy: number;
      };
    }>
  > {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) return [];

    const isResume = doc.docType === 'resume';
    const others = await this.docRepo.find({
      where: {
        docType: isResume ? 'job_description' : 'resume',
        status: 'parsed',
      },
    });
    if (others.length === 0) return [];

    // 加载源文档技能
    const mySkills = await this.dsRepo.find({
      where: { documentId: docId },
      relations: ['skill'],
    });

    // 分批加载候选文档技能
    const BATCH_SIZE = 50;
    const scored: Array<{
      doc: Document;
      score: number;
      dimensions: {
        coverage: number;
        adequacy: number;
      };
    }> = [];

    for (let i = 0; i < others.length; i += BATCH_SIZE) {
      const batch = others.slice(i, i + BATCH_SIZE);
      const batchSkills = await this.dsRepo.find({
        where: { documentId: In(batch.map((d) => d.id)) },
        relations: ['skill'],
      });

      const batchMap = new Map<string, DocumentSkill[]>();
      for (const s of batchSkills) {
        const arr = batchMap.get(s.documentId) || [];
        arr.push(s);
        batchMap.set(s.documentId, arr);
      }

      for (const otherDoc of batch) {
        const otherSkills = batchMap.get(otherDoc.id) || [];
        const resumeSkills = isResume ? mySkills : otherSkills;
        const jobSkills = isResume ? otherSkills : mySkills;
        const matchDetails = await this.runSkillMatching(resumeSkills, jobSkills);
        const result = this.calculateAlgorithmScore(
          matchDetails,
          resumeSkills,
          jobSkills,
        );
        scored.push({
          doc: otherDoc,
          score: result.score,
          dimensions: result.dimensions,
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  // ══════════════════════════════════════════════════════════════
  //  CRUD / Query
  // ══════════════════════════════════════════════════════════════

  private async buildPreload(
    allDocIds: string[],
    docs: Document[],
  ): Promise<MatchPreload> {
    const [allSkills, allUsers] = await Promise.all([
      this.dsRepo.find({
        where: { documentId: In(allDocIds) },
        relations: ['skill'],
      }),
      this.userRepo.find({
        where: {
          id: In([...new Set(docs.map((d) => d.userId).filter(Boolean))]),
        },
      }),
    ]);
    const skillsByDoc = new Map<string, DocumentSkill[]>();
    for (const s of allSkills) {
      const arr = skillsByDoc.get(s.documentId) || [];
      arr.push(s);
      skillsByDoc.set(s.documentId, arr);
    }
    const allSkillIds = new Set(allSkills.map((s) => s.skillId));
    const skillMetaMap = new Map<number, Skill>();
    if (allSkillIds.size > 0) {
      const entities = await this.skillRepo.findBy({
        id: In([...allSkillIds]),
      });
      for (const s of entities) skillMetaMap.set(s.id, s);
    }
    return {
      docMap: new Map(docs.map((d) => [d.id, d])),
      skillsByDoc,
      userMap: new Map(allUsers.map((u) => [u.id, u])),
      skillMetaMap,
    };
  }

  async getResults(userId: string): Promise<EnrichedMatch[]> {
    const results = await this.matchRepo
      .createQueryBuilder('mr')
      .leftJoinAndSelect('mr.resumeDoc', 'resume')
      .leftJoinAndSelect('mr.jobDoc', 'job')
      .where('resume.userId = :userId', { userId })
      .orWhere('job.userId = :userId', { userId })
      .orderBy('mr.createdAt', 'DESC')
      .getMany();
    const seen = new Set<string>();
    return this.enrichResults(
      results.filter((r) => {
        const k = `${r.resumeDocId}-${r.jobDocId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    );
  }

  async getResult(id: string): Promise<EnrichedMatch> {
    const [enriched] = await this.enrichResults([
      await this.matchRepo.findOneOrFail({ where: { id } }),
    ]);
    return enriched;
  }

  async getMatchesByJob(jobDocId: string): Promise<EnrichedMatch[]> {
    return this.enrichResults(
      (await this.matchRepo.find({ where: { jobDocId } })).sort(
        (a, b) => b.overallScore - a.overallScore,
      ),
    );
  }

  async getMatchesByResume(resumeDocId: string): Promise<EnrichedMatch[]> {
    return this.enrichResults(
      (await this.matchRepo.find({ where: { resumeDocId } })).sort(
        (a, b) => b.overallScore - a.overallScore,
      ),
    );
  }

  async invalidateByDocument(documentId: string): Promise<void> {
    await this.matchRepo
      .createQueryBuilder()
      .update()
      .set({ staleAt: () => 'NOW()' })
      .where('resumeDocId = :id OR jobDocId = :id', { id: documentId })
      .execute();
  }

  /**
   * 文档解析完成后自动触发匹配：算法预筛 Top-K → LLM 深度评估。
   * 跳过已有非 stale 结果的文档对，避免重复计算。
   * 包含延迟重试机制：批量上传时，对方文档可能还在解析中，
   * 延迟后重试可以等到对方文档就绪。
   */
  async autoMatchAfterParse(docId: string, retryCount = 0): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc || doc.status !== 'parsed') return;

    const TOP_K = 3;
    const scored = await this.getTopKByAlgorithmScore(docId, TOP_K);

    // 如果没有候选且还有重试次数，延迟后重试（等待同批文档解析完成）
    if (scored.length === 0 && retryCount < 3) {
      const delay = (retryCount + 1) * 5000; // 5s, 10s, 15s
      console.log(
        `[AutoMatch] No candidates for ${docId.slice(0, 8)}, retry ${retryCount + 1}/3 in ${delay / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return this.autoMatchAfterParse(docId, retryCount + 1);
    }

    if (scored.length === 0) return;

    const isResume = doc.docType === 'resume';

    for (const s of scored) {
      const resumeId = isResume ? docId : s.doc.id;
      const jobId = isResume ? s.doc.id : docId;

      // 跳过已有有效结果的文档对
      const existing = await this.matchRepo.findOne({
        where: { resumeDocId: resumeId, jobDocId: jobId, staleAt: IsNull() },
      });
      if (existing) continue;

      try {
        await this.calculateMatch(resumeId, jobId);
      } catch (err) {
        console.error(
          `[AutoMatch] FAILED resume=${resumeId?.slice(0, 8)} job=${jobId?.slice(0, 8)}:`,
          (err as Error).message,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  Enrichment
  // ══════════════════════════════════════════════════════════════

  private async enrichResults(
    results: MatchResult[],
  ): Promise<EnrichedMatch[]> {
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
    const skillsByDoc = new Map<string, DocumentSkill[]>();
    for (const s of allSkills) {
      const a = skillsByDoc.get(s.documentId) || [];
      a.push(s);
      skillsByDoc.set(s.documentId, a);
    }

    return results.flatMap((r) => {
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
  }

  // ══════════════════════════════════════════════════════════════
  //  Algorithm Scoring
  // ══════════════════════════════════════════════════════════════

  private static readonly PROFICIENCY_LEVEL: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  };

  /**
   * 计算算法技能匹配分（双维度）。
   *
   * coverage(60%): 技能覆盖率 — 岗位技能被匹配的比例
   * adequacy(40%): 熟练度达标率 — 匹配项的熟练度是否达标
   */
  calculateAlgorithmScore(
    matchDetails: MatchDetail[],
    resumeSkills: DocumentSkill[],
    jobSkills: DocumentSkill[],
  ): {
    score: number;
    dimensions: {
      coverage: number;
      adequacy: number;
    };
  } {
    // ── 维度一：技能覆盖率 (60%) ──
    // 每个岗位技能等权，精确匹配计1.0，模糊匹配计相似度
    let coverageSum = 0;
    for (const js of jobSkills) {
      const detail = matchDetails.find((d) => d.jobSkillId === js.skillId);
      if (detail) {
        coverageSum += detail.skillId > 0
          ? 1.0
          : Math.abs(detail.skillId) / 100;
      }
    }
    const coverage = jobSkills.length > 0 ? coverageSum / jobSkills.length : 0;

    // ── 维度二：熟练度达标率 (40%) ──
    // 对每对匹配，计算候选人级别/岗位要求级别，上限1.0
    // unknown 默认 intermediate(2)，避免该维度失效
    let adequacySum = 0;
    let adequacyCount = 0;
    for (const d of matchDetails) {
      const candLevel =
        MatchingService.PROFICIENCY_LEVEL[d.personProficiency] ?? 2;
      const reqLevel =
        MatchingService.PROFICIENCY_LEVEL[d.jobRequirement] ?? 2;
      adequacySum += Math.min(1.0, candLevel / reqLevel);
      adequacyCount++;
    }
    const adequacy = adequacyCount > 0 ? adequacySum / adequacyCount : coverage;

    // ── 加权求和 ──
    const score = (coverage * 0.6 + adequacy * 0.4) * 100;

    return {
      score: Math.round(score * 10) / 10,
      dimensions: {
        coverage: Math.round(coverage * 100) / 100,
        adequacy: Math.round(adequacy * 100) / 100,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  Utilities
  // ══════════════════════════════════════════════════════════════

  private inferImportance(proficiency: string): string {
    const idx = ['beginner', 'intermediate', 'advanced', 'expert'].indexOf(
      proficiency,
    );
    return idx >= 2 ? 'required' : idx >= 1 ? 'preferred' : 'optional';
  }

  /**
   * Run algorithm-level skill matching: ID-based match + fuzzy match.
   * Extracted for reuse by both calculateMatchStream and calculateBatchMatchStream.
   */
  private async runSkillMatching(
    resumeSkills: DocumentSkill[],
    jobSkills: DocumentSkill[],
  ): Promise<MatchDetail[]> {
    const matchDetails: MatchDetail[] = [];
    const resumeById = new Map<number, DocumentSkill>();
    for (const ds of resumeSkills) resumeById.set(ds.skillId, ds);
    const jobById = new Map<number, DocumentSkill>();
    for (const ds of jobSkills) jobById.set(ds.skillId, ds);
    const usedResumeSkillIds = new Set<number>();
    const usedJobSkillIds = new Set<number>();

    // ID-based matching
    for (const [skillId, jobSkill] of jobById) {
      if (resumeById.has(skillId)) {
        matchDetails.push({
          skillId,
          skillName:
            jobSkill.skillName || jobSkill.skill?.name || `skill-${skillId}`,
          personProficiency: resumeById.get(skillId)!.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: skillId,
          jobSkillId: skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        });
        usedResumeSkillIds.add(skillId);
        usedJobSkillIds.add(skillId);
      }
    }

    // 预热 embedding 缓存：批量获取所有技能名的向量，后续语义匹配可直接命中缓存
    const allSkillNames = new Set<string>();
    for (const s of [...resumeSkills, ...jobSkills]) {
      if (s.skillName) allSkillNames.add(s.skillName);
    }
    if (allSkillNames.size > 0) {
      try {
        await this.embeddingService.getEmbeddingBatch([...allSkillNames]);
      } catch {
        // embedding 预热失败不影响后续流程
      }
    }

    // Fuzzy matching: 预计算矩阵查表 → embedding 语义相似度
    const resumeRemaining = resumeSkills.filter(
      (s) => !usedResumeSkillIds.has(s.skillId),
    );
    const jobRemaining = jobSkills.filter(
      (s) => !usedJobSkillIds.has(s.skillId),
    );
    const usedFuzzyResume = new Set<number>();

    for (const jobSkill of jobRemaining) {
      let best: { rs: DocumentSkill; sim: number } | null = null;
      for (const rs of resumeRemaining) {
        if (usedFuzzyResume.has(rs.skillId)) continue;
        // embedding 语义相似度
        let sim = 0;
        try {
          sim = await this.embeddingService.semanticSimilarity(
            jobSkill.skillName || '',
            rs.skillName || '',
          );
        } catch {
          // embedding API 失败时，保持 sim = 0
        }
        if (sim >= 0.5 && (!best || sim > best.sim)) best = { rs, sim };
      }
      if (best) {
        usedFuzzyResume.add(best.rs.skillId);
        matchDetails.push({
          skillId: -Math.round(best.sim * 100),
          skillName: `${best.rs.skillName || best.rs.skill?.name} ↔ ${jobSkill.skillName || jobSkill.skill?.name}`,
          personProficiency: best.rs.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: best.rs.skillId,
          jobSkillId: jobSkill.skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        });
        usedResumeSkillIds.add(best.rs.skillId);
        usedJobSkillIds.add(jobSkill.skillId);
      }
    }

    return matchDetails;
  }

}
