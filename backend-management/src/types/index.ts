/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台类型定义 - 用户/文档/技能/匹配/LLM日志/统计
 */
export interface ApiResponse<T> { code: number; message: string; data: T }
export interface PaginatedResponse<T> { items: T[]; total: number; page: number; pageSize: number }

export interface AdminUser {
  id: string; username: string; role: 'individual' | 'enterprise' | 'admin'
  status: 'active' | 'disabled'; email?: string; phone?: string; city?: string
  intendedCities?: string[]; companyName?: string; createdAt: string; updatedAt: string
}

export interface AdminDocument {
  id: string; userId: string; user?: AdminUser; docType: 'resume' | 'job_description'
  originalFilename: string; fileFormat: string; status: 'uploaded' | 'parsing' | 'parsed' | 'failed'
  errorMessage?: string; parsedText?: string; parsedJson?: Record<string, unknown>; createdAt: string
}

export interface AdminSkill { id: number; name: string; category?: string; hasStructuralBreak?: boolean; isLowFrequency?: boolean; createdAt: string }

export interface MatchDetail { skillId: number; skillName: string; personProficiency: string; jobRequirement: string; score: number }

export interface AdminMatchResult {
  id: string; resumeDocId: string; jobDocId: string; overallScore: number; skillMatchScore: number
  cityMatchBonus: number; matchDetails: MatchDetail[]; createdAt: string; resumeDoc?: AdminDocument; jobDoc?: AdminDocument
}

export interface AdminLlmLog {
  id: string; callType: string; model: string; systemPrompt: string; userMessage: string
  rawResponse?: string; parsedResult?: Record<string, unknown>; success: boolean; fallbackUsed: boolean
  errorMessage?: string; tokensUsed?: number; latencyMs?: number; documentId?: string; createdAt: string
}

export interface AdminStats { totalUsers: number; usersByRole: { role: string; count: number }[]; totalDocuments: number; documentsByType: { docType: string; count: number }[]; totalMatches: number; totalLlmCalls: number }
export interface TrendData { date: string; newUsers: number; newDocuments: number; llmCalls: number }
export interface SkillStats { category: string; count: number }
export interface LlmStats { totalCalls: number; successRate: number; avgLatency: number; byModel: { model: string; count: number; avgLatency: number }[]; byCallType: { callType: string; count: number }[] }
export interface AuthResponse { accessToken: string; user: AdminUser }
