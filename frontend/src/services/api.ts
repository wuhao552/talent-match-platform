import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Document,
  DocumentSkill,
  MatchResult,
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
  const json = await res.json()

  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return json
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

// Graph — Neo4j dependency removed; graphApi kept as no-op for backward compat
export const graphApi = {
  getCooccurrenceBatch: () =>
    Promise.resolve({ code: 200, message: 'ok', data: [] as Array<{ sourceId: number; targetId: number; freqSkill: number }> }),
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
