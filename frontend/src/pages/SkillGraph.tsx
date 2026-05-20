import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { documentApi } from '@/services/api'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkillForceGraph } from '@/components/graph/SkillForceGraph'
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
  { key: 'document_parser', label: '文档解析 Agent', desc: '读取文件并调用大模型进行结构化信息提取' },
  { key: 'skill_extractor', label: '技能提取 Agent', desc: '调用大模型提取技能标签与熟练度评估' },
  { key: 'graph_builder', label: '图谱构建 Agent', desc: '将技能关系写入 Neo4j 知识图谱' },
]

const proficiencyLabel: Record<string, string> = {
  beginner: '入门', intermediate: '熟悉', advanced: '熟练', expert: '精通',
}
const proficiencyColor: Record<string, string> = {
  beginner: 'bg-slate-100 text-slate-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-purple-100 text-purple-700',
  expert: 'bg-amber-100 text-amber-700',
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── Pipeline Card ──
function AgentRow({
  agent,
  step,
  index,
  total,
  elapsed,
  allDone,
}: {
  agent: (typeof agents)[0]
  step: PipelineStep
  index: number
  total: number
  elapsed: number
  allDone: boolean
}) {
  const s = step?.status || 'pending'
  const isLast = index === total - 1

  const statusStyle: Record<string, string> = {
    pending: 'border-muted-foreground/20 bg-muted text-muted-foreground',
    running: 'border-blue-400 bg-blue-50 text-blue-700',
    done: 'border-green-400 bg-green-50 text-green-700',
    error: 'border-red-400 bg-red-50 text-red-700',
  }
  const statusBadge: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }
  const statusText: Record<string, string> = {
    pending: '等待', running: '执行中', done: '完成', error: '失败',
  }

  const hasData = step?.status === 'done' && step?.data

  return (
    <div className="relative flex gap-4">
      {/* Vertical connector line */}
      <div className="flex flex-col items-center">
        <div
          className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-mono font-bold transition-all duration-500 ${
            statusStyle[s]
          } ${s === 'running' ? 'shadow-[0_0_12px_rgba(59,130,246,0.3)]' : ''}`}
        >
          {s === 'running' ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            index + 1
          )}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 min-h-[24px] transition-colors duration-500 ${
              s === 'done' ? 'bg-green-300' : s === 'running' ? 'bg-blue-200' : 'bg-border'
            }`}
          />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        <Accordion
          value={((hasData && !allDone) ? [agent.key] : undefined) as any}
        >
          <AccordionItem value={agent.key} className="border-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{agent.label}</span>
              <Badge className={`text-[10px] ${statusBadge[s]}`} variant="outline">
                {s === 'running' && (
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                )}
                {statusText[s]}
              </Badge>
              {s === 'running' && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {formatDuration(elapsed)}
                </span>
              )}
              {s === 'done' && step.data?.latencyMs != null && (
                <span className="text-[10px] text-muted-foreground">
                  {formatDuration(Number(step.data.latencyMs))}
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {step?.summary || agent.desc}
            </p>

            {/* Progress bar while running */}
            {s === 'running' && (
              <Progress value={null} className="mt-2 h-1" />
            )}

            {/* Expand trigger when data available */}
            {hasData && (
              <AccordionTrigger className="mt-1 py-1 text-xs text-muted-foreground hover:no-underline">
                {allDone ? '点击展开查看详情' : '查看详情'}
              </AccordionTrigger>
            )}

            {/* Expanded detail */}
            {hasData && (
              <AccordionContent>
                <div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs space-y-2">
                  {agent.key === 'document_parser' && step.data && (
                    <>
                      <div className="flex gap-4 text-muted-foreground">
                        <span>文本长度: <strong className="text-foreground">{String(step.data.textLength ?? '-')}</strong> 字符</span>
                        <span>模型耗时: <strong className="text-foreground">{formatDuration(Number(step.data.latencyMs ?? 0))}</strong></span>
                      </div>
                      {step.data.textPreview != null && (
                        <div className="rounded bg-background p-2 text-muted-foreground italic">
                          "{String(step.data.textPreview).slice(0, 200)}..."
                        </div>
                      )}
                      {step.data.rawResponse != null && (
                        <details open={!allDone}>
                          <summary className="cursor-pointer font-medium text-primary/80 hover:text-primary">
                            大模型原始响应
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 text-[11px] leading-relaxed">
                            {String(step.data.rawResponse)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}

                  {agent.key === 'skill_extractor' && step.data && (
                    <>
                      <div className="flex gap-4 text-muted-foreground">
                        <span>提取数量: <strong className="text-foreground">{String(step.data.skillCount ?? 0)}</strong> 个</span>
                        <span>模型耗时: <strong className="text-foreground">{formatDuration(Number(step.data.latencyMs ?? 0))}</strong></span>
                      </div>
                      {Array.isArray(step.data.skills) && (step.data.skills as any[]).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(step.data.skills as any[]).map((sk: any, j: number) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">
                              {sk.name}
                              <span className="ml-1 opacity-60">
                                {proficiencyLabel[sk.proficiency] || sk.proficiency}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      )}
                      {step.data.rawResponse != null && (
                        <details open={!allDone}>
                          <summary className="cursor-pointer font-medium text-primary/80 hover:text-primary">
                            大模型原始响应
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 text-[11px] leading-relaxed">
                            {String(step.data.rawResponse)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}

                  {agent.key === 'graph_builder' && step.data && (
                    <div className="text-muted-foreground">
                      已将 <strong className="text-foreground">{String(step.data.nodeCount ?? 0)}</strong> 个技能关系写入 Neo4j 图数据库
                    </div>
                  )}

                  {step?.status === 'error' && step.error && (
                    <p className="text-red-600">{step.error}</p>
                  )}
                </div>
              </AccordionContent>
            )}
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}

// ── Main Page ──
export function SkillGraph() {
  const { docId } = useParams<{ docId: string }>()
  const [document, setDocument] = useState<Document | null>(null)
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [loading, setLoading] = useState(true)

  const [pipelineSteps, setPipelineSteps] = useState<Record<string, PipelineStep>>({})
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineDone, setPipelineDone] = useState(false)
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
        // If doc is already parsed, build pipeline from stored LLM data
        if (doc.status === 'parsed' && doc.parsedJson?.llmCalls) {
          const llm = doc.parsedJson.llmCalls as any
          const steps: Record<string, PipelineStep> = {}
          const now = Date.now()
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
          steps['graph_builder'] = {
            agent: 'graph_builder', status: 'done',
            summary: `知识图谱构建完成: ${s.data.length} 个技能关系已写入 Neo4j`,
            data: { nodeCount: s.data.length },
            timestamp: now,
          }
          setPipelineSteps(steps)
          setPipelineDone(true)
          const totalMs = (llm.documentParse?.latencyMs ?? 0) + (llm.skillExtraction?.latencyMs ?? 0)
          setElapsed(totalMs)
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

    es.addEventListener('start', () => { startRef.current = Date.now() })

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
      setElapsed(Date.now() - startRef.current)
      es.close()
      setTimeout(() => loadDoc(), 500)
    })

    es.onerror = () => { es.close(); setPipelineDone(true) }

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
  const llmCalls = (document.parsedJson?.llmCalls || {}) as Record<string, any>
  const active = pipelineRunning

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isResume ? '个人能力图谱' : '职位能力图谱'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {document.originalFilename}
            {document.status === 'parsed' ? ' — 解析完成' : ' — 解析中...'}
          </p>
        </div>
        {(isProcessing || active) && (
          <Badge variant="secondary" className="animate-pulse">
            处理中
          </Badge>
        )}
        {pipelineDone && (
          <Badge variant="outline" className="text-green-600 border-green-300">
            全部完成
          </Badge>
        )}
      </div>

      {/* ── Pipeline ── */}
      {(isProcessing || active || pipelineDone || Object.keys(pipelineSteps).length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">多 Agent 协同流水线</CardTitle>
                <CardDescription>
                  {!pipelineDone
                    ? `运行中 — ${formatDuration(elapsed)}`
                    : `已完成 — 总耗时 ${formatDuration(elapsed)}`}
                </CardDescription>
              </div>
              {!pipelineDone && (
                <Progress value={null} className="w-24" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {agents.map((a, i) => (
                <AgentRow
                  key={a.key}
                  agent={a}
                  step={pipelineSteps[a.key] || { agent: a.key, status: 'pending', summary: a.desc, timestamp: 0 }}
                  index={i}
                  total={agents.length}
                  elapsed={elapsed}
                  allDone={pipelineDone}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Parsed Results ── */}
      {document.status === 'parsed' && (
        <Tabs defaultValue="skills">
          <TabsList className="w-full">
            <TabsTrigger value="skills" className="flex-1">技能提取 ({skills.length})</TabsTrigger>
            <TabsTrigger value="document" className="flex-1">结构化信息</TabsTrigger>
            <TabsTrigger value="graph" className="flex-1">能力图谱</TabsTrigger>
            <TabsTrigger value="llm" className="flex-1">LLM 原始响应</TabsTrigger>
          </TabsList>

          <TabsContent value="skills" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardDescription>技能总数</CardDescription></CardHeader>
                <CardContent><p className="text-2xl font-bold">{skills.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>平均置信度</CardDescription></CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {skills.length > 0 ? Math.round(skills.reduce((a, b) => a + (b.confidence || 0), 0) / skills.length * 100) : 0}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>文档解析耗时</CardDescription></CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{llmCalls.documentParse ? formatDuration(llmCalls.documentParse.latencyMs) : '-'}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">{isResume ? '个人技能清单' : '职位技能要求'}</CardTitle></CardHeader>
              <CardContent>
                {skills.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">暂未提取到技能标签</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">技能名称</th>
                          <th className="pb-2 pr-4 font-medium">熟练度</th>
                          <th className="pb-2 pr-4 font-medium">经验</th>
                          <th className="pb-2 pr-4 font-medium">置信度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skills.map((s, i) => (
                          <tr key={s.id || i} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{s.skillName || `技能#${s.skillId}`}</td>
                            <td className="py-2.5 pr-4">
                              <span className={`rounded-full px-2 py-0.5 text-xs ${proficiencyColor[s.proficiency] || 'bg-muted'}`}>
                                {proficiencyLabel[s.proficiency] || s.proficiency}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 tabular-nums">{s.yearsOfExperience ? `${s.yearsOfExperience} 年` : '-'}</td>
                            <td className="py-2.5 pr-4 tabular-nums">{Math.round((s.confidence || 0) * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="document" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">大模型自动解析字段</CardTitle>
                <CardDescription>从文档中提取的结构化信息</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(structured).length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">暂无结构化数据</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(structured).map(([key, value]) => (
                      <div key={key} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{key}</p>
                        <p className="mt-1 text-sm font-medium">
                          {value === null || value === undefined
                            ? '-'
                            : Array.isArray(value)
                              ? value.join(', ')
                              : typeof value === 'object'
                                ? JSON.stringify(value, null, 2)
                                : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {document.parsedText && (
              <Card>
                <CardHeader><CardTitle className="text-base">原始文本</CardTitle></CardHeader>
                <CardContent>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-relaxed">
                    {document.parsedText}
                  </pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="graph" className="pt-4">
            <SkillForceGraph skills={skills} />
          </TabsContent>

          <TabsContent value="llm" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">大模型调用记录</CardTitle>
                <CardDescription>每次 LLM API 调用的完整响应</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {llmCalls.documentParse ? (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline">{llmCalls.documentParse.model}</Badge>
                      <span className="text-xs text-muted-foreground">{llmCalls.documentParse.latencyMs}ms</span>
                    </div>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-4 text-xs leading-relaxed">
                      {llmCalls.documentParse.rawResponse || '无记录'}
                    </pre>
                  </div>
                ) : <p className="text-muted-foreground text-sm">无文档解析调用记录</p>}
                <Separator />
                {llmCalls.skillExtraction ? (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline">{llmCalls.skillExtraction.model}</Badge>
                      <span className="text-xs text-muted-foreground">{llmCalls.skillExtraction.latencyMs}ms</span>
                    </div>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-4 text-xs leading-relaxed">
                      {llmCalls.skillExtraction.rawResponse || '无记录'}
                    </pre>
                  </div>
                ) : <p className="text-muted-foreground text-sm">无技能提取调用记录</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {isResume && document.status === 'parsed' && (
          <Button onClick={() => window.location.href = `/matching/${docId}`}>
            查看职位匹配
          </Button>
        )}
        <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
          返回仪表盘
        </Button>
      </div>
    </div>
  )
}
