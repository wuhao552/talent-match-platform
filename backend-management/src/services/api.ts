/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台 API 服务 - 18 个接口: 登录/统计/用户/文档/技能/匹配/LLM日志/修改密码
 */
import type { ApiResponse, PaginatedResponse, AdminUser, AdminDocument, AdminSkill, AdminMatchResult, AdminLlmLog, AdminStats, TrendData, SkillStats, LlmStats, AuthResponse } from '@/types'

const BASE = '/api'

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('admin_token')
  const headers: Record<string, string> = {}
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${url}`, { ...options, headers })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<ApiResponse<AuthResponse>>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getStats: () => request<ApiResponse<AdminStats>>('/admin/stats'),
  getStatsTrend: (days = 7) => request<ApiResponse<TrendData[]>>(`/admin/stats/trend?days=${days}`),

  getUsers: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminUser>>>(`/admin/users?${q}`)
  },
  getUserDetail: (id: string) => request<ApiResponse<AdminUser>>(`/admin/users/${id}`),
  updateUserStatus: (id: string, status: string) =>
    request<ApiResponse<AdminUser>>(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteUser: (id: string) => request<ApiResponse<null>>(`/admin/users/${id}`, { method: 'DELETE' }),

  getDocuments: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminDocument>>>(`/admin/documents?${q}`)
  },
  getDocumentDetail: (id: string) => request<ApiResponse<AdminDocument>>(`/admin/documents/${id}`),
  reparseDocument: (id: string) => request<ApiResponse<{ message: string }>>(`/admin/documents/${id}/reparse`, { method: 'POST' }),
  deleteDocument: (id: string) => request<ApiResponse<null>>(`/admin/documents/${id}`, { method: 'DELETE' }),

  getSkills: (params: Record<string, string | number | boolean>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminSkill>>>(`/admin/skills?${q}`)
  },
  getSkillsStats: () => request<ApiResponse<SkillStats[]>>('/admin/skills/stats'),

  getMatchResults: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminMatchResult>>>(`/admin/matching/results?${q}`)
  },
  getMatchResultDetail: (id: string) => request<ApiResponse<AdminMatchResult>>(`/admin/matching/results/${id}`),

  getLlmLogs: (params: Record<string, string | number | boolean>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminLlmLog>>>(`/admin/llm-logs?${q}`)
  },
  getLlmLogDetail: (id: string) => request<ApiResponse<AdminLlmLog>>(`/admin/llm-logs/${id}`),
  getLlmStats: () => request<ApiResponse<LlmStats>>('/admin/llm-logs/stats'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<ApiResponse<{ message: string }>>('/auth/password', { method: 'PATCH', body: JSON.stringify({ oldPassword, newPassword }) }),
}
