import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { matchingApi, documentApi, graphApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { scoreColor, proficiencyLabel } from '@/lib/utils'
import { SkillForceGraph } from '@/components/graph/SkillForceGraph'
import {
  ChevronLeft, MapPin, Building, Clock, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, Loader2, Brain, GitBranch, Zap, Target,
  TrendingUp, ArrowRightLeft, Network,
} from 'lucide-react'
import type { MatchResult, Document, DocumentSkill, AlgorithmStep, LlmAssessment } from '@/types'

// ── Score bar component ──
function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color || 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums font-medium">
        +{value.toFixed(1)}
      </span>
    </div>
  )
}

// ── Pipeline step icon ──
function StepIcon({ status }: { status: AlgorithmStep['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-500" />
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
}

// ── Phase icon ──
function PhaseIcon({ phase }: { phase: string }) {
  const icons: Record<string, React.ReactNode> = {
    skill_matching: <Target className="h-4 w-4" />,
    llm_assessment: <Brain className="h-4 w-4" />,
    score_fusion: <Zap className="h-4 w-4" />,
    community_context: <Network className="h-4 w-4" />,
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
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [jobDoc, setJobDoc] = useState<Document | null>(null)
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [jobSkills, setJobSkills] = useState<DocumentSkill[]>([])
  const [coocEdges, setCoocEdges] = useState<Array<{ sourceId: number; targetId: number; freqSkill: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reparsing, setReparsing] = useState(false)

  useEffect(() => {
    if (!id) return
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
        setSkills(sk)
        setJobSkills(jsk)
        const jskIds = jsk.map((s: DocumentSkill) => s.skillId)
        if (jskIds.length === 0 && res.data.matchDetails) {
          for (const d of res.data.matchDetails) {
            if (d.jobSkillId && d.jobSkillId > 0) jskIds.push(d.jobSkillId)
          }
        }
        const allIds = [...new Set([...sk.map((s: DocumentSkill) => s.skillId), ...jskIds])]
        if (allIds.length >= 2) {
          graphApi.getCooccurrenceBatch(allIds).then((r) => setCoocEdges(r.data)).catch(() => {})
        }
      })
      .catch(() => setError('未找到该匹配结果'))
      .finally(() => setLoading(false))
  }, [id])

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

  const jobStructured = (jobDoc?.parsedJson as any)?.structured || {}
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
        try { if (match) await matchingApi.calculate(match.resumeDocId, match.jobDocId) } catch {}
        window.location.reload()
      }, 5000)
    } catch { setReparsing(false) }
  }

  const breakdown = match.scoreBreakdown
  const trace = match.algorithmTrace || []
  const llm = match.llmAssessment
  const community = match.communityContext

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{match.jobTitle || match.jobFilename || '职位详情'}</h1>
          <p className="text-sm text-muted-foreground">
            GraphRAG 深度匹配 · {match.matchDetails?.length || 0} 项技能匹配
          </p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold tabular-nums ${scoreColor(match.overallScore)}`}>
            {Math.round(match.overallScore)}%
          </p>
          <p className="text-[10px] text-muted-foreground">最终匹配度</p>
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl leading-tight">{match.jobTitle || match.jobFilename}</CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {match.companyName && <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" />{match.companyName}</span>}
                {match.jobCity && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{match.jobCity}</span>}
                {jobDoc?.createdAt && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(jobDoc.createdAt).toLocaleDateString('zh-CN')}</span>}
                {jobStructured.salary && <span className="font-medium text-foreground">{String(jobStructured.salary)}</span>}
                {jobStructured.education && <span>{String(jobStructured.education)}</span>}
              </div>
            </div>
          </div>
        </CardHeader>
        {(match.jobTopSkills?.length || jobStructured.summary) && (
          <CardContent className="space-y-4">
            {match.jobTopSkills && match.jobTopSkills.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">技能要求</p>
                <div className="flex flex-wrap gap-1.5">{match.jobTopSkills.map((s, i) => <Badge key={i} variant="secondary" className="text-[11px]">{s}</Badge>)}</div>
              </div>
            )}
            {jobStructured.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{String(jobStructured.summary)}</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* GraphRAG Algorithm Pipeline Visualization               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {trace.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              算法执行流水线
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              GraphRAG 三阶段匹配: 技能匹配 → LLM 深度评估 → 置信度融合
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
                      {step.data && step.phase === 'score_fusion' && step.data.fusionWeights && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            算法权重 {((step.data.fusionWeights as any).algorithm * 100).toFixed(0)}%
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            LLM权重 {((step.data.fusionWeights as any).llm * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Score Breakdown: Algorithm + LLM + Fusion               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {breakdown && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">匹配分构成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Phase 1: Algorithm */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Phase 1: 算法评分</span>
                <span className="text-xs text-muted-foreground">→ {breakdown.algorithmScore?.toFixed(1) || '—'}</span>
              </div>
              <div className="space-y-2 pl-6">
                <ScoreBar label="技能匹配" value={breakdown.skillMatchScore * 0.75} max={75} color="bg-blue-500" />
                <ScoreBar label="知识图谱" value={breakdown.cooccurrenceBonus} max={10} color="bg-blue-400" />
                <ScoreBar label="同城加分" value={breakdown.cityMatchBonus} max={8} color="bg-blue-300" />
                <ScoreBar label="热度加分" value={breakdown.hotnessBonus} max={8} color="bg-blue-300" />
                <ScoreBar label="经验加分" value={breakdown.experienceBonus} max={5} color="bg-blue-300" />
                <ScoreBar label="行业匹配" value={breakdown.industryMatchBonus} max={4} color="bg-blue-300" />
                <ScoreBar label="趋势加分" value={breakdown.trendBonus} max={3} color="bg-blue-300" />
              </div>
            </div>

            {/* Phase 2: LLM */}
            {breakdown.llmScore != null && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-400">Phase 2: LLM 深度评估</span>
                  <span className="text-xs text-muted-foreground">→ {breakdown.llmScore.toFixed(1)}</span>
                  {llm?.confidence != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      置信度 {(llm.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Phase 3: Fusion */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">最终融合分数</span>
                {breakdown.fusionWeights && (
                  <span className="text-[10px] text-muted-foreground">
                    (算法 {breakdown.fusionWeights.algorithm.toFixed(0)}% + LLM {breakdown.fusionWeights.llm.toFixed(0)}%)
                  </span>
                )}
              </div>
              <span className={`text-2xl font-bold tabular-nums ${scoreColor(breakdown.overallScore)}`}>
                {Math.round(breakdown.overallScore)}%
              </span>
            </div>
          </CardContent>
        </Card>
      )}

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
      {/* Community Context                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {community && (community.resumeCommunities.length > 0 || community.jobCommunities.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4 text-emerald-500" />
              技能社区上下文
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              基于知识图谱社区检测，识别候选人和职位各自的技能聚类
            </p>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {community.resumeCommunities.length > 0 && (
                <AccordionItem value="resume-comm">
                  <AccordionTrigger className="text-sm">候选人技能社区 ({community.resumeCommunities.length})</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {community.resumeCommunities.map((c, i) => (
                        <div key={i} className="rounded-lg bg-muted/50 p-3">
                          <p className="text-sm font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{c.summary}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              {community.jobCommunities.length > 0 && (
                <AccordionItem value="job-comm">
                  <AccordionTrigger className="text-sm">职位技能社区 ({community.jobCommunities.length})</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {community.jobCommunities.map((c, i) => (
                        <div key={i} className="rounded-lg bg-muted/50 p-3">
                          <p className="text-sm font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{c.summary}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
            {community.domainOverlap.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">领域重叠:</span>
                {community.domainOverlap.map((d, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>
                ))}
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
                    {d.hotnessBoost != null && d.hotnessBoost > 0 && (
                      <span className="ml-1 text-[10px] text-orange-500">+{d.hotnessBoost}热度</span>
                    )}
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
              coocEdges={coocEdges}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
