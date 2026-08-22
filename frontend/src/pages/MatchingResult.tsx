import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { matchingApi, documentApi, jobApi, applicationApi } from '@/services/api'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { ApplyDialog } from '@/components/application/ApplyDialog'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor, proficiencyLabel } from '@/lib/utils'
import { SkillForceGraph } from '@/components/graph/SkillForceGraph'
import {
  ArrowLeft, MapPin, Building, Clock, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, Loader2, Brain, GitBranch, Zap,
  TrendingUp, ArrowRightLeft, ListChecks, Gift, Send,
} from 'lucide-react'
import type { MatchResult, Document, DocumentSkill, AlgorithmStep, Job } from '@/types'
import { MatchChatPanel } from '@/components/ai/MatchChatPanel'

// ── Pipeline step icon ──
function StepIcon({ status }: { status: AlgorithmStep['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-500" />
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
}

// ── Phase icon ──
function PhaseIcon({ phase }: { phase: string }) {
  const icons: Record<string, React.ReactNode> = {
    skill_matching: <GitBranch className="h-4 w-4" />,
    llm_assessment: <Brain className="h-4 w-4" />,
    score_fusion: <Zap className="h-4 w-4" />,
    data_loading: <Loader2 className="h-4 w-4" />,
    result: <CheckCircle2 className="h-4 w-4" />,
  }
  return <>{icons[phase] || <GitBranch className="h-4 w-4" />}</>
}

// ── Transferability badge ──
function TransferBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { label: '高', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    medium: { label: '中', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { label: '低', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  }
  const c = config[level] || config.low
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.className}`}>{c.label}</span>
}

export function MatchingResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isIndividual = user?.role === 'individual'
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [jobDoc, setJobDoc] = useState<Document | null>(null)
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [jobSkills, setJobSkills] = useState<DocumentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reparsing, setReparsing] = useState(false)

  // 投递相关(仅个人用户)
  const [applyJob, setApplyJob] = useState<Job | null>(null)
  const [applied, setApplied] = useState(false)
  const [myResumes, setMyResumes] = useState<Document[]>([])
  const [showApply, setShowApply] = useState(false)

  useEffect(() => {
    if (!id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次进入拉取匹配结果
    setLoading(true)
    matchingApi.getResult(id)
      .then(async (res) => {
        setMatch(res.data)
        const [job, sk, jsk] = await Promise.all([
          documentApi.get(res.data.jobDocId).then((r) => r.data).catch(() => null),
          documentApi.getSkills(res.data.resumeDocId).then((r) => r.data).catch(() => [] as DocumentSkill[]),
          documentApi.getSkills(res.data.jobDocId).then((r) => r.data).catch(() => [] as DocumentSkill[]),
        ])
        setJobDoc(job)
        // 求职者/企业只能读取自己拥有的文档，对方文档技能接口会返回无权限；
        // 匹配结果接口已附带双方完整技能（含未匹配技能），这里自动兜底。
        setSkills(sk.length > 0 ? sk : (res.data.resumeSkills || []))
        setJobSkills(jsk.length > 0 ? jsk : (res.data.jobSkills || []))
      })
      .catch(() => setError('未找到该匹配结果'))
      .finally(() => setLoading(false))
  }, [id])

  // 个人用户:加载该 JD 关联的岗位、是否已投递、可选简历
  useEffect(() => {
    if (!isIndividual || !match?.jobDocId) return
    let cancelled = false
    ;(async () => {
      try {
        const jobRes = await jobApi.getByDocument(match.jobDocId)
        if (cancelled) return
        const job = jobRes.data
        if (job.status === 'published') {
          setApplyJob(job)
          try {
            const listRes = await applicationApi.myList({ size: 100 })
            if (!cancelled) setApplied(listRes.data.items.some((a) => a.jobId === job.id))
          } catch { /* 查询投递记录失败不影响展示 */ }
          try {
            const docRes = await documentApi.list()
            if (!cancelled) setMyResumes(docRes.data.filter((d) => d.docType === 'resume' && d.status === 'parsed'))
          } catch { /* ignore */ }
        } else {
          setApplyJob(null)
        }
      } catch {
        if (!cancelled) setApplyJob(null)
      }
    })()
    return () => { cancelled = true }
  }, [isIndividual, match?.jobDocId])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">加载匹配结果...</p>
      </div>
    )
  }
  if (error || !match) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">{error || '数据异常'}</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>返回工作台</Button>
      </div>
    )
  }

  // JD 结构化内容:企业端可直接读文档;求职者端无权读企业文档,
  // 回退到匹配结果接口返回的 jobStructured 摘要(后端已对双方开放)
  const jobStructured =
    ((jobDoc?.parsedJson as { structured?: Record<string, unknown> } | null | undefined)?.structured) || match.jobStructured || {}
  // JD 结构化字段(与后端解析结果一致)
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
  const jobResponsibilities = asStringArray(jobStructured.responsibilities)
  const jobBenefits = asStringArray(jobStructured.benefits)
  const effectiveJobSkills: DocumentSkill[] = jobSkills.length > 0 ? jobSkills : (() => {
    if (!match?.matchDetails) return [] as DocumentSkill[]
    const seen = new Set<number>()
    const result: DocumentSkill[] = []
    for (const d of match.matchDetails) {
      const jid = d.jobSkillId
      if (jid == null || jid <= 0 || seen.has(jid)) continue
      seen.add(jid)
      result.push({
        id: `match-${jid}`, documentId: match.jobDocId, skillId: jid,
        skillName: d.skillName.split(' ↔ ')[1] || d.skillName.split(' ≫ ')[1] || d.skillName,
        proficiency: (d.jobRequirement as DocumentSkill['proficiency']) || 'intermediate',
      })
    }
    return result
  })()

  const handleReparse = async (docId: string) => {
    setReparsing(true)
    try {
      await documentApi.parse(docId)
      setTimeout(async () => {
        try {
          if (match) await matchingApi.calculate(match.resumeDocId, match.jobDocId)
        } catch (e) {
          toast.error((e as Error)?.message || '重新匹配失败，请稍后重试')
        }
        window.location.reload()
      }, 5000)
    } catch (e) {
      setReparsing(false)
      toast.error((e as Error)?.message || '重新解析失败，请稍后重试')
    }
  }

  const breakdown = match.scoreBreakdown
  const trace = match.algorithmTrace || []
  const llm = match.llmAssessment

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-6">
      <PageHeader
        title={match.jobTitle || match.jobFilename || '职位详情'}
        description={`深度匹配 · ${match.matchDetails?.length || 0} 项技能匹配`}
        icon={Brain}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(-1 as never)}>
              <ArrowLeft className="size-3.5" />
              返回
            </Button>
            <div className="text-right">
              <p className={`text-2xl font-bold tabular-nums leading-none ${scoreColor(match.overallScore)}`}>
                {Math.round(match.overallScore)}分
              </p>
              <p className="text-[10px] text-muted-foreground">最终匹配度</p>
            </div>
          </>
        }
      />

      {/* LLM 评估失败降级提示 */}
      {breakdown?.matchStatus === 'fallback' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">LLM 深度评估未完成，当前分数仅由算法计算</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">可能是大模型服务暂不可用，稍后可重新计算获取完整评估。</p>
            </div>
          </div>
        </div>
      )}

      {/* Job info */}
      {effectiveJobSkills.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">岗位技能数据缺失</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">该职位文档的技能数据为空，点击下方按钮重新解析。</p>
              <Button size="sm" variant="outline" disabled={reparsing} onClick={() => handleReparse(match.jobDocId)}
                className="border-amber-300 text-amber-700 hover:bg-amber-100">
                {reparsing ? <><RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />解析中...</> : <><RefreshCw className="mr-1.5 h-3 w-3" />重新解析</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 个人用户:投递入口 */}
      {isIndividual && (
        <div className="flex flex-wrap items-center gap-2">
          {applyJob ? (
            <Button disabled={applied} onClick={() => setShowApply(true)}>
              <Send className="mr-2 h-4 w-4" />
              {applied ? '已投递该职位' : '立即投递该职位'}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">该职位暂未开放投递</p>
          )}
          {applied && (
            <Button variant="outline" onClick={() => navigate('/applications')}>
              查看投递记录
            </Button>
          )}
        </div>
      )}

      {/* 企业与职位信息 */}
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {match.companyName && <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" />{match.companyName}</span>}
            {(Boolean(jobStructured.location) || match.jobCity) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{String(jobStructured.location || match.jobCity)}</span>}
            {Boolean(jobStructured.companyIndustry) && <span>行业：{String(jobStructured.companyIndustry)}</span>}
            {Boolean(jobStructured.companySize) && <span>规模：{String(jobStructured.companySize)}</span>}
            {Boolean(jobStructured.department) && <span>部门：{String(jobStructured.department)}</span>}
            {Boolean(jobStructured.salaryRange) && <span className="font-medium text-foreground">{String(jobStructured.salaryRange)}</span>}
            {Boolean(jobStructured.experienceRequired) && <span>经验：{String(jobStructured.experienceRequired)}</span>}
            {Boolean(jobStructured.educationRequired) && <span>学历：{String(jobStructured.educationRequired)}</span>}
            {(jobDoc?.createdAt || match.createdAt) && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(jobDoc?.createdAt || match.createdAt).toLocaleDateString('zh-CN')}</span>}
          </div>
        {(match.jobTopSkills?.length || Boolean(jobStructured.summary) || jobResponsibilities.length > 0 || jobBenefits.length > 0) && (
          <div className="space-y-4">
            {match.jobTopSkills && match.jobTopSkills.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">技能要求</p>
                <div className="flex flex-wrap gap-1.5">{match.jobTopSkills.map((s, i) => <Badge key={i} variant="secondary" className="text-[11px]">{s}</Badge>)}</div>
              </div>
            )}
            {Boolean(jobStructured.summary) && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{String(jobStructured.summary)}</p>
            )}
            {jobResponsibilities.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4 text-primary" />岗位职责
                </p>
                <ol className="space-y-1.5">
                  {jobResponsibilities.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">{i + 1}</span>
                      <span className="leading-relaxed">{String(r)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {jobBenefits.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium flex items-center gap-1.5">
                  <Gift className="h-4 w-4 text-primary" />福利待遇
                </p>
                <div className="flex flex-wrap gap-1.5">{jobBenefits.map((b, i) => <Badge key={i} variant="outline" className="text-[11px]">{String(b)}</Badge>)}</div>
              </div>
            )}
          </div>
        )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Algorithm Pipeline Visualization                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {trace.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              算法执行流水线
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              工作流: 数据加载 → 技能匹配 → LLM 深度评估
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Pipeline timeline */}
              <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {trace.map((step, i) => (
                  <div key={i} className="relative flex gap-4 pl-1">
                    <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                      <PhaseIcon phase={step.phase} />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{step.label}</span>
                        <StepIcon status={step.status} />
                        {step.durationMs > 0 && (
                          <span className="text-[10px] text-muted-foreground">({step.durationMs}ms)</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.summary}</p>
                      {(() => {
                        if (!step.data || step.phase !== 'score_fusion' || !step.data.fusionWeights) return null
                        const fw = step.data.fusionWeights as { algorithm: number; llm: number }
                        return (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              算法权重 {(fw.algorithm * 100).toFixed(0)}%
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              LLM权重 {(fw.llm * 100).toFixed(0)}%
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Score Breakdown                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      {breakdown && (() => {
        const hasLlm = breakdown.llmScore > 0
        const dims = breakdown.algorithmDimensions
        const dimItems = dims ? [
          { label: '覆盖率', value: dims.coverage },
          { label: '达标率', value: dims.adequacy },
        ] : []

        return (
          <Card>
            <CardHeader>
              <CardTitle>匹配分构成</CardTitle>
              <CardAction>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-bold tabular-nums leading-none ${scoreColor(breakdown.overallScore)}`}>
                    {Math.round(breakdown.overallScore)}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 子分数 */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  算法
                  <span className={`ml-1.5 font-semibold tabular-nums ${scoreColor(breakdown.algorithmScore)}`}>
                    {Math.round(breakdown.algorithmScore)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  LLM
                  {hasLlm ? (
                    <span className={`ml-1.5 font-semibold tabular-nums ${scoreColor(breakdown.llmScore)}`}>
                      {Math.round(breakdown.llmScore)}
                    </span>
                  ) : (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">未参与</Badge>
                  )}
                </span>
              </div>

              {/* 算法四维度 */}
              {dimItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {dimItems.map((d) => (
                    <span key={d.label}>
                      {d.label}
                      <span className="ml-1 font-medium tabular-nums text-foreground">{Math.round(d.value * 100)}%</span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* LLM Assessment: Strengths, Gaps, Transferable Skills     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {llm && (
        <Card className="border-purple-200 dark:border-purple-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-500" />
              LLM 深度评估报告
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Overall reasoning */}
            {llm.reasoning && (
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm leading-relaxed">{llm.reasoning}</p>
                {llm.readinessMonths > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    预计上手周期: <span className="font-medium text-foreground">{llm.readinessMonths} 个月</span>
                  </p>
                )}
              </div>
            )}

            {/* Strengths */}
            {llm.strengths.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  匹配优势 ({llm.strengths.length})
                </p>
                <div className="space-y-1.5">
                  {llm.strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gaps */}
            {llm.gaps.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  差距与不足 ({llm.gaps.length})
                </p>
                <div className="space-y-1.5">
                  {llm.gaps.map((g, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                      <span>{g}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transferable Skills */}
            {llm.transferableSkills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
                  可迁移技能 ({llm.transferableSkills.length})
                </p>
                <div className="space-y-2">
                  {llm.transferableSkills.map((t, i) => (
                    <div key={i} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{t.candidateSkill}</span>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{t.jobRequirement}</span>
                        <TransferBadge level={t.transferability} />
                      </div>
                      <p className="text-xs text-muted-foreground">{t.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Skill Match Details                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      {match.matchDetails && match.matchDetails.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">技能匹配详情 ({match.matchDetails.length} 项)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {match.matchDetails.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{d.skillName}</span>
                    {d.importance && (
                      <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${
                        d.importance === 'required' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        d.importance === 'preferred' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {d.importance === 'required' ? '必须' : d.importance === 'preferred' ? '加分' : '可选'}
                      </span>
                    )}
                    <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${
                      d.matchMethod === 'embedding'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {d.matchMethod === 'embedding' ? '语义匹配' : '精确匹配'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-3">
                    <span>{proficiencyLabel[d.personProficiency] || d.personProficiency}</span>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    <span>{proficiencyLabel[d.jobRequirement] || d.jobRequirement}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Skill Graph                                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      {(skills.length > 0 || effectiveJobSkills.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">能力图谱</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillForceGraph
              skills={skills}
              jobSkills={effectiveJobSkills}
              matchedSkillIds={match.matchDetails?.filter((d) => d.skillId > 0).map((d) => d.skillId)}
              matchedPairs={match.matchDetails?.map((d) => ({ resumeSkillId: d.resumeSkillId, jobSkillId: d.jobSkillId }))}
            />
          </CardContent>
        </Card>
      )}
        </div>

        {/* 右侧:智能问答助手(基于当前匹配上下文,滚动时保持可见) */}
        <aside className="w-full lg:w-96 shrink-0 lg:sticky lg:top-4 h-[600px]">
          <MatchChatPanel matchId={id || ''} />
        </aside>
      </div>

      {/* 投递弹窗(个人用户) */}
      <ApplyDialog
        open={showApply}
        jobId={applyJob?.id || ''}
        resumes={myResumes}
        defaultResumeId={match.resumeDocId}
        onClose={() => setShowApply(false)}
        onApplied={() => { setShowApply(false); setApplied(true) }}
      />
    </div>
  )
}
