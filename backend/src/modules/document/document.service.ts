import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { extname } from 'path';
import * as fsp from 'fs/promises';
import { createHash } from 'crypto';
import { Document, DocType, FileFormat } from './document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { MatchResult } from '../matching/match-result.entity';
import {
  OrchestratorAgent,
  type ProgressCallback,
} from '../../agents/orchestrator.agent';
import { GraphLayoutService } from '../graph/graph-layout.service';
import { inferCategory } from '../skill/skill.utils';
import { mergeUnmatchedSkillsFromParsedJson } from '../skill/skill-display.utils';
import { SkillMatcherService } from '../skill/skill-matcher.service';
import { MatchingService } from '../matching/matching.service';
import { JobService } from '../job/job.service';
import type { AgentResult } from '../../agents/agent.interface';

function decodeFileName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(Document)
    private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill)
    private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(Skill)
    private skillRepo: Repository<Skill>,
    @InjectRepository(MatchResult)
    private matchRepo: Repository<MatchResult>,
    private orchestrator: OrchestratorAgent,
    private graphLayout: GraphLayoutService,
    private dataSource: DataSource,
    private skillMatcher: SkillMatcherService,
    @Inject(forwardRef(() => MatchingService))
    private matchingService: MatchingService,
    private jobService: JobService,
  ) {}

  async create(
    file: Express.Multer.File,
    docType: DocType,
    userId: string,
  ): Promise<Document> {
    const originalName = decodeFileName(file.originalname);
    const ext = extname(originalName)
      .toLowerCase()
      .replace('.', '') as FileFormat;
    const doc = this.docRepo.create({
      userId,
      docType,
      originalFilename: originalName,
      filePath: file.path,
      fileFormat: ext,
      status: 'uploaded',
    });
    return this.docRepo.save(doc);
  }

  async createBatch(
    files: Express.Multer.File[],
    docType: DocType,
    userId: string,
  ): Promise<Document[]> {
    // 用事务批量创建文档记录，减少连接占用时间
    const docs = await this.dataSource.transaction(async (manager) => {
      const created: Document[] = [];
      for (const file of files) {
        const originalName = decodeFileName(file.originalname);
        const ext = extname(originalName)
          .toLowerCase()
          .replace('.', '') as FileFormat;
        const doc = manager.create(Document, {
          userId,
          docType,
          originalFilename: originalName,
          filePath: file.path,
          fileFormat: ext,
          status: 'uploaded',
        });
        created.push(doc);
      }
      return manager.save(created);
    });

    // 事务提交后再触发异步解析，避免解析期间占用事务连接
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(3);
    for (const doc of docs) {
      limit(() => this.parseDocument(doc.id).catch(console.error));
    }
    return docs;
  }

  async findById(id: string, userId?: string): Promise<Document> {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('文档不存在');
    // 传入 userId 时校验文档归属，防止越权访问
    if (userId && doc.userId !== userId) {
      throw new NotFoundException('无权访问该文档');
    }
    return doc;
  }

  async findByUser(userId: string): Promise<Document[]> {
    return this.docRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 校验一批文档全部属于该用户(用于批量读取技能等场景,防止越权) */
  async assertOwnedBatch(documentIds: string[], userId: string): Promise<void> {
    if (documentIds.length === 0) return;
    const ownedCount = await this.docRepo.count({
      where: { id: In(documentIds), userId },
    });
    if (ownedCount !== documentIds.length) {
      throw new NotFoundException('无权访问部分文档');
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    const doc = await this.findById(id);
    if (doc.userId !== userId) throw new NotFoundException('无权操作');

    // 1. 删除关联的匹配结果(FK 引用)
    await this.matchRepo.delete({ resumeDocId: id });
    await this.matchRepo.delete({ jobDocId: id });

    // 2. 删除文档技能关联(FK 引用,无级联)
    await this.dsRepo.delete({ documentId: id });

    // 3. 如果是 JD 文档,同时清理 jobs 表中通过 documentId 关联的草稿岗位
    //    (已发布的岗位不自动删除,避免误删在招职位)
    await this.dataSource
      .createQueryBuilder()
      .delete()
      .from('jobs')
      .where('document_id = :id AND status = :status', { id, status: 'draft' })
      .execute()
      .catch((err) =>
        console.error(
          `[Document] Failed to clean jobs for ${id}:`,
          err.message,
        ),
      );

    // 4. 清理磁盘文件
    if (doc.filePath) {
      await fsp.unlink(doc.filePath).catch(() => {});
    }

    await this.docRepo.remove(doc);
  }

  private async computeContentHash(filePath: string): Promise<string> {
    const buf = await fsp.readFile(filePath);
    return createHash('sha256').update(buf).digest('hex');
  }

  /**
   * 检查文档内容是否发生变化。未变化时直接复用已有解析结果，避免重复 LLM 调用。
   */
  private async shouldSkipReparse(doc: Document): Promise<boolean> {
    if (doc.status !== 'parsed' || !doc.contentHash) return false;
    try {
      const currentHash = await this.computeContentHash(doc.filePath);
      return currentHash === doc.contentHash;
    } catch {
      return false;
    }
  }

  async parseDocumentStream(
    documentId: string,
    onProgress?: ProgressCallback,
    onChunk?: (agent: string, token: string) => void,
    force = false,
  ) {
    const doc = await this.findById(documentId);

    // 内容未变化时直接复用已有解析结果(force=true 时强制重跑,用于重新提取技能等场景)
    if (!force && (await this.shouldSkipReparse(doc))) {
      console.log(`[Document] skip reparse ${doc.id} (content unchanged)`);
      // 回播已保存的 pipeline 步骤，保持前端体验一致
      const storedPipeline = ((doc.parsedJson as any)?.pipeline ||
        []) as Array<{
        agent: string;
        status: string;
        summary: string;
        data?: Record<string, unknown>;
        error?: string;
        timestamp: number;
      }>;
      for (const step of storedPipeline) {
        onProgress?.(step as any);
      }
      // 仍触发自动匹配（会检查缓存，不会重复 LLM）
      this.matchingService.autoMatchAfterParse(doc.id).catch((err) => {
        console.error(
          `[Document] Auto-match failed for ${doc.id}:`,
          err.message,
        );
      });
      return {
        success: true,
        data: doc.parsedJson || {},
        summary: '文档内容未变化，复用已有解析结果',
      } as AgentResult;
    }

    // 并发守卫:已有解析任务进行中时拒绝重复触发,避免双份 LLM 调用互相覆盖
    if (doc.status === 'parsing') {
      throw new Error('文档正在解析中，请稍候重试');
    }

    doc.status = 'parsing';
    await this.docRepo.save(doc);

    const result = await this.orchestrator.runParsePipelineStream(
      doc,
      onProgress,
      onChunk,
    );

    // 解析失败时不保存 parsed 结果，标记为 failed
    if (!result.success) {
      await this.docRepo
        .createQueryBuilder()
        .update(Document)
        .set({
          status: 'failed',
          errorMessage: result.error || result.summary || '解析失败',
        } as any)
        .where('id = :id', { id: doc.id })
        .execute();
      return result;
    }

    await this.saveParseResult(doc, result);

    // 解析完成后自动触发匹配（fire-and-forget）
    this.matchingService.autoMatchAfterParse(doc.id).catch((err) => {
      console.error(`[Document] Auto-match failed for ${doc.id}:`, err.message);
    });

    return result;
  }

  async parseDocument(documentId: string): Promise<void> {
    // 独立获取文档，避免使用可能过期的实体引用
    const doc = await this.findById(documentId);

    // 内容未变化时直接复用已有解析结果
    if (await this.shouldSkipReparse(doc)) {
      console.log(`[Document] skip reparse ${doc.id} (content unchanged)`);
      this.matchingService.autoMatchAfterParse(doc.id).catch((err) => {
        console.error(
          `[Document] Auto-match failed for ${doc.id}:`,
          err.message,
        );
      });
      return;
    }

    // 并发守卫:已有解析任务进行中时跳过,避免重复 LLM 调用
    if (doc.status === 'parsing') {
      console.log(`[Document] skip parse ${doc.id} (already parsing)`);
      return;
    }

    doc.status = 'parsing';
    try {
      await this.docRepo.save(doc);
    } catch {
      // save 可能因连接断开失败，用 QueryBuilder 重试一次
      await this.docRepo
        .createQueryBuilder()
        .update(Document)
        .set({ status: 'parsing' } as any)
        .where('id = :id', { id: documentId })
        .execute();
    }

    try {
      const result = await this.orchestrator.runParsePipeline(doc);
      if (!result.success) {
        throw new Error(result.error || result.summary || '解析失败');
      }
      await this.saveParseResult(doc, result);

      // 解析完成后自动触发匹配（fire-and-forget）
      this.matchingService.autoMatchAfterParse(doc.id).catch((err) => {
        console.error(
          `[Document] Auto-match failed for ${doc.id}:`,
          err.message,
        );
      });
    } catch (err) {
      // Use QueryBuilder to avoid TypeORM entity tracker updating stale relations
      await this.docRepo
        .createQueryBuilder()
        .update(Document)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : '解析失败',
        } as any)
        .where('id = :id', { id: documentId })
        .execute();
    }
  }

  private async saveParseResult(doc: Document, result: AgentResult) {
    const parsedText = result.data['parsedText'] as string;
    const contentHash = await this.computeContentHash(doc.filePath);

    const llmParseDetail = result.data['llmParseDetail'];
    const skillLlmDetail = result.data['skillLlmDetail'];
    const structuredInfo = result.data['parsedJson'] as Record<
      string,
      unknown
    > | null;
    const matchingLogs = (result.data['matchingLogs'] as any[]) || [];

    const parsedJson = {
      structured: structuredInfo || null,
      extractedSkills: (result.data['extractedSkills'] as any[]) || [],
      unmatchedSkills: (result.data['unmatchedSkills'] as any[]) || [],
      matchingLogs,
      pipeline: (result.data['pipelineSteps'] as any[]) || [],
      llmCalls: {
        documentParse: llmParseDetail
          ? {
              model: (llmParseDetail as any).model,
              success: (llmParseDetail as any).success,
              latencyMs: (llmParseDetail as any).latencyMs,
              rawResponse: (llmParseDetail as any).rawResponse,
            }
          : null,
        skillExtraction: skillLlmDetail
          ? {
              model: (skillLlmDetail as any).model,
              success: (skillLlmDetail as any).success,
              latencyMs: (skillLlmDetail as any).latencyMs,
              rawResponse: (skillLlmDetail as any).rawResponse,
            }
          : null,
      },
    };

    const skills = (result.data['extractedSkills'] as any[]) || [];
    const mappedSkills = (result.data['mappedSkills'] as any[]) || [];
    // 提取技能与已匹配技能长度/顺序可能不一致,必须按名称关联,不能按下标对齐
    const extractedByName = new Map<string, any>();
    for (const es of skills) {
      if (es?.name && !extractedByName.has(es.name)) {
        extractedByName.set(es.name, es);
      }
    }

    // 本次是否新建了技能(用于解析完成后刷新内存索引)
    let createdNewSkills = false;
    // 保存成功后带 skillId 的未匹配技能列表，用于生成与落库 ID 一致的图谱布局
    let savedUnmatchedSkills: Array<{
      skillId: number;
      proficiency: string;
      name: string;
    }> = [];

    // 使用事务包裹核心写入，减少 DB 往返
    await this.dataSource.transaction(async (manager) => {
      // 1. 更新文档状态
      await manager
        .createQueryBuilder()
        .update(Document)
        .set({ parsedText, parsedJson, contentHash, status: 'parsed' })
        .where('id = :id', { id: doc.id })
        .execute();

      // 2. 删除旧的文档技能
      await manager.delete(DocumentSkill, { documentId: doc.id });

      const savedSkillIds = new Set<number>();

      // 3. 批量获取已存在的技能
      const mappedIds = [
        ...new Set(mappedSkills.map((ms: any) => ms.skillId).filter(Boolean)),
      ];
      const existingSkills =
        mappedIds.length > 0
          ? await manager.findBy(
              Skill,
              mappedIds.map((id: number) => ({ id })),
            )
          : [];
      const existingSkillMap = new Map(existingSkills.map((s) => [s.id, s]));

      // 4. 批量创建缺失的技能
      const skillsToCreate: Skill[] = [];
      for (const ms of mappedSkills) {
        if (savedSkillIds.has(ms.skillId) || existingSkillMap.has(ms.skillId))
          continue;
        const skillName = ms.name || '';
        skillsToCreate.push(
          manager.create(Skill, {
            id: ms.skillId,
            name: skillName,
            category: inferCategory(skillName) || undefined,
          } as Skill),
        );
      }
      if (skillsToCreate.length > 0) {
        const created = await manager.save(Skill, skillsToCreate);
        for (const s of created) existingSkillMap.set(s.id, s);
        createdNewSkills = true;
      }

      // 5. 收集需要更新 category 的技能（批量）
      const skillsToUpdateCategory: Skill[] = [];

      // 6. 批量创建 DocumentSkill(按名称关联提取结果,避免下标错位)
      const docSkillsToSave: DocumentSkill[] = [];
      for (const ms of mappedSkills) {
        if (savedSkillIds.has(ms.skillId)) continue;
        savedSkillIds.add(ms.skillId);
        const skill = existingSkillMap.get(ms.skillId);
        const extractedName = (ms as { extractedName?: string }).extractedName;
        const es = extractedName
          ? extractedByName.get(extractedName)
          : undefined;
        if (skill && !skill.category) {
          const inferred = inferCategory(skill.name || '');
          if (inferred) {
            skill.category = inferred;
            skillsToUpdateCategory.push(skill);
          }
        }
        const canonicalName = skill?.name || ms.name || '';
        docSkillsToSave.push(
          manager.create(DocumentSkill, {
            documentId: doc.id,
            skillId: ms.skillId,
            skillName: canonicalName || undefined,
            proficiency: ms.proficiency || 'intermediate',
            confidence: es?.confidence || 0.95,
            sourceText: es?.sourceText || '',
            extractionMethod: 'llm',
            category:
              skill?.category || inferCategory(canonicalName) || (null as any),
          }),
        );
      }
      if (docSkillsToSave.length > 0)
        await manager.save(DocumentSkill, docSkillsToSave);

      // 批量更新 skill category
      if (skillsToUpdateCategory.length > 0) {
        await manager.save(Skill, skillsToUpdateCategory);
      }

      // 7. 保存 unmatched skills
      const unmatched = (result.data['unmatchedSkills'] as any[]) || [];
      const unmatchedWithIds: Array<{
        skillId: number;
        proficiency: string;
        name: string;
      }> = [];
      try {
        const validUnmatched = unmatched.filter((u) => u.name?.trim());
        if (validUnmatched.length > 0) {
          const names = [...new Set(validUnmatched.map((u) => u.name.trim()))];
          const existingByName =
            names.length > 0
              ? await manager
                  .createQueryBuilder(Skill, 's')
                  .where('LOWER(s.name) IN (:...names)', {
                    names: names.map((n) => n.toLowerCase()),
                  })
                  .getMany()
              : [];
          const byLowerName = new Map(
            existingByName.map((s) => [s.name.toLowerCase(), s]),
          );

          const unmatchedToCreate: Skill[] = [];
          // skills.id 为显式主键(种子数据 id=行号,非自增),新建技能必须手动分配 id,
          // 否则主键 NULL 插入失败会被外层 catch 静默吞掉
          const maxRow = await manager
            .createQueryBuilder(Skill, 's')
            .select('MAX(s.id)', 'max')
            .getRawOne();
          let nextSkillId = Math.max(0, Number(maxRow?.max) || 0) + 1;
          for (const u of validUnmatched) {
            const name = u.name.trim();
            if (!byLowerName.has(name.toLowerCase())) {
              unmatchedToCreate.push(
                manager.create(Skill, {
                  id: nextSkillId++,
                  name,
                  category: inferCategory(name) || undefined,
                } as Skill),
              );
            }
          }
          if (unmatchedToCreate.length > 0) {
            const created = await manager.save(Skill, unmatchedToCreate);
            for (const s of created) byLowerName.set(s.name.toLowerCase(), s);
            createdNewSkills = true;
          }

          const unmatchedDocSkills: DocumentSkill[] = [];
          for (const u of validUnmatched) {
            const name = u.name.trim();
            const skill = byLowerName.get(name.toLowerCase());
            if (!skill || savedSkillIds.has(skill.id)) continue;
            savedSkillIds.add(skill.id);

            unmatchedWithIds.push({
              skillId: skill.id,
              proficiency: u.proficiency || 'intermediate',
              name: skill.name,
            });

            unmatchedDocSkills.push(
              manager.create(DocumentSkill, {
                documentId: doc.id,
                skillId: skill.id,
                skillName: name,
                proficiency: u.proficiency || 'intermediate',
                confidence: 0.8,
                sourceText: '',
                extractionMethod: 'llm',
                category: skill.category || (null as any),
              }),
            );
          }
          if (unmatchedDocSkills.length > 0)
            await manager.save(DocumentSkill, unmatchedDocSkills);
        }
        savedUnmatchedSkills = unmatchedWithIds;
      } catch (err) {
        console.error(
          `[Document] Failed to save unmatched skills for ${doc.id}:`,
          (err as Error).message,
        );
      }
    });

    // 新建技能后刷新内存匹配索引,使新技能可被后续解析匹配(否则永远走 unmatched 分支)
    if (createdNewSkills) {
      await this.skillMatcher
        .reload()
        .catch((err) =>
          console.error(
            `[Document] Skill matcher reload failed for ${doc.id}:`,
            (err as Error).message,
          ),
        );
    }

    // Fire-and-forget: pre-compute graph layout coordinates
    const allSkillsForGraph = [
      ...mappedSkills,
      ...(savedUnmatchedSkills.length > 0
        ? savedUnmatchedSkills
        : ((result.data['unmatchedSkills'] as any[]) || []).map(
            (u: any, i: number) => ({
              skillId: -(i + 1),
              proficiency: u?.proficiency || 'intermediate',
              name: u?.name || `技能 ${i + 1}`,
            }),
          )),
    ];
    if (allSkillsForGraph.length > 0) {
      const layout = this.graphLayout.computeLayout(allSkillsForGraph);
      this.docRepo
        .findOne({ where: { id: doc.id }, select: ['parsedJson'] })
        .then((current) => {
          if (!current) return;
          const updatedJson = {
            ...(current.parsedJson || {}),
            graphLayout: layout,
          };
          return this.docRepo
            .createQueryBuilder()
            .update(Document)
            .set({ parsedJson: updatedJson })
            .where('id = :id', { id: doc.id })
            .execute();
        })
        .catch((err) =>
          console.error(
            `Graph layout computation failed for ${doc.id}:`,
            err.message,
          ),
        );
    }

    // Fire-and-forget: invalidate stale match results (don't block parse flow)
    this.matchRepo
      .createQueryBuilder()
      .update()
      .set({ staleAt: () => 'NOW()' })
      .where('resumeDocId = :id OR jobDocId = :id', { id: doc.id })
      .execute()
      .catch((err) =>
        console.error(
          `[Document] Stale invalidation failed for ${doc.id}:`,
          err.message,
        ),
      );

    // Fire-and-forget: JD 文档解析完成后,同步/创建对应 Job 记录(打通工作台与岗位管理)
    if (doc.docType === 'job_description') {
      const structuredInfo = (parsedJson as any)?.structured;
      if (structuredInfo) {
        this.jobService
          .syncFromDocument(doc.id, doc.userId, structuredInfo)
          .catch((err) =>
            console.error(
              `[Document] Job sync failed for ${doc.id}:`,
              err.message,
            ),
          );
      }
    }
  }

  async getDocumentSkills(documentId: string): Promise<DocumentSkill[]> {
    const [doc, savedSkills] = await Promise.all([
      this.docRepo.findOne({ where: { id: documentId } }),
      this.dsRepo.find({
        where: { documentId },
        relations: ['skill'],
      }),
    ]);
    if (!doc) return savedSkills;
    return mergeUnmatchedSkillsFromParsedJson(doc, savedSkills);
  }

  async getDocumentSkillsBatch(
    documentIds: string[],
  ): Promise<DocumentSkill[]> {
    if (documentIds.length === 0) return [];
    const [docs, savedSkills] = await Promise.all([
      this.docRepo.find({ where: { id: In(documentIds) } }),
      this.dsRepo.find({
        where: { documentId: In(documentIds) },
        relations: ['skill'],
      }),
    ]);
    const savedByDoc = new Map<string, DocumentSkill[]>();
    for (const skill of savedSkills) {
      const list = savedByDoc.get(skill.documentId) || [];
      list.push(skill);
      savedByDoc.set(skill.documentId, list);
    }

    const result: DocumentSkill[] = [];
    for (const doc of docs) {
      const saved = savedByDoc.get(doc.id) || [];
      result.push(...mergeUnmatchedSkillsFromParsedJson(doc, saved));
    }
    // 保底返回没有任何 parsedJson 可用的已保存技能
    const seenDocIds = new Set(docs.map((doc) => doc.id));
    for (const skill of savedSkills) {
      if (!seenDocIds.has(skill.documentId)) result.push(skill);
    }
    return result;
  }
}
