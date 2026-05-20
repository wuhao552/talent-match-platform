import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Document,
  Skill,
  DocumentSkill,
  MatchResult,
  GraphData,
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
}

// Documents
export const documentApi = {
  upload: (file: File, docType: 'resume' | 'job_description') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('docType', docType)

    const token = localStorage.getItem('token')
    return fetch(`${BASE}/documents/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then((r) => r.json()) as Promise<ApiResponse<Document>>
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
}

// Skills
export const skillApi = {
  list: (params?: { page?: number; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.search) query.set('search', params.search)
    return request<ApiResponse<Skill[]>>(`/skills?${query}`)
  },
  get: (id: number) => request<ApiResponse<Skill>>(`/skills/${id}`),
  getRelated: (id: number) =>
    request<ApiResponse<Skill[]>>(`/skills/${id}/related`),
}

// Graph
export const graphApi = {
  getPersonGraph: (userId: string) =>
    request<ApiResponse<GraphData>>(`/graph/person/${userId}`),
  getPositionGraph: (docId: string) =>
    request<ApiResponse<GraphData>>(`/graph/position/${docId}`),
  getSkillNetwork: (skillId?: number) =>
    request<ApiResponse<GraphData>>(
      `/graph/skill-network${skillId ? `?skillId=${skillId}` : ''}`,
    ),
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
  getResults: () => request<ApiResponse<MatchResult[]>>('/matching/results'),
  getResult: (id: string) =>
    request<ApiResponse<MatchResult>>(`/matching/results/${id}`),
}
