import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { extname } from 'path'
import { Document, DocType, FileFormat } from './document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { OrchestratorAgent, type ProgressCallback } from '../../agents/orchestrator.agent'
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
    private orchestrator: OrchestratorAgent,
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
    const docs: Document[] = []
    for (const file of files) {
      const doc = await this.create(file, docType, userId)
      docs.push(doc)
      // Trigger async parsing for each
      this.parseDocument(doc.id).catch(console.error)
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
      doc.status = 'failed'
      doc.errorMessage = err instanceof Error ? err.message : '解析失败'
    }
    await this.docRepo.save(doc)
  }

  private async saveParseResult(doc: Document, result: AgentResult) {
    doc.parsedText = result.data['parsedText'] as string

    const llmParseDetail = result.data['llmParseDetail']
    const skillLlmDetail = result.data['skillLlmDetail']
    const structuredInfo = result.data['parsedJson'] as Record<string, unknown> | null

    doc.parsedJson = {
      structured: structuredInfo || null,
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
    doc.status = 'parsed'

    const skills = (result.data['extractedSkills'] as any[]) || []
    const mappedSkills = (result.data['mappedSkills'] as any[]) || []

    await this.dsRepo.delete({ documentId: doc.id })

    for (let i = 0; i < mappedSkills.length; i++) {
      const ms = mappedSkills[i]
      const es = skills[i] as any
      let skill = await this.skillRepo.findOne({ where: { id: ms.skillId } })
      if (!skill) {
        skill = this.skillRepo.create({ id: ms.skillId, name: es?.name })
        await this.skillRepo.save(skill)
      }
      const ds = this.dsRepo.create({
        documentId: doc.id, skillId: ms.skillId,
        skillName: es?.name || ms.name || undefined,
        proficiency: (ms.proficiency as any) || 'intermediate',
        confidence: es?.confidence || 0.95,
        sourceText: es?.sourceText || '',
        extractionMethod: 'llm',
      })
      await this.dsRepo.save(ds)
    }
    await this.docRepo.save(doc)
  }

  async getDocumentSkills(documentId: string): Promise<DocumentSkill[]> {
    return this.dsRepo.find({
      where: { documentId },
      relations: ['skill'],
    })
  }
}
