import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentApi, matchingApi } from '@/services/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScoreRing } from '@/components/dashboard/ScoreRing'
import { ArrowLeft, Briefcase, ChevronRight, Workflow } from 'lucide-react'
import type { Document, MatchResult } from '@/types'

const FIELD_LABELS: Record<string, string> = {
  title: '职位名称', company: '公司', companyName: '公司', city: '城市', location: '工作地点',
  department: '部门', salaryRange: '薪资范围', experienceRequired: '经验要求',
  educationRequired: '学历要求', companyIndustry: '行业', companySize: '公司规模',
}

export function JobDetail() {
  const { jobDocId } = useParams<{ jobDocId: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<Document | null>(null)
  const [candidates, setCandidates] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!jobDocId) return
    Promise.all([
      documentApi.get(jobDocId).then((r) => setJob(r.data)),
      matchingApi.getByJob(jobDocId).then((r) => setCandidates(r.data)).catch(() => undefined),
    ]).finally(() => setLoading(false))
  }, [jobDocId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (!job) return <div className="py-12 text-center text-muted-foreground">职位不存在</div>

  const structured = ((job.parsedJson as { structured?: Record<string, unknown> } | null)?.structured ?? {}) as Record<string, unknown>
  const title = String(structured.title || job.originalFilename)
  const company = String(structured.company || structured.companyName || '')
  const city = String(structured.city || structured.location || '')
  const summary = String(structured.summary || '')

  const fields = Object.entries(structured)
    .filter(([, v]) => v != null && typeof v !== 'object' && String(v).trim())
    .map(([key, value]) => ({ label: FIELD_LABELS[key] || key, value: String(value) }))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={title}
        description={[company, city, candidates.length > 0 ? `${candidates.length} 位匹配候选人` : ''].filter(Boolean).join(' · ') || job.originalFilename}
        icon={Briefcase}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="size-3.5" />
              返回
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/pipeline/${job.id}`)}>
              <Workflow className="size-3.5" />
              解析过程
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">结构化信息</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {fields.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {fields.map((field) => (
                <div key={field.label} className="rounded-xl border bg-muted/20 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground">{field.label}</p>
                  <p className="mt-0.5 truncate text-sm font-medium">{field.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无结构化信息</p>
          )}

          {summary && (
            <div className="mt-4 rounded-xl bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">职位摘要</p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">候选人排名</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {candidates.length === 0 ? (
            <div className="py-10 text-center">
              <Briefcase className="mx-auto size-8 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium">暂无匹配候选人</p>
              <p className="mt-1 text-xs text-muted-foreground">人才库中有已解析的简历后会自动生成排名</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {candidates.map((candidate, index) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="flex w-full items-center gap-4 rounded-xl border p-3.5 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
                  onClick={() => navigate(`/matching/${candidate.id}`)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{candidate.candidateName || '未知候选人'}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[candidate.candidateCity, candidate.matchDetails?.length ? `${candidate.matchDetails.length} 项技能匹配` : ''].filter(Boolean).join(' · ') || '等待查看详情'}
                    </span>
                    {candidate.matchDetails && candidate.matchDetails.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {candidate.matchDetails.slice(0, 5).map((d, j) => (
                          <Badge key={j} variant="secondary" className="h-4 px-1.5 text-[10px]">{d.skillName}</Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  <ScoreRing score={candidate.overallScore} size={46} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
