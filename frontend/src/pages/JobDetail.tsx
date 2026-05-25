import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentApi, matchingApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor, STATUS_LABEL } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MapPin, Building, Clock, Briefcase } from 'lucide-react'
import type { Document, MatchResult } from '@/types'

const FIELD_LABEL: Record<string, string> = {
  name: '姓名',
  title: '职位',
  city: '城市',
  company: '公司',
  organization: '公司',
  email: '邮箱',
  phone: '电话',
  salary: '薪资',
  experience: '经验要求',
  education: '学历要求',
  department: '部门',
  employment: '用工形式',
  headcount: '招聘人数',
}

type StructuredRecord = Record<string, unknown>

function formatFieldLabel(key: string) {
  return FIELD_LABEL[key] || key
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
      matchingApi.getByJob(jobDocId).then((r) => setCandidates(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [jobDocId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!job) return <div className="py-12 text-center text-muted-foreground">职位不存在</div>

  const structured = ((job.parsedJson as StructuredRecord)?.structured || {}) as StructuredRecord
  const title = (structured.title as string) || job.originalFilename
  const company =
    (structured.company as string) || (structured.organization as string) || ''
  const city = (structured.city as string) || ''
  const skills = (Array.isArray(structured.skills) ? structured.skills : []) as string[]
  const topCandidate = candidates[0]

  const scalarEntries = Object.entries(structured).filter(
    ([k, v]) =>
      !['skills', 'education', 'experience', 'summary', 'title', 'name', 'company', 'organization', 'city'].includes(k) &&
      v != null &&
      typeof v !== 'object',
  )

  const educationItems = Array.isArray(structured.education) ? structured.education : []
  const experienceItems = Array.isArray(structured.experience) ? structured.experience : []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {[company, city].filter(Boolean).join(' · ') || '职位详情'}
            {candidates.length > 0 ? ` · ${candidates.length} 位匹配候选人` : ''}
          </p>
        </div>
      </div>

      {/* 职位完整信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl">{title}</CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {company && (
                  <span className="flex items-center gap-1">
                    <Building className="h-3.5 w-3.5 shrink-0" />
                    {company}
                  </span>
                )}
                {city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {city}
                  </span>
                )}
                {job.createdAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {new Date(job.createdAt).toLocaleDateString('zh-CN')} 发布
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  {STATUS_LABEL[job.status] || job.status}
                </span>
              </div>
              {job.originalFilename && job.originalFilename !== title && (
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  源文件：{job.originalFilename}
                </p>
              )}
            </div>
            {topCandidate && (
              <div className="shrink-0 text-center">
                <p className={`text-2xl font-bold tabular-nums ${scoreColor(topCandidate.overallScore)}`}>
                  {Math.round(topCandidate.overallScore)}
                </p>
                <p className="text-[10px] text-muted-foreground">最高匹配分</p>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {(company || city || structured.title) && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {company && (
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">公司</p>
                  <p className="text-sm font-medium truncate">{company}</p>
                </div>
              )}
              {city && (
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">城市</p>
                  <p className="text-sm font-medium">{city}</p>
                </div>
              )}
              {structured.title && (
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">职位</p>
                  <p className="text-sm font-medium truncate">{String(structured.title)}</p>
                </div>
              )}
            </div>
          )}

          {scalarEntries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {scalarEntries.map(([k, v]) => (
                <div key={k} className="rounded-lg border px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground mr-2">{formatFieldLabel(k)}</span>
                  <span className="text-sm font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {skills.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">技能要求 ({skills.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {structured.summary && (
            <div>
              <p className="mb-1.5 text-sm font-medium">职位描述</p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {String(structured.summary)}
              </p>
            </div>
          )}

          {educationItems.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">学历要求</p>
              <div className="space-y-2">
                {(educationItems as StructuredRecord[]).map((edu, i) => (
                  <div key={i} className="rounded-lg border px-4 py-2.5 text-sm">
                    <p className="font-medium">
                      {[edu.school, edu.major, edu.degree].filter(Boolean).join(' · ') || '学历要求'}
                    </p>
                    {edu.year && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{String(edu.year)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {experienceItems.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">岗位经历 / 职责</p>
              <div className="space-y-3">
                {(experienceItems as StructuredRecord[]).map((exp, i) => (
                  <div key={i} className="rounded-lg border px-4 py-3 text-sm">
                    <p className="font-medium">
                      {[exp.company, exp.title].filter(Boolean).join(' · ') || '相关要求'}
                    </p>
                    {exp.duration && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{String(exp.duration)}</p>
                    )}
                    {exp.description && (
                      <p className="mt-1.5 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {String(exp.description)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 候选人排名 */}
      <div>
        <h2 className="mb-3 text-base font-semibold">
          候选人排名 {candidates.length > 0 && `(${candidates.length})`}
        </h2>
        {candidates.length === 0 ? (
          <div className="rounded-lg border py-12 text-center">
            <p className="text-muted-foreground">暂无匹配候选人</p>
            <p className="mt-1 text-xs text-muted-foreground">
              系统中还需有已解析的候选人简历
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map((c, i) => (
              <Card
                key={c.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/matching/${c.id}`)}
              >
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold tabular-nums">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium">{c.candidateName || '未知候选人'}</h3>
                      <p className="text-xs text-muted-foreground">
                        {[c.candidateCity, c.resumeFilename].filter(Boolean).join(' · ')}
                        {c.matchDetails?.length ? ` · ${c.matchDetails.length} 项技能匹配` : ''}
                      </p>
                      {c.candidateTopSkills && c.candidateTopSkills.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.candidateTopSkills.slice(0, 4).map((s, j) => (
                            <Badge key={j} variant="outline" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {c.matchDetails && c.matchDetails.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.matchDetails.slice(0, 5).map((d, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">
                              {d.skillName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-center">
                      <p className={`text-xl font-bold tabular-nums ${scoreColor(c.overallScore)}`}>
                        {Math.round(c.overallScore)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">分</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
