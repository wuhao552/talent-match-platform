import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { jobApi, documentApi, messageApi } from '@/services/api'
import type { Job, Document } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApplyDialog } from '@/components/application/ApplyDialog'
import { toast } from 'sonner'
import { MapPin, Building2, Send, MessageSquare, Users } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', published: '招聘中', closed: '已关闭', archived: '已归档',
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
      } catch (e: any) {
        toast.error(e?.message || '岗位不存在')
        navigate('/jobs')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, navigate])

  const loadResumes = async () => {
    const res = await documentApi.list()
    setResumes(res.data.filter((d) => d.docType === 'resume' && d.status === 'parsed'))
  }

  if (loading) return <p className="text-muted-foreground py-12 text-center">加载中...</p>
  if (!job) return null

  const isOwner = job.enterpriseId === user?.id

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" onClick={() => navigate('/jobs')}>← 返回列表</Button>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {job.companyName && <span className="flex items-center gap-1"><Building2 className="h-4 w-4" />{job.companyName}</span>}
                {job.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>}
                {job.salaryMin != null && <span className="font-medium text-foreground">{job.salaryMax != null ? `${job.salaryMin}-${job.salaryMax}` : job.salaryMin} {job.salaryUnit === 'month' ? '元/月' : job.salaryUnit === 'year' ? '元/年' : ''}</span>}
              </div>
            </div>
            <Badge variant={job.status === 'published' ? 'default' : 'outline'}>
              {STATUS_LABEL[job.status]}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {job.experienceRequired && <Badge variant="secondary">{job.experienceRequired}</Badge>}
            {job.educationRequired && <Badge variant="secondary">{job.educationRequired}</Badge>}
            <Badge variant="secondary">{job.employmentType === 'full_time' ? '全职' : job.employmentType === 'part_time' ? '兼职' : job.employmentType === 'internship' ? '实习' : '合同制'}</Badge>
            <Badge variant="secondary">招聘 {job.headcount} 人</Badge>
          </div>

          <div>
            <h3 className="font-semibold mb-2">岗位描述</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
          </div>
        </CardContent>
      </Card>

      {/* 个人用户:投递 + 联系 */}
      {user?.role === 'individual' && job.status === 'published' && !isOwner && (
        <div className="flex gap-3">
          <Button onClick={() => { setShowApply(true); loadResumes() }}>
            <Send className="h-4 w-4 mr-1" /> 立即投递
          </Button>
          <Button variant="outline" onClick={async () => {
            try {
              const res = await messageApi.createConversation({ receiverId: job.enterpriseId, jobId: job.id })
              toast.success('已创建会话')
              navigate(`/messages?conv=${res.data.id}`)
            } catch (e: any) {
              toast.error(e?.message || '操作失败')
            }
          }}>
            <MessageSquare className="h-4 w-4 mr-1" /> 联系招聘方
          </Button>
        </div>
      )}

      {/* 企业所有者:查看投递 */}
      {isOwner && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />投递管理</CardTitle></CardHeader>
          <CardContent>
            <Link to={`/applications?jobId=${job.id}`}>
              <Button variant="outline">查看此岗位的投递记录 →</Button>
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

