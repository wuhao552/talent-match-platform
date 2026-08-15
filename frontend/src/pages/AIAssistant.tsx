import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { scoreColor } from '@/lib/utils'
import {
  aiAssistantApi,
  type InterviewMatchItem,
  type InterviewQuestion,
  type CoachPlan,
} from '@/services/api'
import {
  Brain, GraduationCap, Sparkles,
  ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'

// ════════════════════════════════════════════════════════════════
//  通用：流式 LLM 输出展示
// ════════════════════════════════════════════════════════════════

function StreamingPanel({
  streaming,
  text,
  done,
  error,
}: {
  streaming: boolean
  text: string
  done: boolean
  error: string | null
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="inline-block h-4 w-4 mr-1.5" />
        {error}
      </div>
    )
  }
  if (!streaming && !text && !done) return null
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          LLM 实时输出
          {streaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed text-muted-foreground max-h-72 overflow-auto">
          {text || (streaming ? '等待大模型响应...' : '')}
          {streaming && <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse" />}
        </pre>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════
//  Tab 1: 面试题生成
// ════════════════════════════════════════════════════════════════

const CATEGORY_COLORS: Record<string, string> = {
  技术深度: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  差距探测: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  迁移能力: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  行为项目: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  基础: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  进阶: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  压栈: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

function InterviewTab() {
  const [matches, setMatches] = useState<InterviewMatchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMatchId, setSelectedMatchId] = useState<string>('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  async function loadMatches() {
    try {
      setLoading(true)
      const res = await aiAssistantApi.listInterviewMatches()
      setMatches(res.data)
      if (res.data.length > 0 && !selectedMatchId) {
        // 优先选带 llmAssessment 的
        const withLlm = res.data.find((m) => m.hasLlmAssessment)
        setSelectedMatchId((withLlm || res.data[0]).id)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMatches()
    return () => {
      esRef.current?.close()
    }
  }, [])

  function startGenerate() {
    if (!selectedMatchId || streaming) return
    esRef.current?.close()
    setStreaming(true)
    setStreamText('')
    setQuestions([])
    setError(null)

    const url = aiAssistantApi.interviewStreamUrl(selectedMatchId)
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('chunk', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (data.token) setStreamText((prev) => prev + data.token)
      } catch { /* ignore */ }
    })
    es.addEventListener('result', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (Array.isArray(data.questions)) setQuestions(data.questions)
      } catch { /* ignore */ }
    })
    es.addEventListener('error', (e) => {
      // EventSource error 事件没有 data 字段；只有真正发送了 error 事件时才有
      const me = e as MessageEvent
      if (me.data) {
        try {
          const data = JSON.parse(me.data)
          setError(data.message || '生成失败')
        } catch {
          setError('生成失败')
        }
      } else if (es.readyState === EventSource.CLOSED) {
        // 服务端正常关闭
      } else {
        setError('连接异常断开')
      }
      setStreaming(false)
    })
    es.addEventListener('complete', () => {
      setStreaming(false)
      es.close()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            面试题智能生成
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            基于候选人-职位匹配结果，围绕优势/差距/可迁移技能生成 6-8 道定制化面试题
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <label className="text-xs font-medium text-muted-foreground">选择匹配记录</label>
          {loading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              <Loader2 className="inline-block h-4 w-4 animate-spin mr-1.5" />
              加载中...
            </div>
          ) : matches.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              暂无匹配记录，请先完成简历-JD 匹配评估
            </div>
          ) : (
            <div className="mt-2 space-y-1.5 max-h-56 overflow-auto">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMatchId(m.id)}
                  className={`w-full text-left p-2.5 rounded-lg border text-sm transition-colors ${
                    selectedMatchId === m.id
                      ? 'border-primary bg-primary-soft'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {m.jobFilename}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        简历: {m.resumeFilename}
                        {m.hasLlmAssessment && ' · 含 LLM 评估'}
                      </div>
                    </div>
                    <div className={`text-sm font-bold tabular-nums ${scoreColor(m.overallScore)}`}>
                      {Math.round(m.overallScore)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          onClick={startGenerate}
          disabled={!selectedMatchId || streaming || matches.length === 0}
        >
          {streaming ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              生成面试题
            </>
          )}
        </Button>
        {!streaming && questions.length > 0 && (
          <Button variant="outline" onClick={startGenerate}>
            重新生成
          </Button>
        )}
      </div>

      <StreamingPanel
        streaming={streaming}
        text={streamText}
        done={questions.length > 0}
        error={error}
      />

      {questions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              生成的面试题（{questions.length} 道）
            </h3>
          </div>
          {questions.map((q, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[q.category] || 'bg-gray-100'}`}>
                        {q.category}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DIFFICULTY_COLORS[q.difficulty] || ''}`}>
                        {q.difficulty}
                      </span>
                      {q.skillTag && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">
                          {q.skillTag}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium mb-2 leading-relaxed">{q.question}</p>
                    {q.intent && (
                      <div className="text-xs text-muted-foreground mb-2">
                        <span className="font-medium">考察点：</span>
                        {q.intent}
                      </div>
                    )}
                    {q.referenceAnswer && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-primary hover:underline">
                          查看参考答案要点
                        </summary>
                        <p className="mt-1.5 pl-3 border-l-2 border-primary/30 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {q.referenceAnswer}
                        </p>
                      </details>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Tab 2: 候选人 AI 教练
// ════════════════════════════════════════════════════════════════

const PRIORITY_COLORS: Record<string, string> = {
  高: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  中: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  低: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const FIT_COLORS: Record<string, string> = {
  高: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  中: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  低: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

function CoachTab() {
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [plan, setPlan] = useState<CoachPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    return () => {
      esRef.current?.close()
    }
  }, [])

  function startGenerate() {
    if (streaming) return
    esRef.current?.close()
    setStreaming(true)
    setStreamText('')
    setPlan(null)
    setError(null)

    const url = aiAssistantApi.coachStreamUrl()
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('chunk', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (data.token) setStreamText((prev) => prev + data.token)
      } catch { /* ignore */ }
    })
    es.addEventListener('result', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (data.plan) setPlan(data.plan)
      } catch { /* ignore */ }
    })
    es.addEventListener('error', (e) => {
      const me = e as MessageEvent
      if (me.data) {
        try {
          const data = JSON.parse(me.data)
          setError(data.message || '生成失败')
        } catch {
          setError('生成失败')
        }
      } else if (es.readyState !== EventSource.CLOSED) {
        setError('连接异常断开')
      }
      setStreaming(false)
    })
    es.addEventListener('complete', () => {
      setStreaming(false)
      es.close()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            候选人 AI 教练
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            基于你的技能图谱与最近匹配评估，生成个性化职业成长计划（短期目标 / 技能补齐 / 学习路径 / 推荐方向）
          </p>
        </div>
        <Button onClick={startGenerate} disabled={streaming}>
          {streaming ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              规划中...
            </>
          ) : plan ? (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              重新生成
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              生成职业计划
            </>
          )}
        </Button>
      </div>

      <StreamingPanel
        streaming={streaming}
        text={streamText}
        done={plan !== null}
        error={error}
      />

      {plan && (
        <div className="space-y-4">
          {plan.summary && (
            <Card className="border-primary/20 bg-primary-soft/30">
              <CardContent className="pt-4">
                <div className="text-xs font-medium text-primary mb-1.5">整体诊断</div>
                <p className="text-sm leading-relaxed">{plan.summary}</p>
              </CardContent>
            </Card>
          )}

          {plan.shortTermGoals.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">短期目标（1-3 个月）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.shortTermGoals.map((g, i) => (
                  <div key={i} className="border-l-2 border-primary/40 pl-3">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium text-sm">{g.goal}</span>
                      <Badge variant="outline" className="text-[10px] py-0 h-4">{g.weeks} 周</Badge>
                    </div>
                    {g.actions.length > 0 && (
                      <ul className="mt-1.5 ml-5 space-y-0.5 text-xs text-muted-foreground list-disc">
                        {g.actions.map((a, j) => <li key={j}>{a}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {plan.skillGapsToFill.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">技能补齐清单</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {plan.skillGapsToFill.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIORITY_COLORS[s.priority] || ''}`}>
                      {s.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{s.skill}</span>
                        <Badge variant="outline" className="text-[10px] py-0 h-4">{s.estimatedWeeks} 周</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {plan.learningPath.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">学习路径</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2.5">
                  {plan.learningPath.map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                        {i + 1}
                      </div>
                      <div className="flex-1 pt-0.5">
                        <div className="font-medium text-sm">{s.step}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {plan.jobDirections.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">推荐岗位方向</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {plan.jobDirections.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg border">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${FIT_COLORS[d.fit] || ''}`}>
                      匹配 {d.fit}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{d.direction}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  主页面
// ════════════════════════════════════════════════════════════════

export function AIAssistant() {
  const [tab, setTab] = useState('interview')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          AI 智能助手
        </h1>
        <p className="text-muted-foreground mt-1">
          面试题生成 · 职业成长教练，让 AI 把匹配结果转化为可执行的下一步
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="interview" className="text-xs sm:text-sm">
            <Brain className="h-3.5 w-3.5 mr-1" />
            面试题
          </TabsTrigger>
          <TabsTrigger value="coach" className="text-xs sm:text-sm">
            <GraduationCap className="h-3.5 w-3.5 mr-1" />
            AI 教练
          </TabsTrigger>
        </TabsList>
        <TabsContent value="interview" className="mt-4">
          <InterviewTab />
        </TabsContent>
        <TabsContent value="coach" className="mt-4">
          <CoachTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
