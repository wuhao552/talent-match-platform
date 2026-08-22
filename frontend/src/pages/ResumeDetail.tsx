import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentApi, matchingApi } from '@/services/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScoreRing } from '@/components/dashboard/ScoreRing'
import { ArrowLeft, Briefcase, ChevronRight, FileText, Workflow } from 'lucide-react'
import type { Document, DocumentSkill, MatchResult } from '@/types'

const FIELD_LABELS: Record<string, string> = {
  name: '姓名', title: '当前职位', city: '城市', email: '邮箱', phone: '电话',
  yearsOfExperience: '工作年限', education: '学历', school: '毕业院校', company: '当前公司',
}

export function ResumeDetail() {
  const { resumeDocId } = useParams<{ resumeDocId: string }>()
  const navigate = useNavigate()
  const [resume, setResume] = useState<Document | null>(null)
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!resumeDocId) return
    Promise.all([
      documentApi.get(resumeDocId).then((r) => setResume(r.data)),
      matchingApi.getByResume(resumeDocId).then((r) => setMatches(r.data)).catch(() => undefined),
      documentApi.getSkills(resumeDocId).then((r) => setSkills(r.data)).catch(() => undefined),
    ]).finally(() => setLoading(false))
  }, [resumeDocId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (!resume) return <div className="py-12 text-center text-muted-foreground">简历不存在</div>

  const structured = ((resume.parsedJson as { structured?: Record<string, unknown> } | null)?.structured ?? {}) as Record<string, unknown>
  const name = String(structured.name || resume.originalFilename)
  const meta = [structured.title, structured.city, structured.email].filter(Boolean).map(String).join(' · ') || '个人简历'
  const summary = String(structured.summary || '')
  const fields = Object.entries(structured)
    .filter(([key, v]) => !['skills', 'education', 'experience', 'summary'].includes(key) && v != null && typeof v !== 'object' && String(v).trim())
    .map(([key, value]) => ({ label: FIELD_LABELS[key] || key, value: String(value) }))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={name}
        description={meta}
        icon={FileText}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="size-3.5" />
              返回
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/pipeline/${resume.id}`)}>
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
              <p className="text-xs font-medium text-muted-foreground">个人摘要</p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{summary}</p>
            </div>
          )}

          {skills.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">技能标签（{skills.length}）</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px]">
                    {skill.skillName || skill.skill?.name || `技能#${skill.skillId}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">匹配职位{matches.length > 0 ? `（${matches.length}）` : ''}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {matches.length === 0 ? (
            <div className="py-10 text-center">
              <Briefcase className="mx-auto size-8 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium">暂无匹配职位</p>
              <p className="mt-1 text-xs text-muted-foreground">系统中还需有已解析的职位描述</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {matches.map((match, index) => (
                <button
                  key={match.id}
                  type="button"
                  className="flex w-full items-center gap-4 rounded-xl border p-3.5 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
                  onClick={() => navigate(`/matching/${match.id}`)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{match.jobTitle || match.jobFilename || '未知职位'}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[match.companyName, match.jobCity, match.matchDetails?.length ? `${match.matchDetails.length} 项技能匹配` : ''].filter(Boolean).join(' · ') || '等待查看详情'}
                    </span>
                    {match.matchDetails && match.matchDetails.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {match.matchDetails.slice(0, 5).map((d, j) => (
                          <Badge key={j} variant="secondary" className="h-4 px-1.5 text-[10px]">{d.skillName}</Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  <ScoreRing score={match.overallScore} size={46} />
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
