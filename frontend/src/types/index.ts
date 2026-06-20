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

// Skill
export interface Skill {
  id: number
  name: string
  category?: string
  hasStructuralBreak?: boolean
  isLowFrequency?: boolean
}

// Document-Skill association
export interface DocumentSkill {
  id: string
  documentId: string
  skillId: number
  skillName?: string
  skill?: Skill
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
  skillMatchScore: number
  cityMatchBonus: number
  cooccurrenceBonus?: number
  hotnessBonus?: number
  experienceBonus?: number
  industryMatchBonus?: number
  trendBonus?: number
  scoreBreakdown?: ScoreBreakdown | null
  matchDetails: MatchDetail[]
  createdAt: string
  // GraphRAG-style fields
  algorithmTrace?: AlgorithmStep[]
  llmAssessment?: LlmAssessment
  communityContext?: CommunityContext
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
  score: number
  resumeSkillId?: number
  jobSkillId?: number
  importance?: string
  hotnessBoost?: number
}

export interface ScoreBreakdown {
  // Phase 1: Algorithm
  skillMatchScore: number
  cooccurrenceBonus: number
  cityMatchBonus: number
  hotnessBonus: number
  experienceBonus: number
  industryMatchBonus: number
  trendBonus: number
  algorithmScore?: number
  // Phase 2: LLM
  llmScore?: number
  // Phase 3: Fusion
  overallScore: number
  fusionWeights?: { algorithm: number; llm: number }
  matchStatus?: 'computed' | 'fallback'
}

// Algorithm execution trace
export interface AlgorithmStep {
  phase: string
  label: string
  status: 'done' | 'skipped' | 'error'
  durationMs: number
  summary: string
  data?: Record<string, unknown>
}

// LLM assessment result
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

// Community context used during matching
export interface CommunityContext {
  resumeCommunities: Array<{ title: string; summary: string; skillDomain: string }>
  jobCommunities: Array<{ title: string; summary: string; skillDomain: string }>
  domainOverlap: string[]
}

// Graph data for D3
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphNode {
  id: string | number
  label: string
  type: 'skill' | 'person' | 'position' | 'related_skill'
  proficiency?: string
  importance?: string
  hasBreak?: boolean
  isLowFreq?: boolean
}

export interface GraphEdge {
  source: string | number
  target: string | number
  label?: string
  weight?: number
  type?: string
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

