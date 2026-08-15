/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台 API 服务 - 18 个接口: 登录/统计/用户/文档/技能/匹配/LLM日志/修改密码
 */
import type { ApiResponse, PaginatedResponse, AdminUser, AdminDocument, AdminSkill, AdminMatchResult, AdminLlmLog, AdminStats, TrendData, SkillStats, LlmStats, AuthResponse, AdminJob, AdminApplication } from '@/types'

const BASE = '/api'

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('admin_token')
  const headers: Record<string, string> = {}
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${url}`, { ...options, headers })

  // 401/403:清 token 并跳回登录页(禁用用户/过期 token 的全局兜底)
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('admin_token')
    if (window.location.pathname !== '/admin/login') {
      window.location.href = '/admin/login'
    }
    let message = '登录已过期，请重新登录'
    try { const json = await res.json(); if (json?.message) message = json.message } catch { /* 非 JSON 响应体,保留默认文案 */ }
    throw new Error(message)
  }

  // 安全解析:204/非 JSON 响应体不应抛出 SyntaxError 掩盖真实 HTTP 状态
  let json: unknown = null
  try { json = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error((json as { message?: string })?.message || `HTTP ${res.status}`)
  return json as T
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

  // Jobs
  getJobs: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminJob>>>(`/admin/jobs?${q}`)
  },
  getJobDetail: (id: string) => request<ApiResponse<AdminJob>>(`/admin/jobs/${id}`),
  updateJobStatus: (id: string, status: string) =>
    request<ApiResponse<AdminJob>>(`/admin/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteJob: (id: string) => request<ApiResponse<null>>(`/admin/jobs/${id}`, { method: 'DELETE' }),

  // Applications
  getApplications: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<AdminApplication>>>(`/admin/applications?${q}`)
  },
  getApplicationDetail: (id: string) => request<ApiResponse<AdminApplication>>(`/admin/applications/${id}`),

  // Notifications broadcast
  broadcastNotification: (data: { type: string; title: string; content: string }) =>
    request<ApiResponse<{ count: number }>>('/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify(data) }),
}
