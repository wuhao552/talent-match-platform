import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { extname } from 'path'
import * as fsp from 'fs/promises'
import { Document, DocType, FileFormat } from './document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { MatchResult } from '../matching/match-result.entity'
import { OrchestratorAgent, type ProgressCallback } from '../../agents/orchestrator.agent'
import { GraphBuilderAgent } from '../../agents/graph-builder.agent'
import { Neo4jService } from '../graph/neo4j.service'
import { GraphLayoutService } from '../graph/graph-layout.service'
import { SkillSeedService } from '../skill/skill-seed.service'
import type { AgentResult } from '../../agents/agent.interface'

function decodeFileName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8')
  } catch {
    return name
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
    private graphBuilder: GraphBuilderAgent,
    private neo4j: Neo4jService,
    private graphLayout: GraphLayoutService,
    private skillSeedService: SkillSeedService,
  ) {}

  async create(file: Express.Multer.File, docType: DocType, userId: string): Promise<Document> {
    const originalName = decodeFileName(file.originalname)
    const ext = extname(originalName).toLowerCase().replace('.', '') as FileFormat
    const doc = this.docRepo.create({
      userId,
      docType,
      originalFilename: originalName,
      filePath: file.path,
      fileFormat: ext,
      status: 'uploaded',
    })
    return this.docRepo.save(doc)
  }

  async createBatch(files: Express.Multer.File[], docType: DocType, userId: string): Promise<Document[]> {
    const pLimit = (await import('p-limit')).default
    const limit = pLimit(3)
    const docs: Document[] = []
    for (const file of files) {
      const doc = await this.create(file, docType, userId)
      docs.push(doc)
      // Trigger async parsing with concurrency limit
      limit(() => this.parseDocument(doc.id).catch(console.error))
    }
    return docs
  }

  async findById(id: string): Promise<Document> {
    const doc = await this.docRepo.findOne({ where: { id } })
    if (!doc) throw new NotFoundException('文档不存在')
    return doc
  }

  async findByUser(userId: string): Promise<Document[]> {
    return this.docRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    })
  }

  async delete(id: string, userId: string): Promise<void> {
    const doc = await this.findById(id)
    if (doc.userId !== userId) throw new NotFoundException('无权操作')

    // Delete related match results (FKs to this document)
    await this.matchRepo.delete({ resumeDocId: id })
    await this.matchRepo.delete({ jobDocId: id })

    // Delete Neo4j nodes (job positions reference documentId)
    if (doc.docType === 'job_description') {
      await this.neo4j.deleteJobPosition(id).catch(() => {})
    }

    // Clean up the uploaded file from disk
    if (doc.filePath) {
      await fsp.unlink(doc.filePath).catch(() => {})
    }

    await this.docRepo.remove(doc)
  }

  async parseDocumentStream(
    documentId: string,
    onProgress?: ProgressCallback,
    onChunk?: (agent: string, token: string) => void,
  ) {
    const doc = await this.findById(documentId)
    doc.status = 'parsing'
    await this.docRepo.save(doc)

    const result = await this.orchestrator.runParsePipelineStream(doc, onProgress, onChunk)
    await this.saveParseResult(doc, result)
    return result
  }

  async parseDocument(documentId: string): Promise<void> {
    const doc = await this.findById(documentId)
    doc.status = 'parsing'
    await this.docRepo.save(doc)

    try {
      const result = await this.orchestrator.runParsePipeline(doc)
      await this.saveParseResult(doc, result)
    } catch (err) {
      // Use QueryBuilder to avoid TypeORM entity tracker updating stale relations
      await this.docRepo
        .createQueryBuilder()
        .update(Document)
        .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : '解析失败' } as any)
        .where('id = :id', { id: documentId })
        .execute()
    }
  }

  private async saveParseResult(doc: Document, result: AgentResult) {
    const parsedText = result.data['parsedText'] as string

    const llmParseDetail = result.data['llmParseDetail']
    const skillLlmDetail = result.data['skillLlmDetail']
    const structuredInfo = result.data['parsedJson'] as Record<string, unknown> | null
    const matchingLogs = (result.data['matchingLogs'] as any[]) || []

    const parsedJson = {
      structured: structuredInfo || null,
      extractedSkills: (result.data['extractedSkills'] as any[]) || [],
      unmatchedSkills: (result.data['unmatchedSkills'] as any[]) || [],
      matchingLogs,
      pipeline: (result.data['pipelineSteps'] as any[]) || [],
      llmCalls: {
        documentParse: llmParseDetail ? {
          model: (llmParseDetail as any).model,
          success: (llmParseDetail as any).success,
          latencyMs: (llmParseDetail as any).latencyMs,
          rawResponse: (llmParseDetail as any).rawResponse,
        } : null,
        skillExtraction: skillLlmDetail ? {
          model: (skillLlmDetail as any).model,
          success: (skillLlmDetail as any).success,
          latencyMs: (skillLlmDetail as any).latencyMs,
          rawResponse: (skillLlmDetail as any).rawResponse,
        } : null,
      },
    }

    const skills = (result.data['extractedSkills'] as any[]) || []
    const mappedSkills = (result.data['mappedSkills'] as any[]) || []

    // Use QueryBuilder to update document directly, bypassing TypeORM entity tracking
    // which causes spurious UPDATE on document_skills with null document_id
    await this.docRepo
      .createQueryBuilder()
      .update(Document)
      .set({ parsedText, parsedJson, status: 'parsed' } as any)
      .where('id = :id', { id: doc.id })
      .execute()

    await this.dsRepo.delete({ documentId: doc.id })

    const savedSkillIds = new Set<number>()

    // Batch: fetch all existing mapped skills in one query
    const mappedIds = [...new Set(mappedSkills.map((ms: any) => ms.skillId).filter(Boolean))]
    const existingSkills = mappedIds.length > 0
      ? await this.skillRepo.findBy(mappedIds.map((id: number) => ({ id })))
      : []
    const existingSkillMap = new Map(existingSkills.map((s) => [s.id, s]))

    // Determine which skills need to be created
    const skillsToCreate: Skill[] = []
    for (let i = 0; i < mappedSkills.length; i++) {
      const ms = mappedSkills[i]
      if (savedSkillIds.has(ms.skillId) || existingSkillMap.has(ms.skillId)) continue
      const es = skills[i] as any
      const skillName = es?.name || ms.name || ''
      skillsToCreate.push(this.skillRepo.create({
        id: ms.skillId,
        name: skillName,
        category: this.skillSeedService.inferCategory(skillName) || undefined,
      } as Skill))
    }
    if (skillsToCreate.length > 0) {
      const created = await this.skillRepo.save(skillsToCreate)
      for (const s of created) existingSkillMap.set(s.id, s)
    }

    // Batch: create all DocumentSkill records
    const docSkillsToSave: DocumentSkill[] = []
    for (let i = 0; i < mappedSkills.length; i++) {
      const ms = mappedSkills[i]
      if (savedSkillIds.has(ms.skillId)) continue
      savedSkillIds.add(ms.skillId)
      const es = skills[i] as any
      const skill = existingSkillMap.get(ms.skillId)
      if (skill && !skill.category) {
        const inferred = this.skillSeedService.inferCategory(skill.name || '')
        if (inferred) { skill.category = inferred as any; await this.skillRepo.save(skill) }
      }
      docSkillsToSave.push(this.dsRepo.create({
        documentId: doc.id, skillId: ms.skillId,
        skillName: es?.name || ms.name || undefined,
        proficiency: (ms.proficiency as any) || 'intermediate',
        confidence: es?.confidence || 0.95,
        sourceText: es?.sourceText || '',
        extractionMethod: 'llm',
        category: this.skillSeedService.inferCategory(es?.name || ms.name || '') || null as any,
      }))
    }
    if (docSkillsToSave.length > 0) await this.dsRepo.save(docSkillsToSave)

    // Save unmatched skills: batch find by name, batch create, batch save DocumentSkill
    const unmatched = (result.data['unmatchedSkills'] as any[]) || []
    const unmatchedWithIds: Array<{ skillId: number; proficiency: string; name: string }> = []
    try {
      const validUnmatched = unmatched.filter((u) => u.name?.trim())
      if (validUnmatched.length > 0) {
        // Batch find existing skills by lowercase name
        const names = [...new Set(validUnmatched.map((u) => u.name.trim()))]
        const existingByName = names.length > 0
          ? await this.skillRepo
              .createQueryBuilder('s')
              .where('LOWER(s.name) IN (:...names)', { names: names.map((n) => n.toLowerCase()) })
              .getMany()
          : []
        const byLowerName = new Map(existingByName.map((s) => [s.name.toLowerCase(), s]))

        const unmatchedToCreate: Skill[] = []
        for (const u of validUnmatched) {
          const name = u.name.trim()
          if (!byLowerName.has(name.toLowerCase())) {
            unmatchedToCreate.push(this.skillRepo.create({
              name,
              category: this.skillSeedService.inferCategory(name) || undefined,
            } as Skill))
          }
        }
        if (unmatchedToCreate.length > 0) {
          const created = await this.skillRepo.save(unmatchedToCreate)
          for (const s of created) byLowerName.set(s.name.toLowerCase(), s)
        }

        const unmatchedDocSkills: DocumentSkill[] = []
        for (const u of validUnmatched) {
          const name = u.name.trim()
          const skill = byLowerName.get(name.toLowerCase())
          if (!skill || savedSkillIds.has(skill.id)) continue
          savedSkillIds.add(skill.id)

          // Track unmatched skills with their IDs for Neo4j graph
          unmatchedWithIds.push({
            skillId: skill.id,
            proficiency: (u.proficiency as any) || 'intermediate',
            name: skill.name,
          })

          unmatchedDocSkills.push(this.dsRepo.create({
            documentId: doc.id,
            skillId: skill.id,
            skillName: name,
            proficiency: (u.proficiency as any) || 'intermediate',
            confidence: 0.80,
            sourceText: '',
            extractionMethod: 'llm',
            category: skill.category || null as any,
          }))
        }
        if (unmatchedDocSkills.length > 0) await this.dsRepo.save(unmatchedDocSkills)
      }
    } catch (err) {
      console.error(`[Document] Failed to save unmatched skills for ${doc.id}:`, (err as Error).message)
    }

    // Fire-and-forget: build Neo4j graph for both resume and job documents
    // Include both mapped skills and unmatched skills (now with their IDs)
    const allSkillsForGraph = [...mappedSkills, ...unmatchedWithIds]
    if (allSkillsForGraph.length > 0) {
      this.graphBuilder.execute({
        sessionId: `graph-${doc.id}`, userId: doc.userId,
        input: { documentId: doc.id, docType: doc.docType, skills: allSkillsForGraph, userId: doc.userId },
      }).catch((err) => console.error(`Graph build failed for ${doc.id}:`, err.message))
    }

    // Fire-and-forget: pre-compute graph layout coordinates
    if (allSkillsForGraph.length > 0) {
      const skillIds = allSkillsForGraph.map((s) => s.skillId)
      this.neo4j.batchGetCooccurrences(skillIds, skillIds)
        .then(async (coocEdges) => {
          const layout = this.graphLayout.computeLayout(allSkillsForGraph, coocEdges)
          // Read current parsedJson and merge in graphLayout
          const current = await this.docRepo.findOne({ where: { id: doc.id }, select: ['parsedJson'] })
          if (current) {
            const updatedJson = { ...(current.parsedJson || {}), graphLayout: layout }
            await this.docRepo
              .createQueryBuilder()
              .update(Document)
              .set({ parsedJson: updatedJson } as any)
              .where('id = :id', { id: doc.id })
              .execute()
          }
        })
        .catch((err) => console.error(`Graph layout computation failed for ${doc.id}:`, err.message))
    }

    // Fire-and-forget: invalidate stale match results (don't block parse flow)
    this.matchRepo
      .createQueryBuilder()
      .update()
      .set({ staleAt: () => 'NOW()' })
      .where('resumeDocId = :id OR jobDocId = :id', { id: doc.id })
      .execute()
      .catch((err) => console.error(`[Document] Stale invalidation failed for ${doc.id}:`, err.message))
  }

  async getDocumentSkills(documentId: string): Promise<DocumentSkill[]> {
    return this.dsRepo.find({
      where: { documentId },
      relations: ['skill'],
    })
  }

  async getDocumentSkillsBatch(documentIds: string[]): Promise<DocumentSkill[]> {
    if (documentIds.length === 0) return []
    return this.dsRepo.find({
      where: { documentId: In(documentIds) },
      relations: ['skill'],
    })
  }
}
