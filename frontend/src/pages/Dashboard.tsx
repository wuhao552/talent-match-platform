import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { dashboardApi, documentApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/dashboard/StatCard'
import { ScoreRing } from '@/components/dashboard/ScoreRing'
import { scoreColor, DOC_TYPE_LABEL, STATUS_LABEL } from '@/lib/utils'
import {
  FileText, Briefcase, Upload, ChevronRight, Trash2, Zap,
  Target, TrendingUp, Sparkles, Brain,
  AlertTriangle, ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Document, DocumentSkill, MatchResult } from '@/types'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

const todayLabel = new Date().toLocaleDateString('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 所有数据来自同一个请求，天然一致
  const [documents, setDocuments] = useState<Document[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [skillsMap, setSkillsMap] = useState<Record<string, DocumentSkill[]>>({})
  const [loading, setLoading] = useState(true)

  const isIndividual = user?.role === 'individual'

  // 加载聚合数据
  const fetchDashboard = useCallback(async () => {
    try {
      const r = await dashboardApi.get()
      setDocuments(r.data.documents)
      setSkillsMap(r.data.skillsMap)
      setMatches(r.data.matches)
    } catch (e) {
      toast.error((e as Error)?.message || '加载工作台数据失败')
    }
    setLoading(false)
  }, [])

  // 初始加载
  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // 有 pending 文档时轮询，全部完成后停止并刷新一次
  const prevPendingRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const hasPending = documents.some((d) => d.status === 'uploaded' || d.status === 'parsing')

    if (hasPending && !pollRef.current) {
      // 开始轮询
      pollRef.current = setInterval(fetchDashboard, 3000)
    } else if (!hasPending && pollRef.current) {
      // 停止轮询
      clearInterval(pollRef.current)
      pollRef.current = null
      // 如果之前有 pending，刷新一次确保拿到最新匹配结果
      if (prevPendingRef.current) {
        fetchDashboard()
      }
    }

    prevPendingRef.current = hasPending
  }, [documents, fetchDashboard])

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [])

  const handleDelete = async (id: string, filename: string) => {
    if (!window.confirm(`确定要删除「${filename}」吗？此操作不可撤销。`)) return
    try {
      await documentApi.delete(id)
      toast.success('删除成功')
      fetchDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // ── 派生数据 ──
  const myDocs = documents.filter((d) => d.docType === (isIndividual ? 'resume' : 'job_description'))
  const parsedCount = myDocs.filter((d) => d.status === 'parsed').length
  const pendingCount = myDocs.filter((d) => d.status === 'uploaded' || d.status === 'parsing').length
  const totalMatches = matches.length
  const topScore = matches.reduce((m, x) => Math.max(m, x.overallScore), 0)

  // 我的技能(去重)
  const mySkillMap = new Map<number, string>()
  myDocs
    .filter((d) => d.status === 'parsed')
    .forEach((d) => (skillsMap[d.id] || []).forEach((s) => mySkillMap.set(s.skillId, s.skillName || s.skill?.name || '')))
  const mySkills = [...mySkillMap.values()].filter(Boolean)

  // 技能列表(按 document 顺序去重) + 按分类分组
  const mySkillList: DocumentSkill[] = []
  const seenSkillIds = new Set<number>()
  myDocs
    .filter((d) => d.status === 'parsed')
    .forEach((d) => (skillsMap[d.id] || []).forEach((s) => {
      if (!seenSkillIds.has(s.skillId)) {
        seenSkillIds.add(s.skillId)
        mySkillList.push(s)
      }
    }))
  const skillGroups = new Map<string, string[]>()
  for (const s of mySkillList) {
    const cat = s.category || s.skill?.category || '其他'
    const names = skillGroups.get(cat) ?? []
    names.push(s.skillName || `技能#${s.skillId}`)
    skillGroups.set(cat, names)
  }
  const skillGroupList = [...skillGroups.entries()].sort((a, b) => b[1].length - a[1].length)

  const stats = [
    {
      label: isIndividual ? '我的简历' : '我的职位',
      value: myDocs.length,
      icon: isIndividual ? FileText : Briefcase,
      sub: parsedCount > 0 || pendingCount > 0 ? `${parsedCount} 已解析${pendingCount > 0 ? ` · ${pendingCount} 处理中` : ''}` : '暂无',
    },
    {
      label: '匹配机会',
      value: totalMatches,
      icon: Target,
      sub: totalMatches > 0 ? `${isIndividual ? '个职位' : '位候选人'}与你匹配` : '等待匹配',
    },
    {
      label: '最佳匹配',
      value: topScore > 0 ? Math.round(topScore) : '--',
      icon: TrendingUp,
      valueClassName: topScore > 0 ? scoreColor(topScore) : undefined,
      sub: topScore > 0 ? '分' : '暂无结果',
    },
    {
      label: '技能标签',
      value: mySkills.length,
      icon: Sparkles,
      sub: '已提取',
    },
  ]

  const topMatches = matches.slice(0, 4)

  // ── 全空状态:引导新用户 ──
  if (myDocs.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{greeting()}，{user?.username} 👋</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isIndividual
                ? '欢迎使用 AI 智能匹配平台，上传简历即可获得精准的职位推荐'
                : '欢迎使用 AI 智能匹配平台，发布职位即可快速找到匹配的候选人'}
            </p>
          </div>
          <Button onClick={() => navigate(isIndividual ? '/upload/resume' : '/upload/job')}>
            {isIndividual ? <><Upload className="mr-2 h-4 w-4" />上传我的简历</> : <><Upload className="mr-2 h-4 w-4" />发布第一个职位</>}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Sparkles, title: 'AI 技能提取', desc: '自动从文档中提取技能标签，构建个人能力图谱' },
            { icon: Target, title: '智能匹配', desc: '算法 + 大模型双重评估，给出可解释的匹配分数' },
            { icon: Brain, title: 'AI 深度解读', desc: '匹配差距、可迁移技能与面试题一键生成' },
          ].map((f, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ── 主工作台 ──
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* 页头 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {greeting()}，{user?.username} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {todayLabel} · {isIndividual ? '看看今天有哪些适合你的机会' : '看看你的职位吸引了哪些候选人'}
          </p>
        </div>
        <div className="flex gap-2">
          {isIndividual && (
            <Button variant="outline" onClick={() => navigate('/jobs')}>
              <Briefcase className="mr-2 h-4 w-4" />岗位广场
            </Button>
          )}
          <Button onClick={() => navigate(isIndividual ? '/upload/resume' : '/upload/job')}>
            <Upload className="mr-2 h-4 w-4" />
            {isIndividual ? '上传简历' : '发布职位'}
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} icon={s.icon} valueClassName={s.valueClassName} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* 左栏:匹配推荐 + 文档管理 */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* 匹配推荐 */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div className="space-y-0.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" />
                  匹配推荐
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {totalMatches > 0 ? `共 ${totalMatches} 个匹配结果，按匹配度排序` : '完成解析后自动生成匹配推荐'}
                </p>
              </div>
              {totalMatches > 0 && (
                <button
                  onClick={() => navigate(isIndividual ? '/jobs' : '/applications')}
                  className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                >
                  查看全部 <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </CardHeader>
            <CardContent>
              {topMatches.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {isIndividual
                    ? '暂无匹配结果，上传并解析简历后，系统会自动推荐职位'
                    : '暂无匹配结果，发布并解析职位后，系统会自动推荐候选人'}
                </div>
              ) : (
                <div className="space-y-2">
                  {topMatches.map((m) => {
                    const isFallback = m.scoreBreakdown?.matchStatus === 'fallback'
                    return (
                      <div
                        key={m.id}
                        className="group flex cursor-pointer items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                        onClick={() => navigate(`/matching/${m.id}`)}
                      >
                        {/* 环形评分 */}
                        <ScoreRing score={m.overallScore} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {isIndividual ? m.jobTitle || m.jobFilename : m.candidateName || '未知候选人'}
                            </span>
                            {isFallback && (
                              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                                <AlertTriangle className="mr-0.5 h-2.5 w-2.5 text-amber-500" />
                                仅算法分
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {isIndividual
                              ? [m.companyName, m.jobCity].filter(Boolean).join(' · ') || m.jobFilename
                              : [m.resumeFilename, m.candidateCity].filter(Boolean).join(' · ')}
                          </p>
                          {m.matchDetails?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {m.matchDetails.slice(0, 4).map((d, i) => (
                                <span key={i} className="max-w-28 truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {d.skillName.split(' ↔ ')[0]}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 我的文档 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {isIndividual ? <FileText className="h-4 w-4 text-primary" /> : <Briefcase className="h-4 w-4 text-primary" />}
                {isIndividual ? '我的简历' : '我的职位'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isIndividual ? (
                <div className="space-y-2">
                  {myDocs.map((resume) => {
                    const resumeMatches = matches.filter((m) => m.resumeDocId === resume.id)
                    const parsed = (resume.parsedJson as any)?.structured || {}
                    const resumeSkills = skillsMap[resume.id] || []
                    const topMatch = resumeMatches[0]
                    const isPending = resume.status === 'uploaded' || resume.status === 'parsing'
                    return (
                      <div
                        key={resume.id}
                        className="group flex cursor-pointer items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                        onClick={() => navigate(isPending ? `/pipeline/${resume.id}` : `/resume/${resume.id}`)}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {isPending ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-medium">{parsed.name || resume.originalFilename}</h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {isPending
                              ? '正在解析中...'
                              : [parsed.title, parsed.city].filter(Boolean).join(' · ') || resume.originalFilename}
                          </p>
                          {!isPending && resumeSkills.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {resumeSkills.slice(0, 4).map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">{s.skillName || `技能#${s.skillId}`}</Badge>
                              ))}
                              {resumeSkills.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">+{resumeSkills.length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isPending ? (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${resume.id}`) }}>
                              解析进度
                            </Button>
                          ) : resumeMatches.length > 0 ? (
                            <div className="hidden text-right sm:block">
                              <p className="text-xs text-muted-foreground">匹配 {resumeMatches.length} 个职位</p>
                              {topMatch && (
                                <p className={`text-sm font-bold ${scoreColor(topMatch.overallScore)}`}>
                                  最佳 {Math.round(topMatch.overallScore)} 分
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="hidden text-xs text-muted-foreground sm:block">暂无匹配</p>
                          )}
                          {!isPending && (
                            <button
                              className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-primary-soft hover:text-primary"
                              onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${resume.id}`) }}
                              title="查看处理过程"
                            >
                              <Zap className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-destructive-soft hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(resume.id, parsed.name || resume.originalFilename) }}
                            title="删除简历"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {myDocs.map((job) => {
                    const jobMatches = matches.filter((m) => m.jobDocId === job.id)
                    const topCandidate = jobMatches[0]
                    const isPending = job.status === 'uploaded' || job.status === 'parsing'
                    return (
                      <Card
                        key={job.id}
                        className="cursor-pointer transition-shadow hover:shadow-md"
                        onClick={() => navigate(isPending ? `/pipeline/${job.id}` : `/job/${job.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate font-semibold">
                                {(job.parsedJson as any)?.structured?.title || job.originalFilename}
                              </h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {DOC_TYPE_LABEL[job.docType]} · {new Date(job.createdAt).toLocaleDateString('zh-CN')}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">
                                {isPending ? '解析中...' : STATUS_LABEL[job.status]}
                              </Badge>
                              {!isPending && (
                                <button
                                  className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-primary-soft hover:text-primary"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${job.id}`) }}
                                  title="查看处理过程"
                                >
                                  <Zap className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                className="rounded p-1 text-gray-400 transition-colors hover:bg-destructive-soft hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleDelete(job.id, (job.parsedJson as any)?.structured?.title || job.originalFilename) }}
                                title="删除职位"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isPending ? (
                            <div className="mt-3 rounded-lg bg-muted/30 p-3 text-center">
                              <div className="mx-auto mb-1.5 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                              <p className="text-xs text-muted-foreground">正在解析中，完成后自动匹配...</p>
                            </div>
                          ) : jobMatches.length > 0 && topCandidate ? (
                            <div className="mt-3 rounded-lg bg-muted/50 p-3">
                              <p className="text-xs text-muted-foreground">
                                匹配 <strong>{jobMatches.length}</strong> 位候选人
                              </p>
                              <div className="mt-1.5 flex items-center justify-between">
                                <span className="truncate text-sm font-medium">
                                  {topCandidate.candidateName || '未知'} 最佳匹配
                                </span>
                                <span className={`text-sm font-bold ${scoreColor(topCandidate.overallScore)}`}>
                                  {Math.round(topCandidate.overallScore)} 分
                                </span>
                              </div>
                              {topCandidate.matchDetails?.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {topCandidate.matchDetails.slice(0, 3).map((d, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px]">{d.skillName.split(' ↔ ')[0]}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : job.status === 'parsed' ? (
                            <div className="mt-3 rounded-lg bg-muted/30 p-3 text-center">
                              <p className="text-xs text-muted-foreground">暂无匹配候选人</p>
                            </div>
                          ) : null}

                          <div className="mt-3">
                            {isPending ? (
                              <Button size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${job.id}`) }}>
                                查看解析进度
                              </Button>
                            ) : jobMatches.length > 0 ? (
                              <Button size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`) }}>
                                查看 {jobMatches.length} 位候选人
                                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${job.id}`) }}>
                                查看解析详情
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右栏:技能标签(按分类分组) */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                技能标签
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mySkillList.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  解析文档后自动提取技能标签
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">共 {mySkills.length} 项技能</p>
                  <div className="mt-3 space-y-4">
                    {skillGroupList.map(([cat, names]) => (
                      <div key={cat}>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{cat} · {names.length}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {names.map((n, i) => (
                            <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
