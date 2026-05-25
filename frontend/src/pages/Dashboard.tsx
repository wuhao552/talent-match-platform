import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { documentApi, matchingApi } from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { scoreColor, DOC_TYPE_LABEL, STATUS_LABEL } from '@/lib/utils'
import { FileText, Briefcase, Upload, ChevronRight } from 'lucide-react'
import type { Document, MatchResult } from '@/types'

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)

  const isIndividual = user?.role === 'individual'
  const parsedDocs = documents.filter((d) => d.status === 'parsed')

  useEffect(() => {
    Promise.all([
      documentApi.list().then((r) => setDocuments(r.data)),
      matchingApi.recommend().then((r) => setMatches(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

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
    const myResumes = parsedDocs.filter((d) => d.docType === 'resume')

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
              const topMatch = resumeMatches[0]
              return (
                <Card
                  key={resume.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => navigate(`/resume/${resume.id}`)}
                >
                  <CardContent className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {parsed.name || resume.originalFilename}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {[parsed.title, parsed.city].filter(Boolean).join(' · ') || resume.originalFilename}
                        </p>
                        {Array.isArray(parsed.skills) && (parsed.skills as string[]).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(parsed.skills as string[]).slice(0, 5).map((s, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                            ))}
                            {(parsed.skills as string[]).length > 5 && (
                              <span className="text-[10px] text-muted-foreground">+{(parsed.skills as string[]).length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {resumeMatches.length > 0 ? (
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
  const myJobs = parsedDocs.filter((d) => d.docType === 'job_description')

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
            return (
              <Card
                key={job.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/job/${job.id}`)}
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
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {STATUS_LABEL[job.status]}
                    </Badge>
                  </div>

                  {jobMatches.length > 0 && topCandidate ? (
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
                  ) : (
                    <div className="mt-3 rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">解析中，完成后自动匹配...</p>
                    </div>
                  )}

                  <div className="mt-3">
                    {jobMatches.length > 0 ? (
                      <Button size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`) }}>
                        查看 {jobMatches.length} 位候选人
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/graph/${job.id}`) }}>
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
