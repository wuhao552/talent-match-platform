import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Document,
  DocumentSkill,
  MatchResult,
  Job,
  Application,
  Notification,
  ConversationListItem,
  Message,
  PaginatedResponse,
} from '@/types'

const BASE = '/api'

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${url}`, { ...options, headers })

  // 401/403:token 失效或账号被禁用,清 token 跳回登录页(全局兜底)
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token')
    const p = window.location.pathname
    if (p !== '/' && p !== '/register') {
      window.location.href = '/'
    }
    let message = '登录已过期，请重新登录'
    try { const json = await res.json(); if (json?.message) message = json.message } catch { /* 非 JSON 响应体,保留默认文案 */ }
    throw new Error(message)
  }

  // 安全解析:非 JSON 响应体(如网关 HTML)不应抛出 SyntaxError 掩盖真实 HTTP 状态
  let json: unknown = null
  try { json = await res.json() } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error((json as { message?: string })?.message || `HTTP ${res.status}`)
  }
  return json as T
}

// Auth
export const authApi = {
  login: (data: LoginRequest) =>
    request<ApiResponse<AuthResponse>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  register: (data: RegisterRequest) =>
    request<ApiResponse<AuthResponse>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  profile: () => request<ApiResponse<{ user: AuthResponse['user'] }>>('/auth/profile'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request<ApiResponse<{ message: string }>>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}

// Documents
export const documentApi = {
  upload: async (file: File, docType: 'resume' | 'job_description') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('docType', docType)

    const token = localStorage.getItem('token')
    const res = await fetch(`${BASE}/documents/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || `上传失败 (${res.status})`)
    return json as ApiResponse<Document>
  },

  uploadBatch: async (files: File[], docType: 'resume' | 'job_description') => {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))
    formData.append('docType', docType)

    const token = localStorage.getItem('token')
    const res = await fetch(`${BASE}/documents/upload-batch`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || `上传失败 (${res.status})`)
    return json as ApiResponse<Document[]>
  },
  list: () => request<ApiResponse<Document[]>>('/documents'),
  get: (id: string) => request<ApiResponse<Document>>(`/documents/${id}`),
  delete: (id: string) =>
    request<ApiResponse<void>>(`/documents/${id}`, { method: 'DELETE' }),
  parse: (id: string) =>
    request<ApiResponse<Document>>(`/documents/${id}/parse`, {
      method: 'POST',
    }),
  getSkills: (id: string) =>
    request<ApiResponse<DocumentSkill[]>>(`/documents/${id}/skills`),
  getSkillsBatch: (ids: string[]) =>
    request<ApiResponse<DocumentSkill[]>>(`/documents/skills/batch?${ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&')}`),
}

// Matching
export const matchingApi = {
  calculate: (resumeDocId: string, jobDocId: string) =>
    request<ApiResponse<MatchResult>>('/matching/calculate', {
      method: 'POST',
      body: JSON.stringify({ resumeDocId, jobDocId }),
    }),
  recommend: () =>
    request<ApiResponse<MatchResult[]>>('/matching/recommend', {
      method: 'POST',
    }),
  getResult: (id: string) =>
    request<ApiResponse<MatchResult>>(`/matching/results/${id}`),
  getByJob: (jobDocId: string) =>
    request<ApiResponse<MatchResult[]>>(`/matching/by-job/${jobDocId}`),
  getByResume: (resumeDocId: string) =>
    request<ApiResponse<MatchResult[]>>(`/matching/by-resume/${resumeDocId}`),
  /** SSE URL for streaming a single match pair */
  streamUrl: (resumeId: string, jobId: string) => {
    const token = localStorage.getItem('token') || ''
    return `${BASE}/matching/stream?resumeId=${encodeURIComponent(resumeId)}&jobId=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}`
  },
  /** SSE URL for streaming all matches for a document */
  streamAllUrl: (docId: string) => {
    const token = localStorage.getItem('token') || ''
    return `${BASE}/matching/stream-all?docId=${encodeURIComponent(docId)}&token=${encodeURIComponent(token)}`
  },
}

// Dashboard — aggregated endpoint
export const dashboardApi = {
  get: () =>
    request<
      ApiResponse<{
        documents: Document[]
        skillsMap: Record<string, DocumentSkill[]>
        matches: MatchResult[]
      }>
    >('/dashboard'),
}

/** Build SSE URL for document parse stream */
export function parseStreamUrl(docId: string): string {
  const token = localStorage.getItem('token') || ''
  return `${BASE}/documents/${docId}/parse-stream?token=${encodeURIComponent(token)}`
}

// Jobs
export const jobApi = {
  list: (params?: { keyword?: string; location?: string; employmentType?: string; page?: number; size?: number }) => {
    const q = new URLSearchParams()
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<Job>>>(`/jobs?${q}`)
  },
  get: (id: string) => request<ApiResponse<Job>>(`/jobs/${id}`),
  getByDocument: (documentId: string) => request<ApiResponse<Job>>(`/jobs/by-document/${documentId}`),
  mine: () => request<ApiResponse<Job[]>>('/jobs/mine/list'),
  create: (data: Record<string, unknown>) =>
    request<ApiResponse<Job>>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<ApiResponse<Job>>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    request<ApiResponse<Job>>(`/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: string) => request<ApiResponse<null>>(`/jobs/${id}`, { method: 'DELETE' }),
}

// Applications
export const applicationApi = {
  create: (data: { jobId: string; resumeDocId: string; coverLetter?: string; matchResultId?: string }) =>
    request<ApiResponse<Application>>('/applications', { method: 'POST', body: JSON.stringify(data) }),
  myList: (params?: { status?: string; page?: number; size?: number }) => {
    const q = new URLSearchParams()
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<Application>>>(`/applications?${q}`)
  },
  get: (id: string) => request<ApiResponse<Application>>(`/applications/${id}`),
  withdraw: (id: string) =>
    request<ApiResponse<Application>>(`/applications/${id}/withdraw`, { method: 'PATCH' }),
  listForJob: (jobId: string, params?: { status?: string; page?: number; size?: number }) => {
    const q = new URLSearchParams()
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<Application>>>(`/applications/by-job/${jobId}?${q}`)
  },
  listForEnterprise: (params?: { jobId?: string; status?: string; page?: number; size?: number }) => {
    const q = new URLSearchParams()
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<Application>>>(`/applications/enterprise/all?${q}`)
  },
  updateStatus: (id: string, data: { status: string; note?: string }) =>
    request<ApiResponse<Application>>(`/applications/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
}

// Notifications
export const notificationApi = {
  list: (params?: { unreadOnly?: boolean; page?: number; size?: number }) => {
    const q = new URLSearchParams()
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== false) q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<Notification>>>(`/notifications?${q}`)
  },
  unreadCount: () => request<ApiResponse<{ count: number }>>('/notifications/unread-count'),
  markRead: (id: string) =>
    request<ApiResponse<null>>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () =>
    request<ApiResponse<null>>('/notifications/read-all', { method: 'PATCH' }),
}

// Messages
export const messageApi = {
  createConversation: (data: { receiverId: string; jobId?: string; applicationId?: string }) =>
    request<ApiResponse<{ id: string }>>('/messages/conversations', { method: 'POST', body: JSON.stringify(data) }),
  listConversations: () => request<ApiResponse<ConversationListItem[]>>('/messages/conversations'),
  getMessages: (id: string, params?: { page?: number; size?: number }) => {
    const q = new URLSearchParams()
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) q.set(k, String(v)) })
    return request<ApiResponse<PaginatedResponse<Message>>>(`/messages/conversations/${id}?${q}`)
  },
  sendMessage: (data: { conversationId?: string; receiverId?: string; content: string; jobId?: string }) =>
    request<ApiResponse<Message>>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  unreadCount: () => request<ApiResponse<{ count: number }>>('/messages/unread-count'),
}

// ── AI 助手 ──

export interface InterviewMatchItem {
  id: string
  overallScore: number
  resumeDocId: string
  jobDocId: string
  resumeFilename: string
  jobFilename: string
  hasLlmAssessment: boolean
  createdAt: string
}

export interface ChatContextItem {
  id: string
  type: 'resume' | 'job_description' | 'match'
  label: string
  sublabel?: string
}

export interface InterviewQuestion {
  category: string
  difficulty: string
  question: string
  intent: string
  referenceAnswer: string
  skillTag: string
}

export interface CoachPlan {
  summary: string
  shortTermGoals: Array<{ goal: string; weeks: number; actions: string[] }>
  skillGapsToFill: Array<{
    skill: string
    reason: string
    priority: string
    estimatedWeeks: number
  }>
  learningPath: Array<{ step: string; description: string }>
  jobDirections: Array<{ direction: string; fit: string; reason: string }>
}

export const aiAssistantApi = {
  /** 列出可作为面试题生成上下文的匹配记录 */
  listInterviewMatches: () =>
    request<ApiResponse<InterviewMatchItem[]>>('/ai-assistant/interview-questions/matches'),
  /** 列出可作为聊天上下文的文档/匹配 */
  listChatContexts: () =>
    request<ApiResponse<ChatContextItem[]>>('/ai-assistant/chat/contexts'),
  /** SSE URL：面试题生成（EventSource 用） */
  interviewStreamUrl: (matchId: string) => {
    const token = localStorage.getItem('token') || ''
    return `${BASE}/ai-assistant/interview-questions/stream?matchId=${encodeURIComponent(matchId)}&token=${encodeURIComponent(token)}`
  },
  /** SSE URL：AI 教练生成（EventSource 用） */
  coachStreamUrl: () => {
    const token = localStorage.getItem('token') || ''
    return `${BASE}/ai-assistant/coach/stream?token=${encodeURIComponent(token)}`
  },
  /**
   * 智能问答：POST + 流式响应（EventSource 不支持 POST，改用 fetch + ReadableStream）
   * 返回一个可消费的 Response，调用方用 response.body.getReader() 读取 SSE 行。
   */
  chatStream: async (body: {
    contextType: 'resume' | 'job_description' | 'match'
    contextId: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }): Promise<Response> => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${BASE}/ai-assistant/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.message || `HTTP ${res.status}`)
    }
    return res
  },
}

/**
 * 通用 SSE 行解析器：从 ReadableStream 中按 `event:`/`data:` 解析事件。
 * 既能消费 EventSource 风格的 GET 响应，也能消费 POST 响应里的 SSE 流。
 */
export async function* parseSseStream(
  response: Response,
): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'
  let dataLines: string[] = []

  const emit = function* (): Generator<{ event: string; data: unknown }> {
    if (dataLines.length === 0) return
    const dataStr = dataLines.join('\n')
    dataLines = []
    let parsed: unknown = dataStr
    try {
      parsed = JSON.parse(dataStr)
    } catch {
      // 保留原始字符串
    }
    yield { event: currentEvent, data: parsed }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line === '') {
        // 空行 = 事件分隔符
        for (const ev of emit()) yield ev
        currentEvent = 'message'
      } else if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
  }
  // flush 残余
  for (const ev of emit()) yield ev
}
