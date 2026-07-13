import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { dashboardApi, documentApi } from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { scoreColor, DOC_TYPE_LABEL, STATUS_LABEL } from '@/lib/utils'
import { FileText, Briefcase, Upload, ChevronRight, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import type { Document, DocumentSkill, MatchResult } from '@/types'

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
    } catch { /* ignore */ }
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

  // ═══════════════════════════════════════════
  // Individual: 我的简历
  // ═══════════════════════════════════════════
  if (isIndividual) {
    const myResumes = documents.filter((d) => d.docType === 'resume')

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">我的简历</h1>
            <p className="text-sm text-muted-foreground">
              {myResumes.length > 0
                ? `共 ${myResumes.length} 份简历，点击查看匹配职位`
                : '上传简历，开始匹配适合您的职位'}
            </p>
          </div>
          <Button onClick={() => navigate('/upload/resume')}>
            <Upload className="mr-2 h-4 w-4" />
            上传简历
          </Button>
        </div>

        {myResumes.length === 0 ? (
          <div className="py-20 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-lg font-medium">还没有上传简历</p>
            <p className="text-sm text-muted-foreground">上传简历后，系统将自动匹配职位</p>
            <Button className="mt-4" onClick={() => navigate('/upload/resume')}>立即上传</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {myResumes.map((resume) => {
              const resumeMatches = matches.filter((m) => m.resumeDocId === resume.id)
              const parsed = (resume.parsedJson as any)?.structured || {}
              const resumeSkills = skillsMap[resume.id] || []
              const topMatch = resumeMatches[0]
              const isPending = resume.status === 'uploaded' || resume.status === 'parsing'
              return (
                <Card
                  key={resume.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => navigate(isPending ? `/pipeline/${resume.id}` : `/resume/${resume.id}`)}
                >
                  <CardContent className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft">
                        {isPending ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          <FileText className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {parsed.name || resume.originalFilename}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {isPending
                            ? '正在解析中...'
                            : [parsed.title, parsed.city].filter(Boolean).join(' · ') || resume.originalFilename}
                        </p>
                        {!isPending && resumeSkills.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {resumeSkills.slice(0, 5).map((s, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">{s.skillName || `技能#${s.skillId}`}</Badge>
                            ))}
                            {resumeSkills.length > 5 && (
                              <span className="text-[10px] text-muted-foreground">+{resumeSkills.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {isPending ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${resume.id}`) }}
                        >
                          查看解析进度
                        </Button>
                      ) : resumeMatches.length > 0 ? (
                        <>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">匹配职位</p>
                            <p className="text-lg font-bold text-primary">{resumeMatches.length}</p>
                          </div>
                          {topMatch && (
                            <div className="hidden sm:block text-right">
                              <p className="text-xs text-muted-foreground">最佳</p>
                              <p className="text-sm font-medium truncate max-w-32">{topMatch.jobTitle || topMatch.jobFilename}</p>
                              <p className={`text-xs font-semibold ${scoreColor(topMatch.overallScore)}`}>
                                {Math.round(topMatch.overallScore)} 分
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">暂无匹配</p>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                      {!isPending && (
                        <button
                          className="rounded p-1.5 text-muted-foreground/40 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                          onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${resume.id}`) }}
                          title="查看处理过程"
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        className="rounded p-1.5 text-gray-400 hover:bg-[#fef2f2] hover:text-red-500 transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDelete(resume.id, parsed.name || resume.originalFilename) }}
                        title="删除简历"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // Enterprise: 我的职位
  // ═══════════════════════════════════════════
  const myJobs = documents.filter((d) => d.docType === 'job_description')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的职位</h1>
          <p className="text-sm text-muted-foreground">
            {myJobs.length > 0 ? `已发布 ${myJobs.length} 个职位` : '还没有发布职位'}
          </p>
        </div>
        <Button onClick={() => navigate('/upload/job')}>
          <Upload className="mr-2 h-4 w-4" />
          发布新职位
        </Button>
      </div>

      {myJobs.length === 0 ? (
        <div className="py-20 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">还没有发布职位</p>
          <p className="text-sm text-muted-foreground">发布职位描述后，系统将自动匹配候选人</p>
          <Button className="mt-4" onClick={() => navigate('/upload/job')}>发布第一个职位</Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {myJobs.map((job) => {
            const jobMatches = matches.filter((m) => m.jobDocId === job.id)
            const topCandidate = jobMatches[0]
            const isPending = job.status === 'uploaded' || job.status === 'parsing'
            return (
              <Card
                key={job.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(isPending ? `/pipeline/${job.id}` : `/job/${job.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">
                        {(job.parsedJson as any)?.structured?.title || job.originalFilename}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {DOC_TYPE_LABEL[job.docType]} · {new Date(job.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">
                        {isPending ? '解析中...' : STATUS_LABEL[job.status]}
                      </Badge>
                      {!isPending && (
                        <button
                          className="rounded p-1 text-muted-foreground/40 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                          onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${job.id}`) }}
                          title="查看处理过程"
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-[#fef2f2] hover:text-red-500 transition-colors"
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
                        <span className="text-sm font-medium">
                          {topCandidate.candidateName || '未知'} 最佳匹配
                        </span>
                        <span className={`text-sm font-bold ${scoreColor(topCandidate.overallScore)}`}>
                          {Math.round(topCandidate.overallScore)} 分
                        </span>
                      </div>
                      {topCandidate.matchDetails?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {topCandidate.matchDetails.slice(0, 3).map((d, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{d.skillName}</Badge>
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
    </div>
  )
}
