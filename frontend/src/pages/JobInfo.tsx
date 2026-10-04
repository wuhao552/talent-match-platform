import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { jobApi, documentApi, messageApi } from '@/services/api'
import type { Job, Document } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApplyDialog } from '@/components/application/ApplyDialog'
import { toast } from 'sonner'
import { ArrowLeft, Briefcase, Building2, Clock, MapPin, MessageSquare, Send, Users } from 'lucide-react'

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: '全职', part_time: '兼职', internship: '实习', contract: '合同制',
}

export function JobInfo() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [showApply, setShowApply] = useState(false)
  const [resumes, setResumes] = useState<Document[]>([])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const res = await jobApi.get(id)
        setJob(res.data)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '岗位不存在')
        navigate('/jobs')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, navigate])

  const loadResumes = async () => {
    try {
      const res = await documentApi.list()
      setResumes(res.data.filter((d) => d.docType === 'resume' && d.status === 'parsed'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载简历失败')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (!job) return null

  const isOwner = job.enterpriseId === user?.id
  const canApply = user?.role === 'individual' && job.status === 'published' && !isOwner

  const salary =
    job.salaryMin == null && job.salaryMax == null
      ? '薪资面议'
      : `${job.salaryMin ?? '?'}-${job.salaryMax ?? '?'} ${job.salaryUnit === 'year' ? '元/年' : '元/月'}`

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={job.title}
        description={[job.companyName, job.department].filter(Boolean).join(' · ') || '岗位详情'}
        icon={Briefcase}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/jobs')}>
              <ArrowLeft className="size-3.5" />
              返回
            </Button>
            {canApply && (
              <Button onClick={() => { setShowApply(true); loadResumes() }}>
                <Send className="size-3.5" />
                立即投递
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {job.companyName && <span className="flex items-center gap-1"><Building2 className="size-3.5" />{job.companyName}</span>}
            {job.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>}
            <span className="font-semibold text-foreground">{salary}</span>
            <span className="flex items-center gap-1"><Clock className="size-3.5" />发布于 {new Date(job.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={job.status === 'published' ? 'default' : 'outline'}>
              {job.status === 'published' ? '招聘中' : job.status === 'closed' ? '已关闭' : job.status === 'draft' ? '草稿' : '已归档'}
            </Badge>
            <Badge variant="secondary">{EMPLOYMENT_LABEL[job.employmentType] || job.employmentType}</Badge>
            {job.experienceRequired && <Badge variant="secondary">{job.experienceRequired}</Badge>}
            {job.educationRequired && <Badge variant="secondary">{job.educationRequired}</Badge>}
            <Badge variant="secondary">招聘 {job.headcount} 人</Badge>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">岗位描述</h3>
            <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{job.description}</p>
          </div>
        </CardContent>
      </Card>

      {canApply && (
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">对这份工作感兴趣？</p>
              <p className="mt-0.5 text-xs text-muted-foreground">选择已解析的简历投递，AI 会附带匹配结果供招聘方参考</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={async () => {
                try {
                  const res = await messageApi.createConversation({ receiverId: job.enterpriseId, jobId: job.id })
                  toast.success('已创建会话')
                  navigate(`/messages?conv=${res.data.id}`)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : '操作失败')
                }
              }}>
                <MessageSquare className="size-3.5" />
                联系招聘方
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" />
              投递管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to={`/applications?jobId=${job.id}`}>
              <Button variant="outline">查看此岗位的投递记录</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <ApplyDialog
        open={showApply}
        jobId={job.id}
        resumes={resumes}
        onClose={() => setShowApply(false)}
        onApplied={() => { setShowApply(false); navigate('/applications') }}
      />
    </div>
  )
}
