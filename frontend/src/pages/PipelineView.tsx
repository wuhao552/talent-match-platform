import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { matchingApi, parseStreamUrl } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor } from '@/lib/utils'
import {
  ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Brain, FileText, Copy, Check,
} from 'lucide-react'
import type { MatchResult } from '@/types'

// ── Types ──

interface PipelineStep {
  phase: string
  label: string
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
}

// ── Status Icon ──

function StatusIcon({ status }: { status: PipelineStep['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-500" />
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
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
          <span className="text-sm font-medium">{step.label}</span>
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
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {step.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ── LLM Call Display ──

function LlmCallDisplay({ call, expanded, onToggle }: {
  call: LlmCall
  expanded: boolean
  onToggle: () => void
}) {
  const [copied, setCopied] = useState(false)
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

  return (
    <div className="border rounded-lg overflow-hidden border-purple-200 dark:border-purple-900/50">
      <button onClick={onToggle} className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-colors">
        <Brain className="h-4 w-4 text-purple-500" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">LLM 评估 — {call.agent}</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {call.done ? `回复 ${call.response.length} 字符` : '正在生成...'}
          </p>
        </div>
        {call.done && <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-600">完成</Badge>}
        {!call.done && call.response.length > 0 && <Badge variant="secondary" className="text-[10px] animate-pulse">流式输出中</Badge>}
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t bg-purple-50/30 dark:bg-purple-950/10 px-4 py-3 space-y-3">
          {/* Prompt (collapsible) */}
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Prompt（点击展开）
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">System Prompt</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-[11px] font-mono">
                  {call.systemPrompt}
                </pre>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">User Message（上下文）</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-[11px] font-mono">
                  {call.userMessage}
                </pre>
              </div>
            </div>
          </details>

          {/* Streaming Response */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-medium text-muted-foreground">LLM 原始回复（流式）</p>
              <button onClick={handleCopy} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                {copied ? <><Check className="h-3 w-3" />已复制</> : <><Copy className="h-3 w-3" />复制</>}
              </button>
            </div>
            <pre
              ref={responseRef}
              className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-[11px] leading-relaxed font-mono"
            >
              {call.response || '等待 LLM 响应...'}{!call.done && call.response.length > 0 && <span className="animate-pulse">▋</span>}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Match Pair Display ──

function MatchPairDisplay({ pair }: { pair: MatchPair }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [expandedLlm, setExpandedLlm] = useState<Set<number>>(new Set([0]))
  const toggleStep = (phase: string) => {
    setExpandedSteps(prev => { const s = new Set(prev); s.has(phase) ? s.delete(phase) : s.add(phase); return s })
  }
  const toggleLlm = (idx: number) => {
    setExpandedLlm(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s })
  }

  const isRunning = pair.steps.some(s => s.status === 'running')
  const isDone = pair.result != null
  const isError = pair.error != null

  return (
    <Card className={isDone ? 'border-green-200 dark:border-green-900/50' : isError ? 'border-red-200 dark:border-red-900/50' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {isDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {isError && <XCircle className="h-4 w-4 text-red-500" />}
            <CardTitle className="text-sm">
              {pair.resumeFilename} × {pair.jobFilename}
            </CardTitle>
          </div>
          {pair.result && (
            <span className={`text-lg font-bold tabular-nums ${scoreColor(pair.result.overallScore)}`}>
              {Math.round(pair.result.overallScore)}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Parse/Match Steps */}
        {pair.steps.map(step => (
          <ParseStep key={step.phase} step={step} expanded={expandedSteps.has(step.phase)} onToggle={() => toggleStep(step.phase)} />
        ))}

        {/* LLM Calls */}
        {pair.llmCalls.map((call, i) => (
          <LlmCallDisplay key={i} call={call} expanded={expandedLlm.has(i)} onToggle={() => toggleLlm(i)} />
        ))}

        {/* Error */}
        {pair.error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{pair.error}</div>
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

  const [phase, setPhase] = useState<'parse' | 'match' | 'done'>('parse')
  const [parseSteps, setParseSteps] = useState<Record<string, PipelineStep>>({})
  const [parseStream, setParseStream] = useState<Record<string, string>>({})
  const [parseDone, setParseDone] = useState(false)
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([])
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 100)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // ── Phase 1: Parse Stream ──
  useEffect(() => {
    if (!docId) return
    const es = new EventSource(parseStreamUrl(docId))

    es.addEventListener('start', () => { startRef.current = Date.now() })

    es.addEventListener('progress', (e) => {
      const step: PipelineStep = JSON.parse(e.data)
      setParseSteps(prev => ({ ...prev, [step.phase]: step }))
    })

    es.addEventListener('chunk', (e) => {
      const { agent, token } = JSON.parse(e.data)
      setParseStream(prev => ({ ...prev, [agent]: (prev[agent] || '') + token }))
    })

    es.addEventListener('complete', () => {
      setParseDone(true)
      es.close()
      setPhase('match')
    })

    es.addEventListener('error', () => {
      setParseDone(true)
      es.close()
      setPhase('match')
    })

    return () => es.close()
  }, [docId])

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
      }])
    })

    es.addEventListener('progress', (e) => {
      const step: PipelineStep & { resumeId?: string; jobId?: string } = JSON.parse(e.data)
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
        if (p.resumeId !== data.resumeId || p.jobId !== data.jobId) return p
        if (p.llmCalls.some(c => c.agent === data.agent)) return p
        return { ...p, llmCalls: [...p.llmCalls, { agent: data.agent, systemPrompt: data.systemPrompt, userMessage: data.userMessage, response: '', done: false }] }
      }))
    })

    es.addEventListener('chunk', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (p.resumeId !== data.resumeId || p.jobId !== data.jobId) return p
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

    es.addEventListener('result', (e) => {
      const data = JSON.parse(e.data)
      setMatchPairs(prev => prev.map(p => {
        if (p.resumeId !== data.resumeDocId || p.jobId !== data.jobDocId) return p
        return { ...p, result: data }
      }))
    })

    es.addEventListener('complete', () => {
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
    { phase: 'skill_gleaning', label: 'Gleaning 深度挖掘' },
    { phase: 'skill_resolver', label: 'LLM 技能解析' },
    { phase: 'community_detection', label: '社区发现' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">GraphRAG 处理流水线</h1>
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
            {parseDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {parseStepList.map(({ phase: p, label }) => {
            const step = parseSteps[p]
            return (
              <ParseStep
                key={p}
                step={step || { phase: p, label, status: 'pending', summary: '' }}
                streamText={parseStream[p]}
                expanded={false}
                onToggle={() => {}}
              />
            )
          })}
        </CardContent>
      </Card>

      {/* Phase 2: Match Pairs */}
      {matchPairs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <h2 className="text-lg font-semibold">阶段二: LLM 匹配评估</h2>
            <span className="text-xs text-muted-foreground">({matchPairs.length} 对匹配)</span>
          </div>
          {matchPairs.map((pair, i) => (
            <MatchPairDisplay key={`${pair.resumeId}-${pair.jobId}-${i}`} pair={pair} />
          ))}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <Card className="border-green-200 dark:border-green-900/50">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-500 mb-3" />
            <p className="text-lg font-medium">处理完成</p>
            <p className="text-sm text-muted-foreground mt-1">
              耗时 {formatTime(elapsed)} · {matchPairs.filter(p => p.result).length} 对匹配成功
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <Button variant="outline" onClick={() => navigate('/dashboard')}>返回工作台</Button>
              {matchPairs[0]?.result && (
                <Button onClick={() => navigate(`/matching/${matchPairs[0].result!.id}`)}>查看最佳匹配</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
