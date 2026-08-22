// User
export interface User {
  id: string
  username: string
  role: 'individual' | 'enterprise' | 'admin'
  email?: string
  phone?: string
  city?: string
  intendedCities?: string[]
  companyName?: string
}

// Document
export interface Document {
  id: string
  userId: string
  docType: 'resume' | 'job_description'
  originalFilename: string
  fileFormat: 'pdf' | 'docx' | 'doc'
  parsedText?: string
  parsedJson?: Record<string, unknown>
  status: 'uploaded' | 'parsing' | 'parsed' | 'failed'
  errorMessage?: string
  createdAt: string
}

// Document-Skill association
export interface DocumentSkill {
  id: string
  documentId: string
  skillId: number
  skillName?: string
  skill?: { id: number; name: string; category?: string }
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  confidence?: number
  extractionMethod?: string
  sourceText?: string
  category?: string | null
}

// Match result
export interface MatchResult {
  id: string
  resumeDocId: string
  jobDocId: string
  overallScore: number
  scoreBreakdown?: ScoreBreakdown | null
  matchDetails: MatchDetail[]
  createdAt: string
  // Matching fields
  algorithmTrace?: AlgorithmStep[]
  embeddingTrace?: EmbeddingTraceItem[]
  llmAssessment?: LlmAssessment
  // Enriched fields
  resumeFilename?: string
  candidateName?: string
  candidateCity?: string
  candidateTopSkills?: string[]
  jobFilename?: string
  companyName?: string
  jobTitle?: string
  jobCity?: string
  jobTopSkills?: string[]
  /** JD 结构化摘要(薪资/职责/要求/福利等),来自匹配结果接口,双方可见 */
  jobStructured?: Record<string, unknown> | null
}

export interface MatchDetail {
  skillId: number
  skillName: string
  personProficiency: string
  jobRequirement: string
  matchMethod?: 'exact' | 'embedding'
  resumeSkillId?: number
  jobSkillId?: number
  importance?: string
}

export interface ScoreBreakdown {
  algorithmScore: number
  llmScore: number
  overallScore: number
  matchStatus: 'computed' | 'fallback'
  algorithmDimensions?: {
    coverage: number
    adequacy: number
  }
}

export interface EmbeddingTraceItem {
  jobSkill: string
  bestMatch: string | null
  similarity: number
}

export interface AlgorithmStep {
  phase: string
  label: string
  status: 'done' | 'skipped' | 'error'
  durationMs: number
  summary: string
  data?: Record<string, unknown>
}

export interface LlmAssessment {
  overallFit: number
  strengths: string[]
  gaps: string[]
  transferableSkills: Array<{
    candidateSkill: string
    jobRequirement: string
    transferability: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  readinessMonths: number
  confidence: number
  reasoning: string
}

// API response wrapper
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

// Auth
export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  password: string
  role: 'individual' | 'enterprise'
  email?: string
  phone?: string
  city?: string
  companyName?: string
}

export interface AuthResponse {
  accessToken: string
  user: User
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize?: number
  size?: number
}

// Job
export type JobStatus = 'draft' | 'published' | 'closed' | 'archived'
export type EmploymentType = 'full_time' | 'part_time' | 'internship' | 'contract'

export interface Job {
  id: string
  enterpriseId: string
  documentId?: string | null
  title: string
  companyName?: string
  department?: string
  description: string
  requirements?: Record<string, unknown> | null
  location?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryUnit: string
  experienceRequired?: string
  educationRequired?: string
  employmentType: EmploymentType
  headcount: number
  status: JobStatus
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
  enterprise?: Pick<User, 'id' | 'username' | 'companyName' | 'city'>
}

// Application
export type ApplicationStatus =
  | 'submitted' | 'viewed' | 'screening' | 'interview'
  | 'offer' | 'hired' | 'rejected' | 'withdrawn'

export interface StatusChange {
  status: ApplicationStatus
  at: string
  by: string
  note?: string
}

export interface Application {
  id: string
  jobId: string
  applicantId: string
  resumeDocId: string
  matchResultId?: string | null
  coverLetter?: string
  status: ApplicationStatus
  enterpriseNote?: string
  statusHistory: StatusChange[]
  createdAt: string
  updatedAt: string
  job?: Job
  applicant?: Pick<User, 'id' | 'username' | 'city' | 'companyName'>
}

// Notification
export type NotificationType = 'system' | 'match' | 'application' | 'message' | 'job'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  content: string
  relatedId?: string | null
  relatedType?: string | null
  readAt?: string | null
  createdAt: string
}

// Conversation / Message
export interface ConversationListItem {
  id: string
  otherUser: {
    id: string
    username: string
    role: string
    companyName?: string
  } | null
  jobId?: string | null
  unread: number
  lastMessage: {
    content: string
    createdAt: string
    senderId: string
  } | null
  lastMessageAt?: string | null
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  readAt?: string | null
  createdAt: string
  sender?: Pick<User, 'id' | 'username'>
}
