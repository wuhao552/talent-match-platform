import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentApi } from '@/services/api'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkillForceGraph } from '@/components/graph/SkillForceGraph'
import { formatDuration, proficiencyLabel, proficiencyColor } from '@/lib/utils'
import type { Document, DocumentSkill } from '@/types'

interface PipelineStep {
  agent: string
  status: 'pending' | 'running' | 'done' | 'error'
  summary: string
  data?: Record<string, unknown>
  error?: string
  timestamp: number
}

const agents = [
  { key: 'text_extractor', label: '文本提取', desc: '从PDF/DOCX文件中提取原始文本' },
  { key: 'document_parser', label: '文档解析 Agent', desc: '调用大模型进行结构化信息提取（不含技能）' },
  { key: 'skill_extractor', label: '技能提取 Agent', desc: '调用大模型提取技能标签与熟练度评估' },
]

// ── Pipeline Step ──
function AgentStep({
  agent,
  step,
  index,
  isLast,
  streamText,
}: {
  agent: (typeof agents)[0]
  step: PipelineStep
  index: number
  isLast: boolean
  streamText: string
}) {
  const s = step?.status || 'pending'

  const statusDot: Record<string, string> = {
    pending: 'border-muted-foreground/25 bg-muted',
    running: 'border-blue-400 bg-blue-100 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
    done: 'border-green-400 bg-green-100',
    error: 'border-red-400 bg-red-100',
  }
  const statusText: Record<string, string> = {
    pending: '等待', running: '执行中', done: '完成', error: '失败',
  }
  const badgeVariant: Record<string, 'secondary' | 'default' | 'destructive' | 'outline'> = {
    pending: 'secondary', running: 'default', done: 'outline', error: 'destructive',
  }

  const rawResponse = s === 'done' ? String(step.data?.rawResponse ?? '') : ''
  const hasRaw = rawResponse.length > 0
  const skillsList = s === 'done' && agent.key === 'skill_extractor' && Array.isArray(step.data?.skills) ? (step.data!.skills as any[]) : null
  const hasSkills = skillsList && skillsList.length > 0
  const isResolution = s === 'done' && agent.key === 'skill_resolution'
  const resolutionTotal = isResolution ? (step.data?.totalExtracted as number) ?? 0 : 0
  const resolutionMatched = isResolution ? (step.data?.matched as number) ?? 0 : 0
  const resolutionUnique = isResolution ? (step.data?.uniqueCanonical as number) ?? 0 : 0
  const hasGraph = s === 'done' && agent.key === 'graph_builder' && step.data?.nodeCount != null

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${statusDot[s]}`}>
          {s === 'running' ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          ) : s === 'done' ? (
            <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : s === 'error' ? (
            <span className="text-xs font-bold text-red-500">!</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">{index + 1}</span>
          )}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-[16px] transition-colors ${
            s === 'done' ? 'bg-green-200' : s === 'running' ? 'bg-blue-200' : 'bg-border'
          }`} />
        )}
      </div>

      <div className={`flex-1 ${isLast ? '' : 'pb-4'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{agent.label}</span>
          <Badge variant={badgeVariant[s]} className="text-[10px]">
            {statusText[s]}
          </Badge>
          {s === 'done' && step.data?.latencyMs != null && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatDuration(Number(step.data.latencyMs))}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {step?.summary || agent.desc}
        </p>

        {s === 'running' && <div className="mt-1.5 h-0.5 w-full animate-pulse rounded-full bg-blue-200" />}

        {s === 'running' && streamText && (
          <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-2.5 text-[11px] leading-relaxed text-muted-foreground transition-all">
            {streamText}
          </pre>
        )}

        {hasRaw && (
          <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {rawResponse}
          </pre>
        )}

        {hasSkills && (
          <div className="mt-2 flex flex-wrap gap-1">
            {skillsList!.map((sk: any, j: number) => (
              <Badge key={j} variant="secondary" className="text-[10px]">
                {sk.name}
                <span className="ml-1 opacity-50">{proficiencyLabel[sk.proficiency] || sk.proficiency}</span>
              </Badge>
            ))}
          </div>
        )}

        {isResolution && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">提取技能: <strong className="text-foreground">{resolutionTotal}</strong></span>
              <span className="text-green-600">匹配成功: <strong>{resolutionMatched}</strong></span>
              <span className="text-muted-foreground">映射到: <strong className="text-foreground">{resolutionUnique}</strong> 个标准技能</span>
            </div>
          </div>
        )}

        {hasGraph && (
          <p className="mt-1 text-xs text-muted-foreground">
            已将 <strong className="text-foreground">{String(step.data!.nodeCount ?? 0)}</strong> 个技能关系写入 Neo4j
          </p>
        )}

        {s === 'error' && step.error && (
          <p className="mt-1 text-xs text-red-600">{step.error}</p>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──
export function SkillGraph() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const [document, setDocument] = useState<Document | null>(null)
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [loading, setLoading] = useState(true)

  const [pipelineSteps, setPipelineSteps] = useState<Record<string, PipelineStep>>({})
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineDone, setPipelineDone] = useState(false)
  const [pipelineExpanded, setPipelineExpanded] = useState(true)
  const [streamText, setStreamText] = useState<Record<string, string>>({})
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)

  const token = localStorage.getItem('token') || ''

  const loadDoc = useCallback(() => {
    if (!docId) return
    Promise.all([documentApi.get(docId), documentApi.getSkills(docId)])
      .then(([d, s]) => {
        const doc = d.data
        setDocument(doc)
        setSkills(s.data)
        // If doc is already parsed, load stored pipeline steps from parsedJson
        if (doc.status === 'parsed') {
          const storedPipeline = (doc.parsedJson as any)?.pipeline as PipelineStep[] | undefined
          if (storedPipeline && storedPipeline.length > 0) {
            const steps: Record<string, PipelineStep> = {}
            for (const step of storedPipeline) {
              // Keep only the latest step per agent (done overwrites running)
              if (step.status === 'done' || step.status === 'error' || !steps[step.agent]) {
                steps[step.agent] = step
              }
            }
            setPipelineSteps(steps)
            setPipelineDone(true)
            setPipelineExpanded(false)
            // Sum latencies from done steps
            let total = 0
            for (const s of Object.values(steps)) {
              if (s.data?.latencyMs) total += Number(s.data.latencyMs)
            }
            setElapsed(total || 1)
          } else {
            // Fallback: reconstruct from llmCalls (legacy data)
            const llm = (doc.parsedJson as any)?.llmCalls as any
            if (llm) {
              const now = Date.now()
              const steps: Record<string, PipelineStep> = {}
              steps['document_parser'] = {
                agent: 'document_parser', status: 'done',
                summary: '文档解析完成',
                data: {
                  textLength: doc.parsedText?.length ?? 0,
                  textPreview: doc.parsedText?.slice(0, 200) ?? '',
                  latencyMs: llm.documentParse?.latencyMs ?? 0,
                  model: llm.documentParse?.model ?? '',
                  rawResponse: llm.documentParse?.rawResponse ?? '',
                },
                timestamp: now,
              }
              steps['skill_extractor'] = {
                agent: 'skill_extractor', status: 'done',
                summary: `大模型提取 ${s.data.length} 个技能标签`,
                data: {
                  skillCount: s.data.length,
                  skills: s.data.map((sk: any) => ({ name: sk.skillName, proficiency: sk.proficiency })),
                  latencyMs: llm.skillExtraction?.latencyMs ?? 0,
                  model: llm.skillExtraction?.model ?? '',
                  rawResponse: llm.skillExtraction?.rawResponse ?? '',
                },
                timestamp: now,
              }
              setPipelineSteps(steps)
              setPipelineDone(true)
              setPipelineExpanded(false)
              const totalMs = (llm.documentParse?.latencyMs ?? 0) + (llm.skillExtraction?.latencyMs ?? 0)
              setElapsed(totalMs)
            }
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [docId])

  useEffect(() => { loadDoc() }, [loadDoc])

  // Auto-connect SSE when doc needs parsing
  useEffect(() => {
    if (!document || !docId || !token) return
    if (document.status !== 'uploaded' && document.status !== 'parsing') return
    if (pipelineRunning) return

    const url = `/api/documents/${docId}/parse-stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    setPipelineRunning(true)
    startRef.current = Date.now()

    const init: Record<string, PipelineStep> = {}
    for (const a of agents) {
      init[a.key] = { agent: a.key, status: 'pending', summary: a.desc, timestamp: Date.now() }
    }
    setPipelineSteps(init)
    setStreamText({})

    es.addEventListener('start', () => { startRef.current = Date.now() })

    es.addEventListener('chunk', (e: MessageEvent) => {
      const { agent, token } = JSON.parse(e.data)
      setStreamText((prev) => ({ ...prev, [agent]: (prev[agent] || '') + token }))
    })

    es.addEventListener('progress', (e: MessageEvent) => {
      const step: PipelineStep = JSON.parse(e.data)
      setPipelineSteps((prev) => ({ ...prev, [step.agent]: step }))
    })

    es.addEventListener('result', (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      setDocument((prev) =>
        prev ? { ...prev, status: 'parsed', parsedJson: data.parsedJson, parsedText: data.parsedText } : prev,
      )
    })

    es.addEventListener('complete', () => {
      setPipelineDone(true)
      setPipelineExpanded(false)
      setElapsed(Date.now() - startRef.current)
      es.close()
      setTimeout(() => loadDoc(), 500)
    })

    es.onerror = () => { es.close(); setPipelineDone(true); setPipelineExpanded(false) }

    return () => { es.close() }
  }, [document?.status, docId, token])

  // Timer
  useEffect(() => {
    if (!pipelineRunning || pipelineDone) return
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 100)
    return () => clearInterval(t)
  }, [pipelineRunning, pipelineDone])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-muted-foreground">加载中...</span>
      </div>
    )
  }
  if (!document) return <div className="py-12 text-center text-muted-foreground">文档不存在</div>

  const isResume = document.docType === 'resume'
  const isProcessing = document.status === 'uploaded' || document.status === 'parsing'
  const structured = (document.parsedJson?.structured || {}) as Record<string, unknown>
  const summary = typeof structured.summary === 'string' ? structured.summary : ''
  const eduList = Array.isArray(structured.education) ? (structured.education as any[]) : []
  const expList = Array.isArray(structured.experience) ? (structured.experience as any[]) : []
  const scalarFields: [string, string][] = []
  for (const [k, v] of Object.entries(structured)) {
    if (['summary', 'skills', 'education', 'experience'].includes(k)) continue
    if (v == null || typeof v === 'object') continue
    scalarFields.push([k, String(v)])
  }
  const active = pipelineRunning

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Pipeline ── */}
      {(isProcessing || active || pipelineDone || Object.keys(pipelineSteps).length > 0) && (
        <Card>
          <CardHeader
            className={`flex flex-row items-center justify-between space-y-0 ${pipelineExpanded ? 'pb-3' : 'pb-0'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-sm font-medium truncate">{document.originalFilename}</CardTitle>
              {pipelineDone ? (
                <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
                  全部完成
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] animate-pulse">
                  运行中
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(elapsed)}
              </span>
              {pipelineDone && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => setPipelineExpanded(!pipelineExpanded)}
                >
                  {pipelineExpanded ? '收起' : '展开'}
                </Button>
              )}
            </div>
          </CardHeader>

          {pipelineExpanded && (
            <CardContent>
              {agents.map((a, i) => (
                <AgentStep
                  key={a.key}
                  agent={a}
                  step={pipelineSteps[a.key] || { agent: a.key, status: 'pending', summary: a.desc, timestamp: 0 }}
                  index={i}
                  isLast={i === agents.length - 1}
                  streamText={streamText[a.key] || ''}
                />
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Parsed Results ── */}
      {document.status === 'parsed' && (
        <Tabs defaultValue="graph">
          <TabsList className="w-full">
            <TabsTrigger value="graph" className="flex-1">能力图谱</TabsTrigger>
            <TabsTrigger value="result" className="flex-1">解析结果</TabsTrigger>
          </TabsList>

          <TabsContent value="graph" className="pt-4">
            <SkillForceGraph skills={skills} />
          </TabsContent>

          <TabsContent value="result" className="space-y-6 pt-4">
            {/* Skills list */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">
                  {isResume ? '个人技能清单' : '职位技能要求'}
                </CardTitle>
                <Badge variant="secondary" className="text-[11px]">{skills.length}</Badge>
              </CardHeader>
              <CardContent>
                {skills.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">暂未提取到技能标签</p>
                ) : (
                  <div className="divide-y">
                    {skills.map((s, i) => (
                      <div key={s.id || i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                        <span className="text-sm font-medium">{s.skillName || `技能#${s.skillId}`}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${proficiencyColor[s.proficiency] || 'bg-muted'}`}>
                          {proficiencyLabel[s.proficiency] || s.proficiency}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Unmatched skills — LLM extracted but no canonical ID */}
            {(() => {
              const unmatched = (document.parsedJson as any)?.unmatchedSkills as Array<{ name: string; proficiency: string }> | undefined
              if (!unmatched || unmatched.length === 0) return null
              return (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">未匹配技能</CardTitle>
                    <CardDescription>以下技能由大模型提取，但在标准技能库中未找到对应ID，可通过名称模糊匹配参与评分</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {unmatched.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[11px] border-dashed">
                          {s.name}
                          <span className="ml-1 opacity-40">{proficiencyLabel[s.proficiency] || s.proficiency}</span>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Structured fields */}
            {Object.keys(structured).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">结构化信息</CardTitle>
                  <CardDescription>从文档中提取的字段</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Scalar fields */}
                  {scalarFields.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {scalarFields.map(([k, v]) => (
                        <div key={k} className="rounded-lg border px-3 py-2.5">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
                          <span className="mt-0.5 block text-sm font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {summary && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">summary</p>
                      <p className="rounded-lg border p-3 text-sm leading-relaxed text-muted-foreground">{summary}</p>
                    </div>
                  )}

                  {eduList.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">education</p>
                      <div className="space-y-2">
                        {eduList.map((edu: any, i: number) => (
                          <div key={i} className="rounded-lg border p-3">
                            <p className="text-sm font-medium">{edu.school || `教育经历 #${i + 1}`}</p>
                            <p className="text-xs text-muted-foreground">
                              {[edu.major, edu.degree, edu.year].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {expList.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">experience</p>
                      <div className="space-y-3">
                        {expList.map((exp: any, i: number) => (
                          <div key={i} className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{exp.title || `经历 #${i + 1}`}</span>
                              {exp.company && (
                                <span className="text-xs text-muted-foreground">@ {exp.company}</span>
                              )}
                              {exp.duration && (
                                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{exp.duration}</span>
                              )}
                            </div>
                            {exp.description && (
                              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{exp.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Raw parsed text */}
            {document.parsedText && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">原始文本</CardTitle>
                  <CardDescription>文档解析的纯文本输出</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-relaxed">
                    {document.parsedText}
                  </pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          返回仪表盘
        </Button>
      </div>
    </div>
  )
}
