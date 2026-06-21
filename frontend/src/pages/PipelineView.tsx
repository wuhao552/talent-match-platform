import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { matchingApi, parseStreamUrl, documentApi } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SkillForceGraph } from '@/components/graph/SkillForceGraph'
import {
  ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Brain, FileText, Copy, Check, Network,
} from 'lucide-react'
import type { MatchResult, Document, DocumentSkill } from '@/types'

// ── Types ──

interface PipelineStep {
  phase?: string
  agent?: string
  label?: string
  status: 'pending' | 'running' | 'done' | 'error'
  summary: string
  data?: Record<string, unknown>
  error?: string
  timestamp?: number
  durationMs?: number
}

interface LlmCall {
  agent: string
  systemPrompt: string
  userMessage: string
  response: string
  done: boolean
}

interface MatchPair {
  resumeId: string
  jobId: string
  resumeFilename: string
  jobFilename: string
  steps: PipelineStep[]
  llmCalls: LlmCall[]
  result?: MatchResult
  error?: string
  algorithmScore?: number
  algorithmDimensions?: { coverage: number; adequacy: number; domainOverlap: number; transferBonus: number }
  rank?: number
}

// ── Status Icon ──

function StatusIcon({ status }: { status: PipelineStep['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
  if (status === 'error') return <XCircle className="h-4 w-4 text-muted-foreground" />
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20" />
}

// ── Parse Step Component ──

function ParseStep({ step, streamText, expanded, onToggle }: {
  step: PipelineStep
  streamText?: string
  expanded: boolean
  onToggle: () => void
}) {
  const hasStream = !!(step.status === 'running' && streamText && streamText.length > 0)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={onToggle} className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors">
        <StatusIcon status={step.status} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{step.label || step.phase || step.agent || ''}</span>
          {step.status !== 'pending' && <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.summary}</p>}
        </div>
        {step.durationMs != null && step.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{step.durationMs}ms</span>
        )}
        {step.status === 'running' && <Badge variant="secondary" className="text-[10px] animate-pulse">运行中</Badge>}
        {step.status === 'done' && <Badge variant="outline" className="text-[10px]">完成</Badge>}
        {step.status === 'error' && <Badge variant="destructive" className="text-[10px]">失败</Badge>}
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {expanded ? (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
          <div className="text-xs text-muted-foreground">{String(step.summary || '')}</div>

          {hasStream ? (
            <div className="relative">
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-[11px] leading-relaxed font-mono">
                {streamText || ''}<span className="animate-pulse">▋</span>
              </pre>
            </div>
          ) : null}

          {step.status === 'done' && step.data?.rawResponse ? (
            <div className="relative">
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-[11px] leading-relaxed font-mono">
                {String(step.data.rawResponse)}
              </pre>
            </div>
          ) : null}

          {step.data ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">结构化数据</summary>
              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-[11px] font-mono">
                {JSON.stringify(step.data, null, 2)}
              </pre>
            </details>
          ) : null}

          {step.error ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {step.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ── LLM Assessment parsing ──

/** Try to extract and parse a partial or complete JSON assessment from streaming response. */
function tryParseAssessment(response: string): Partial<{
  overallFit: number
  strengths: string[]
  gaps: string[]
  transferableSkills: Array<{ candidateSkill: string; jobRequirement: string; transferability: string; reasoning: string }>
  readinessMonths: number
  confidence: number
  reasoning: string
}> | null {
  if (!response || response.length < 2) return null
  const match = response.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    // Partial JSON — try to extract individual fields via regex
    const result: Record<string, unknown> = {}
    const numMatch = response.match(/"overallFit"\s*:\s*(\d+(?:\.\d+)?)/)
    if (numMatch) result.overallFit = Number(numMatch[1])
    const confMatch = response.match(/"confidence"\s*:\s*(\d+(?:\.\d+)?)/)
    if (confMatch) result.confidence = Number(confMatch[1])
    const readyMatch = response.match(/"readinessMonths"\s*:\s*(\d+)/)
    if (readyMatch) result.readinessMonths = Number(readyMatch[1])
    // Try to extract arrays
    const strengthsMatch = response.match(/"strengths"\s*:\s*\[([\s\S]*?)\]/)
    if (strengthsMatch) {
      result.strengths = (strengthsMatch[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''))
    }
    const gapsMatch = response.match(/"gaps"\s*:\s*\[([\s\S]*?)\]/)
    if (gapsMatch) {
      result.gaps = (gapsMatch[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''))
    }
    const reasoningMatch = response.match(/"reasoning"\s*:\s*"([\s\S]*?)(?:"|$)/)
    if (reasoningMatch) result.reasoning = reasoningMatch[1]
    return Object.keys(result).length > 0 ? result as any : null
  }
}

// ── LLM Assessment Card (prominent display) ──

function LlmAssessmentCard({ call }: { call: LlmCall }) {
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const responseRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (responseRef.current && !call.done) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [call.response, call.done])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(call.response).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [call.response])

  // 流式输出阶段：只展示原始回复，不解析/展示结构化数据。
  // 执行完毕（call.done）后才解析并展示结构化评估结果。
  const isStreaming = !call.done && call.response.length > 0
  const assessment = call.done ? tryParseAssessment(call.response) : null
  const score = assessment?.overallFit
  const confidence = assessment?.confidence
  const readiness = assessment?.readinessMonths

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
        <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">LLM 深度评估</span>
        {call.done ? (
          <Badge variant="outline" className="text-[10px] ml-auto">完成</Badge>
        ) : isStreaming ? (
          <Badge variant="secondary" className="text-[10px] animate-pulse ml-auto">流式输出中</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] ml-auto">等待响应</Badge>
        )}
      </div>

      {/* ── 流式阶段：仅展示原始回复 ── */}
      {!call.done && (
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground">LLM 原始回复（流式）</p>
            <span className="text-[10px] text-muted-foreground tabular-nums">{call.response.length} 字符</span>
          </div>
          <pre
            ref={responseRef}
            className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2.5 text-[11px] leading-relaxed font-mono"
          >
            {call.response || '等待 LLM 响应...'}{isStreaming && <span className="animate-pulse">▋</span>}
          </pre>
          {call.response.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />正在生成评估...
            </div>
          )}
        </div>
      )}

      {/* ── 完成阶段：展示结构化数据 ── */}
      {call.done && (
        <>
          {/* Score bar */}
          <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
            {score != null ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tabular-nums">{Math.round(score)}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                {confidence != null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>置信度</span>
                    <span className="font-medium text-foreground tabular-nums">{Math.round(confidence * 100)}%</span>
                  </div>
                )}
                {readiness != null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>上岗周期</span>
                    <span className="font-medium text-foreground">{readiness} 个月</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                未解析到结构化评分
              </div>
            )}
          </div>

          {/* Structured assessment — prominent */}
          {assessment && (
            <div className="px-4 pb-3 space-y-3">
              {/* Strengths */}
              {assessment.strengths && assessment.strengths.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />匹配优势
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {assessment.strengths.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {/* Gaps */}
              {assessment.gaps && assessment.gaps.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <XCircle className="h-3 w-3" />能力差距
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {assessment.gaps.map((g, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{g}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Transferable skills */}
              {assessment.transferableSkills && assessment.transferableSkills.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">可迁移技能</p>
                  <div className="space-y-1">
                    {assessment.transferableSkills.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{t.candidateSkill}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{t.jobRequirement}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {t.transferability === 'high' ? '高' : t.transferability === 'medium' ? '中' : '低'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {assessment.reasoning && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">综合评估理由</p>
                  <p className="text-xs leading-relaxed text-foreground/90 rounded-md bg-muted/40 p-3">
                    {assessment.reasoning}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Raw response — collapsible（完成后展示；流式阶段已在上方展示） */}
      {call.done && (
        <div className="border-t">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-muted/30 transition-colors"
          >
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              {showRaw ? '收起' : '展开'} Prompt 与原始回复
            </span>
            {call.response.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{call.response.length} 字符</span>
            )}
            {showRaw ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </button>
          {showRaw && (
            <div className="px-4 pb-3 space-y-2">
              <details>
                <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground hover:text-foreground">System Prompt</summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2.5 text-[10px] font-mono">
                  {call.systemPrompt}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground hover:text-foreground">User Message（上下文）</summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2.5 text-[10px] font-mono">
                  {call.userMessage}
                </pre>
              </details>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium text-muted-foreground">LLM 原始回复</p>
                  <button onClick={handleCopy} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                    {copied ? <><Check className="h-3 w-3" />已复制</> : <><Copy className="h-3 w-3" />复制</>}
                  </button>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2.5 text-[10px] leading-relaxed font-mono">
                  {call.response || '等待 LLM 响应...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Compact Step Chips ──

function StepChips({ steps }: { steps: PipelineStep[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (steps.length === 0) return null

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {steps.map(step => {
          const key = step.phase || step.agent || ''
          const isActive = expanded === key
          return (
            <button
              key={key}
              onClick={() => setExpanded(isActive ? null : key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border transition-colors ${
                step.status === 'running' ? 'border-foreground/20 bg-muted/50' :
                step.status === 'error' ? 'border-foreground/20 bg-muted/50' :
                'border-muted bg-muted/30 text-muted-foreground'
              } ${isActive ? 'ring-1 ring-offset-1 ring-offset-background' : ''}`}
            >
              <StatusIcon status={step.status} />
              <span className="font-medium">{step.label || key}</span>
              {step.durationMs != null && step.durationMs > 0 && (
                <span className="tabular-nums opacity-60">{step.durationMs}ms</span>
              )}
            </button>
          )
        })}
      </div>
      {expanded && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{steps.find(s => (s.phase || s.agent) === expanded)?.summary}</p>
          {(() => {
            const step = steps.find(s => (s.phase || s.agent) === expanded)
            if (!step) return null
            return (
              <>
                {step.data?.rawResponse && (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2.5 text-[10px] font-mono">
                    {String(step.data.rawResponse)}
                  </pre>
                )}
                {step.data && Object.keys(step.data).length > 0 && step.data.rawResponse == null && (
                  <details>
                    <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">结构化数据</summary>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2.5 text-[10px] font-mono">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  </details>
                )}
                {step.error && (
                  <div className="rounded-md border bg-muted/30 p-2 text-[10px] text-muted-foreground">
                    {step.error}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Match Pair Display ──

function MatchPairDisplay({ pair }: { pair: MatchPair }) {
  const isRunning = pair.steps.some(s => s.status === 'running')
  const isDone = pair.result != null
  const isError = pair.error != null

  // For completed matches loaded from cache (no live steps/llmCalls)
  const isCached = isDone && pair.steps.length === 0 && pair.llmCalls.length === 0
  const cachedAssessment = isCached ? pair.result?.llmAssessment : null
  const cachedScore = isCached ? pair.result?.overallScore : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {pair.rank && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium tabular-nums shrink-0">#{pair.rank}</span>
            )}
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            {isDone && <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />}
            {isError && <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
            <CardTitle className="text-sm truncate">
              {pair.resumeFilename} × {pair.jobFilename}
            </CardTitle>
          </div>
          {/* Score — prominent */}
          {cachedScore != null ? (
            <div className="flex items-baseline gap-4 shrink-0">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums">{Math.round(cachedScore)}</span>
                <span className="text-xs text-muted-foreground">综合分</span>
              </div>
              {pair.result?.scoreBreakdown && (
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-semibold tabular-nums text-muted-foreground">{Math.round(pair.result.scoreBreakdown.algorithmScore)}</span>
                  <span className="text-[10px] text-muted-foreground">算法分</span>
                </div>
              )}
            </div>
          ) : pair.algorithmScore != null && (
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-lg font-bold tabular-nums text-muted-foreground">{Math.round(pair.algorithmScore)}</span>
              <span className="text-[10px] text-muted-foreground">算法分</span>
            </div>
          )}
        </div>
        {/* Algorithm dimensions */}
        {pair.algorithmDimensions && !isDone && (
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">覆盖率 {Math.round(pair.algorithmDimensions.coverage * 100)}%</span>
            <span className="text-[10px] text-muted-foreground">达标率 {Math.round(pair.algorithmDimensions.adequacy * 100)}%</span>
            <span className="text-[10px] text-muted-foreground">领域重叠 {Math.round(pair.algorithmDimensions.domainOverlap * 100)}%</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Compact pipeline steps */}
        {pair.steps.length > 0 && <StepChips steps={pair.steps} />}

        {/* LLM Assessment — prominent */}
        {pair.llmCalls.map((call, i) => (
          <LlmAssessmentCard key={i} call={call} />
        ))}

        {/* Cached assessment summary (from stored result) */}
        {isCached && cachedAssessment && (
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
              <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">LLM 深度评估</span>
              <Badge variant="outline" className="text-[10px] ml-auto">完成</Badge>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tabular-nums">{Math.round(cachedAssessment.overallFit)}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>置信度</span>
                  <span className="font-medium text-foreground tabular-nums">{Math.round(cachedAssessment.confidence * 100)}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>上岗周期</span>
                  <span className="font-medium text-foreground">{cachedAssessment.readinessMonths} 个月</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {cachedAssessment.strengths.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />匹配优势
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cachedAssessment.strengths.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {cachedAssessment.gaps.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <XCircle className="h-3 w-3" />能力差距
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cachedAssessment.gaps.map((g, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{g}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {cachedAssessment.transferableSkills.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">可迁移技能</p>
                  <div className="space-y-1">
                    {cachedAssessment.transferableSkills.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{t.candidateSkill}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{t.jobRequirement}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {t.transferability === 'high' ? '高' : t.transferability === 'medium' ? '中' : '低'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cachedAssessment.reasoning && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">综合评估理由</p>
                  <p className="text-xs leading-relaxed text-foreground/90 rounded-md bg-muted/40 p-3">{cachedAssessment.reasoning}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cached match details badges */}
        {isCached && pair.result?.matchDetails && pair.result.matchDetails.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pair.result.matchDetails.slice(0, 10).map((d, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{d.skillName}</Badge>
            ))}
            {pair.result.matchDetails.length > 10 && (
              <Badge variant="outline" className="text-[10px]">+{pair.result.matchDetails.length - 10}</Badge>
            )}
          </div>
        )}

        {/* Error */}
        {pair.error && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">{pair.error}</div>
        )}

        {/* Result link */}
        {pair.result && (
          <Button size="sm" variant="outline" className="w-full" onClick={() => window.location.href = `/matching/${pair.result!.id}`}>
            查看完整匹配详情
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Pipeline View ──

export function PipelineView() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [phase, setPhase] = useState<'parse' | 'match' | 'done'>('parse')
  const [parseSteps, setParseSteps] = useState<Record<string, PipelineStep>>({})
  const [parseStream, setParseStream] = useState<Record<string, string>>({})
  const [parseDone, setParseDone] = useState(false)
  const [expandedParseSteps, setExpandedParseSteps] = useState<Set<string>>(new Set())
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([])
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Document & skills data (loaded after parse completes)
  const [document, setDocument] = useState<Document | null>(null)
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [resumeSkills, setResumeSkills] = useState<DocumentSkill[]>([])
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [alreadyParsed, setAlreadyParsed] = useState(false)

  // ── On mount: check if document is already parsed ──
  useEffect(() => {
    if (!docId) return
    const id = docId
    let cancelled = false
    async function checkExisting() {
      try {
        const docRes = await documentApi.get(id)
        if (cancelled || !docRes.data) return
        const doc = docRes.data
        setDocument(doc)
        setSkills((await documentApi.getSkills(id)).data as DocumentSkill[])

        if (doc.status === 'parsed') {
          // Document already parsed — load stored pipeline steps and existing matches
          setAlreadyParsed(true)
          const storedPipeline = (doc.parsedJson as any)?.pipeline as PipelineStep[] | undefined
          if (storedPipeline && storedPipeline.length > 0) {
            const steps: Record<string, PipelineStep> = {}
            for (const step of storedPipeline) {
              const key = step.phase || step.agent || ''
              if (step.status === 'done' || step.status === 'error' || !steps[key]) {
                steps[key] = step
              }
            }
            setParseSteps(steps)
          }
          setParseDone(true)

          // Load existing match results instead of re-running
          try {
            const isResume = doc.docType === 'resume'
            let matches: MatchResult[] = []
            if (isResume) {
              matches = (await matchingApi.getByResume(id)).data
            } else {
              matches = (await matchingApi.getByJob(id)).data
            }
            if (cancelled) return
            if (matches.length > 0) {
              setMatchPairs(matches.map((m) => ({
                resumeId: m.resumeDocId, jobId: m.jobDocId,
                resumeFilename: m.resumeFilename || '',
                jobFilename: m.jobFilename || '',
                steps: [], llmCalls: [],
                result: m,
              })))
              setPhase('done')
              if (timerRef.current) clearInterval(timerRef.current)
            } else {
              // No existing matches — run match stream (keep alreadyParsed=true to skip parse phase)
              setPhase('match')
            }
          } catch {
            // No existing matches — run match stream
            setPhase('match')
          }
        }
      } catch (err) {
        console.error('[Pipeline] Failed to check existing doc:', err)
      }
    }
    checkExisting()
    return () => { cancelled = true }
  }, [docId])

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 100)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // ── Load document & skills after parse completes ──
  const loadDocAndSkills = useCallback(async () => {
    if (!docId) return
    try {
      const [docRes, skillRes] = await Promise.all([
        documentApi.get(docId),
        documentApi.getSkills(docId),
      ])
      setDocument(docRes.data)
      setSkills(skillRes.data as DocumentSkill[])
    } catch (err) {
      console.error('[Pipeline] Failed to load doc/skills:', err)
    }
  }, [docId])

  // ── Load comparison data (for individual viewing a job doc) ──
  useEffect(() => {
    if (!document || !docId || !user || user.role !== 'individual') return
    if (document.docType !== 'job_description' || document.status !== 'parsed') return

    let cancelled = false
    async function loadComparison() {
      try {
        const docsRes = await documentApi.list()
        if (cancelled) return
        const myResume = docsRes.data.find(
          (d) => d.userId === user!.id && d.docType === 'resume' && d.status === 'parsed',
        )
        if (!myResume) return
        const skRes = await documentApi.getSkills(myResume.id)
        if (cancelled) return
        const mySkills = skRes.data as DocumentSkill[]
        setResumeSkills(mySkills)

        let match: MatchResult | null = null
        try {
          const existing = await matchingApi.getByJob(docId!)
          if (cancelled) return
          match = existing.data.find((m) => m.resumeDocId === myResume.id) || null
        } catch { /* no existing match */ }
        if (!match && !cancelled) {
          const calcRes = await matchingApi.calculate(myResume.id, docId!)
          if (cancelled) return
          match = calcRes.data
        }
        if (match) setMatchResult(match)
      } catch (err) {
        console.error('[Pipeline] Failed to load comparison data:', err)
      }
    }
    loadComparison()
    return () => { cancelled = true }
  }, [document?.status, document?.docType, docId, user?.id])

  // ── Phase 1: Parse Stream (skip if already parsed) ──
  useEffect(() => {
    if (!docId || alreadyParsed) return
    const es = new EventSource(parseStreamUrl(docId))

    es.addEventListener('start', () => { startRef.current = Date.now() })

    es.addEventListener('progress', (e) => {
      const step: PipelineStep = JSON.parse(e.data)
      const key = step.phase || step.agent || ''
      setParseSteps(prev => ({ ...prev, [key]: step }))
    })

    es.addEventListener('chunk', (e) => {
      const { agent, token } = JSON.parse(e.data)
      setParseStream(prev => ({ ...prev, [agent]: (prev[agent] || '') + token }))
    })

    es.addEventListener('complete', () => {
      setParseDone(true)
      es.close()
      loadDocAndSkills()
      setPhase('match')
    })

    es.addEventListener('error', () => {
      setParseDone(true)
      es.close()
      loadDocAndSkills()
      setPhase('match')
    })

    return () => es.close()
  }, [docId, loadDocAndSkills, alreadyParsed])

  // ── Phase 2: Match Stream ──
  useEffect(() => {
    if (phase !== 'match' || !docId) return

    const es = new EventSource(matchingApi.streamAllUrl(docId))

    es.addEventListener('start', () => {
      // Match stream started
    })

    es.addEventListener('match_start', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => [...prev, {
        resumeId: data.resumeId, jobId: data.jobId,
        resumeFilename: data.resumeFilename, jobFilename: data.jobFilename,
        steps: [], llmCalls: [],
        algorithmScore: data.algorithmScore,
        algorithmDimensions: data.algorithmDimensions,
        rank: data.rank,
      }])
    })

    es.addEventListener('progress', (e) => {
      const step: PipelineStep & { resumeId?: string; jobId?: string } = JSON.parse(e.data)
      // 批量事件（resumeId/jobId 为空）广播到所有匹配对
      if (!step.resumeId && !step.jobId) {
        setMatchPairs(prev => prev.map(p => {
          const existing = p.steps.findIndex(s => s.phase === step.phase)
          const steps = [...p.steps]
          if (existing >= 0) steps[existing] = step
          else steps.push(step)
          return { ...p, steps }
        }))
        return
      }
      setMatchPairs(prev => prev.map(p => {
        if (p.resumeId !== step.resumeId || p.jobId !== step.jobId) return p
        const existing = p.steps.findIndex(s => s.phase === step.phase)
        const steps = [...p.steps]
        if (existing >= 0) steps[existing] = step
        else steps.push(step)
        return { ...p, steps }
      }))
    })

    es.addEventListener('prompt', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (data.resumeId && p.resumeId !== data.resumeId) return p
        if (data.jobId && p.jobId !== data.jobId) return p
        if (p.llmCalls.some(c => c.agent === data.agent)) return p
        return { ...p, llmCalls: [...p.llmCalls, { agent: data.agent, systemPrompt: data.systemPrompt, userMessage: data.userMessage, response: '', done: false }] }
      }))
    })

    es.addEventListener('chunk', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (data.resumeId && p.resumeId !== data.resumeId) return p
        if (data.jobId && p.jobId !== data.jobId) return p
        return { ...p, llmCalls: p.llmCalls.map(c => c.agent === data.agent ? { ...c, response: c.response + data.token } : c) }
      }))
    })

    es.addEventListener('match_complete', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (p.resumeId !== data.resumeId || p.jobId !== data.jobId) return p
        return { ...p, llmCalls: p.llmCalls.map(c => ({ ...c, done: true })) }
      }))
    })

    es.addEventListener('match_error', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (p.resumeId !== data.resumeId || p.jobId !== data.jobId) return p
        return {
          ...p,
          error: data.message,
          llmCalls: p.llmCalls.map(c => ({ ...c, done: true })),
        }
      }))
    })

    es.addEventListener('result', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (p.resumeId !== data.resumeDocId || p.jobId !== data.jobDocId) return p
        return { ...p, result: data }
      }))
    })

    es.addEventListener('complete', () => {
      setMatchPairs(prev => prev.map(p => ({
        ...p,
        llmCalls: p.llmCalls.map(c => ({ ...c, done: true })),
      })))
      setPhase('done')
      es.close()
      if (timerRef.current) clearInterval(timerRef.current)
    })

    es.addEventListener('error', () => {
      setPhase('done')
      es.close()
    })

    return () => es.close()
  }, [phase, docId])

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const parseStepList = [
    { phase: 'text_extractor', label: '文本提取' },
    { phase: 'document_parser', label: '文档结构化解析' },
    { phase: 'skill_extractor', label: '技能提取' },
    { phase: 'skill_matcher', label: '技能匹配' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">人才匹配处理流水线</h1>
          <p className="text-sm text-muted-foreground">
            {phase === 'parse' ? '阶段一: 文档解析' : phase === 'match' ? '阶段二: LLM 匹配评估' : '处理完成'}
          </p>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">{formatTime(elapsed)}</span>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2">
        <Badge variant={phase === 'parse' ? 'default' : 'outline'} className="text-xs">解析</Badge>
        <div className="flex-1 h-px bg-border" />
        <Badge variant={phase === 'match' ? 'default' : 'outline'} className="text-xs">匹配</Badge>
        <div className="flex-1 h-px bg-border" />
        <Badge variant={phase === 'done' ? 'default' : 'outline'} className="text-xs">完成</Badge>
      </div>

      {/* Phase 1: Parse Steps */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            阶段一: 文档解析
            {parseDone && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {parseStepList.map(({ phase: p, label }) => {
            const step = parseSteps[p]
            const isStreaming = step?.status === 'running' && parseStream[p] && parseStream[p].length > 0
            return (
              <ParseStep
                key={p}
                step={step || { phase: p, label, status: 'pending', summary: '' }}
                streamText={parseStream[p]}
                expanded={isStreaming || expandedParseSteps.has(p)}
                onToggle={() => setExpandedParseSteps(prev => { const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s })}
              />
            )
          })}
        </CardContent>
      </Card>

      {/* Skill Graph (shown after parse completes) */}
      {parseDone && document && document.status === 'parsed' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4" />
              能力图谱
              {skills.length > 0 && <Badge variant="secondary" className="text-[10px]">{skills.length} 项技能</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const graphLayout = ((document.parsedJson as any)?.graphLayout) as
                | { nodes: Array<{ id: string; x: number; y: number; label: string; proficiency: string; isCenter: boolean }>; links: Array<{ source: string; target: string; matched: boolean }> }
                | undefined
              const unmatchedSkills = ((document.parsedJson as any)?.unmatchedSkills || []) as Array<{ name: string; proficiency: string }>
              const rawExtractedSkills = ((document.parsedJson as any)?.extractedSkills || []) as Array<{ name: string; proficiency: string }>
              const existingNames = new Set(skills.map((s) => s.skillName?.toLowerCase()).filter(Boolean))
              const graphSkills: DocumentSkill[] = [
                ...skills,
                ...unmatchedSkills
                  .filter((s) => !existingNames.has(s.name.toLowerCase()))
                  .map((s, i) => ({
                    id: `unmatched-${i}`, documentId: '', skillId: -(i + 1),
                    skillName: s.name, proficiency: (s.proficiency || 'intermediate') as DocumentSkill['proficiency'],
                  })),
                ...(skills.length === 0 && unmatchedSkills.length === 0
                  ? rawExtractedSkills.map((s, i) => ({
                      id: `raw-${i}`, documentId: '', skillId: -(i + 1000),
                      skillName: s.name, proficiency: (s.proficiency || 'intermediate') as DocumentSkill['proficiency'],
                    }))
                  : []),
              ]
              if (graphSkills.length === 0) {
                return <p className="py-8 text-center text-sm text-muted-foreground">暂无技能数据</p>
              }
              if (resumeSkills.length > 0) {
                return (
                  <SkillForceGraph
                    skills={resumeSkills}
                    jobSkills={graphSkills}
                    matchedSkillIds={matchResult?.matchDetails?.filter((d) => d.skillId > 0).map((d) => d.skillId)}
                    matchedPairs={matchResult?.matchDetails?.map((d) => ({ resumeSkillId: d.resumeSkillId, jobSkillId: d.jobSkillId }))}
                  />
                )
              }
              return <SkillForceGraph skills={graphSkills} precomputedLayout={graphLayout} />
            })()}
          </CardContent>
        </Card>
      )}

      {/* Phase 2: Match Pairs */}
      {matchPairs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">阶段二: LLM 匹配评估</h2>
            <span className="text-xs text-muted-foreground">({matchPairs.length} 对匹配)</span>
          </div>
          {[...matchPairs]
            .sort((a, b) => {
              const sa = a.result?.scoreBreakdown?.algorithmScore ?? a.algorithmScore ?? 0
              const sb = b.result?.scoreBreakdown?.algorithmScore ?? b.algorithmScore ?? 0
              return sb - sa
            })
            .map((pair, i) => (
              <MatchPairDisplay key={`${pair.resumeId}-${pair.jobId}-${i}`} pair={pair} />
            ))}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-lg font-medium">处理完成</p>
            <p className="text-sm text-muted-foreground mt-1">
              耗时 {formatTime(elapsed)} · {matchPairs.filter(p => p.result).length} 对匹配成功
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <Button variant="outline" onClick={() => navigate('/dashboard')}>返回工作台</Button>
              {(() => {
                const best = [...matchPairs]
                  .filter(p => p.result)
                  .sort((a, b) => (b.result!.overallScore ?? 0) - (a.result!.overallScore ?? 0))[0]
                return best?.result ? (
                  <Button onClick={() => navigate(`/matching/${best.result!.id}`)}>查看最佳匹配</Button>
                ) : null
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
