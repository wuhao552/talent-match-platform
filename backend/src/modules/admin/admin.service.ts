/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台核心服务 - 统计/用户CRUD/文档管理/技能/匹配/LLM日志/审计
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, ILike } from 'typeorm'
import { User } from '../user/user.entity'
import { Document } from '../document/document.entity'
import { Skill } from '../skill/skill.entity'
import { MatchResult } from '../matching/match-result.entity'
import { LlmLog } from '../llm/llm-log.entity'
import { AdminAuditLog, type AuditAction, type AuditTargetType } from './admin-audit-log.entity'
import { DocumentService } from '../document/document.service'
import type { UserFilterDto, DocumentFilterDto, SkillFilterDto, MatchFilterDto, LlmLogFilterDto } from './admin.dto'

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(Skill) private skillRepo: Repository<Skill>,
    @InjectRepository(MatchResult) private matchRepo: Repository<MatchResult>,
    @InjectRepository(LlmLog) private llmLogRepo: Repository<LlmLog>,
    @InjectRepository(AdminAuditLog) private auditRepo: Repository<AdminAuditLog>,
    private documentService: DocumentService,
  ) {}

  private userSelect = {
    id: true, username: true, role: true, status: true,
    email: true, phone: true, city: true, intendedCities: true,
    companyName: true, createdAt: true, updatedAt: true,
  }

  // ==================== Dashboard ====================

  async getStats() {
    const [totalUsers, usersByRole, totalDocuments, documentsByType, totalMatches, totalLlmCalls] =
      await Promise.all([
        this.userRepo.count(),
        this.userRepo.createQueryBuilder('u').select('u.role', 'role').addSelect('COUNT(*)', 'count').groupBy('u.role').getRawMany(),
        this.docRepo.count(),
        this.docRepo.createQueryBuilder('d').select('d.docType', 'docType').addSelect('COUNT(*)', 'count').groupBy('d.docType').getRawMany(),
        this.matchRepo.count(),
        this.llmLogRepo.count(),
      ])
    return { totalUsers, usersByRole, totalDocuments, documentsByType, totalMatches, totalLlmCalls }
  }

  async getStatsTrend(days: number) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    const [userRows, docRows, llmRows] = await Promise.all([
      this.userRepo.createQueryBuilder('u')
        .select("TO_CHAR(DATE_TRUNC('day', u.createdAt), 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('u.createdAt >= :s', { s: startDate })
        .groupBy("DATE_TRUNC('day', u.createdAt)")
        .getRawMany(),
      this.docRepo.createQueryBuilder('d')
        .select("TO_CHAR(DATE_TRUNC('day', d.createdAt), 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('d.createdAt >= :s', { s: startDate })
        .groupBy("DATE_TRUNC('day', d.createdAt)")
        .getRawMany(),
      this.llmLogRepo.createQueryBuilder('l')
        .select("TO_CHAR(DATE_TRUNC('day', l.createdAt), 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('l.createdAt >= :s', { s: startDate })
        .groupBy("DATE_TRUNC('day', l.createdAt)")
        .getRawMany(),
    ])

    const userMap = new Map(userRows.map((r: any) => [r.date, Number(r.count)]))
    const docMap = new Map(docRows.map((r: any) => [r.date, Number(r.count)]))
    const llmMap = new Map(llmRows.map((r: any) => [r.date, Number(r.count)]))

    const result: { date: string; newUsers: number; newDocuments: number; llmCalls: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      result.push({
        date: dateStr,
        newUsers: userMap.get(dateStr) || 0,
        newDocuments: docMap.get(dateStr) || 0,
        llmCalls: llmMap.get(dateStr) || 0,
      })
    }
    return result
  }

  // ==================== Users ====================

  async getUsers(query: UserFilterDto) {
    const { page = 1, pageSize = 20, role, status, search } = query
    const where: Record<string, unknown> = {}
    if (role) where.role = role
    if (status) where.status = status
    const [items, total] = await this.userRepo.findAndCount({
      select: this.userSelect,
      where: search ? [{ ...where, username: ILike(`%${search}%`) }, { ...where, email: ILike(`%${search}%`) }] : where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return { items, total, page, pageSize }
  }

  async getUserDetail(id: string) {
    const user = await this.userRepo.findOne({ select: this.userSelect, where: { id } })
    if (!user) throw new NotFoundException('用户不存在')
    return user
  }

  async updateUserStatus(id: string, status: string, adminId: string) {
    const user = await this.userRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException('用户不存在')
    if (user.role === 'admin') throw new BadRequestException('不能修改管理员账号状态')
    const action: AuditAction = status === 'active' ? 'enable_user' : 'disable_user'
    await this.createAuditLog(adminId, action, 'user', id, { previousStatus: user.status, newStatus: status })
    user.status = status as 'active' | 'disabled'
    await this.userRepo.save(user)
    return this.getUserDetail(id)
  }

  async deleteUser(id: string, adminId: string) {
    const user = await this.userRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException('用户不存在')
    if (user.role === 'admin') throw new BadRequestException('不能删除管理员账号')
    await this.createAuditLog(adminId, 'delete_user', 'user', id, { username: user.username, role: user.role })
    await this.userRepo.remove(user)
    return null
  }

  // ==================== Documents ====================

  async getDocuments(query: DocumentFilterDto) {
    const { page = 1, pageSize = 20, docType, status, search } = query
    const where: Record<string, unknown> = {}
    if (docType) where.docType = docType
    if (status) where.status = status
    const [items, total] = await this.docRepo.findAndCount({
      relations: ['user'],
      where: search ? [{ ...where, originalFilename: ILike(`%${search}%`) }] : where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return { items: items.map(d => ({ ...d, user: d.user ? this.sanitize(d.user) : undefined })), total, page, pageSize }
  }

  async getDocumentDetail(id: string) {
    const doc = await this.docRepo.findOne({ where: { id }, relations: ['user'] })
    if (!doc) throw new NotFoundException('文档不存在')
    return { ...doc, user: doc.user ? this.sanitize(doc.user) : undefined }
  }

  async reparseDocument(id: string, adminId: string) {
    const doc = await this.docRepo.findOne({ where: { id } })
    if (!doc) throw new NotFoundException('文档不存在')
    await this.createAuditLog(adminId, 'reparse_document', 'document', id, { filename: doc.originalFilename })
    this.documentService.parseDocument(id).catch(() => {})
    return { message: '重新解析已触发' }
  }

  async deleteDocument(id: string, adminId: string) {
    const doc = await this.docRepo.findOne({ where: { id } })
    if (!doc) throw new NotFoundException('文档不存在')
    await this.createAuditLog(adminId, 'delete_document', 'document', id, { filename: doc.originalFilename })
    await this.docRepo.remove(doc)
    return null
  }

  // ==================== Skills ====================

  async getSkills(query: SkillFilterDto) {
    const { page = 1, pageSize = 20, search, category, hasStructuralBreak, isLowFrequency } = query
    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (hasStructuralBreak !== undefined) where.hasStructuralBreak = hasStructuralBreak
    if (isLowFrequency !== undefined) where.isLowFrequency = isLowFrequency
    const [items, total] = await this.skillRepo.findAndCount({
      where: search ? [{ ...where, name: ILike(`%${search}%`) }] : where,
      order: { id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return { items, total, page, pageSize }
  }

  async getSkillsStats() {
    return this.skillRepo.createQueryBuilder('s')
      .select("COALESCE(s.category, '未分类')", 'category').addSelect('COUNT(*)', 'count')
      .groupBy('s.category').orderBy('count', 'DESC').getRawMany()
  }

  // ==================== Matching ====================

  async getMatchResults(query: MatchFilterDto) {
    const { page = 1, pageSize = 20, minScore, maxScore } = query
    const qb = this.matchRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.resumeDoc', 'resume').leftJoinAndSelect('m.jobDoc', 'job')
    if (minScore !== undefined) qb.andWhere('m.overallScore >= :minScore', { minScore })
    if (maxScore !== undefined) qb.andWhere('m.overallScore <= :maxScore', { maxScore })
    qb.orderBy('m.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize)
    const [items, total] = await qb.getManyAndCount()
    return { items, total, page, pageSize }
  }

  async getMatchResultDetail(id: string) {
    const r = await this.matchRepo.findOne({ where: { id }, relations: ['resumeDoc', 'jobDoc'] })
    if (!r) throw new NotFoundException('匹配记录不存在')
    return r
  }

  // ==================== LLM Logs ====================

  async getLlmLogs(query: LlmLogFilterDto) {
    const { page = 1, pageSize = 20, callType, model, success } = query
    const where: Record<string, unknown> = {}
    if (callType) where.callType = callType
    if (model) where.model = model
    if (success !== undefined) where.success = success
    const [items, total] = await this.llmLogRepo.findAndCount({
      where, order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize,
    })
    return { items, total, page, pageSize }
  }

  async getLlmLogDetail(id: string) {
    const log = await this.llmLogRepo.findOne({ where: { id } })
    if (!log) throw new NotFoundException('LLM日志不存在')
    return log
  }

  async getLlmStats() {
    try {
      const [totalCalls, successCount, avgResult, byModel, byCallType] = await Promise.all([
        this.llmLogRepo.count(),
        this.llmLogRepo.count({ where: { success: true } }),
        this.llmLogRepo.createQueryBuilder('l').select('AVG(l.latencyMs)', 'avg').where('l.latencyMs IS NOT NULL').getRawOne(),
        this.llmLogRepo.createQueryBuilder('l').select('l.model', 'model').addSelect('COUNT(*)', 'count').addSelect('AVG(l.latencyMs)', 'avgLatency').groupBy('l.model').getRawMany(),
        this.llmLogRepo.createQueryBuilder('l').select('l.callType', 'callType').addSelect('COUNT(*)', 'count').groupBy('l.callType').getRawMany(),
      ])
      return { totalCalls, successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 1000) / 10 : 0, avgLatency: Math.round(avgResult?.avg || 0), byModel: byModel.map(m => ({ ...m, avgLatency: Math.round(m.avgLatency || 0) })), byCallType }
    } catch { return { totalCalls: 0, successRate: 0, avgLatency: 0, byModel: [], byCallType: [] } }
  }

  // ==================== Audit ====================

  private async createAuditLog(adminId: string, action: AuditAction, targetType: AuditTargetType, targetId: string, details?: Record<string, unknown>) {
    const log = this.auditRepo.create({ adminId, action, targetType, targetId, details })
    await this.auditRepo.save(log)
  }

  private sanitize(user: User) {
    const { passwordHash, ...rest } = user
    return rest
  }
}
