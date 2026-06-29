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
