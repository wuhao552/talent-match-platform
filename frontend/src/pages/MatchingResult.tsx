import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { matchingApi, documentApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor, proficiencyLabel } from '@/lib/utils'
import { ChevronLeft, MapPin, Building, Clock, User, Mail, Phone } from 'lucide-react'
import type { MatchResult, Document } from '@/types'

const FIELD_LABEL: Record<string, string> = {
  name: '姓名',
  title: '职位',
  city: '城市',
  email: '邮箱',
  phone: '电话',
  company: '公司',
  age: '年龄',
  gender: '性别',
  years: '工作年限',
  salary: '期望薪资',
}

type StructuredRecord = Record<string, unknown>

function formatFieldLabel(key: string) {
  return FIELD_LABEL[key] || key
}

function ScalarFields({ data, exclude }: { data: StructuredRecord; exclude: string[] }) {
  const entries = Object.entries(data).filter(
    ([k, v]) => !exclude.includes(k) && v != null && typeof v !== 'object',
  )
  if (entries.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-lg border px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground mr-2">{formatFieldLabel(k)}</span>
          <span className="text-sm font-medium">{String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function EducationList({ items }: { items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-sm font-medium">教育背景</p>
      <div className="space-y-3">
        {(items as StructuredRecord[]).map((edu, i) => (
          <div key={i} className="rounded-lg border px-4 py-3 text-sm">
            <p className="font-medium">
              {[edu.school, edu.major].filter(Boolean).join(' · ') || '教育经历'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[edu.degree, edu.year].filter(Boolean).join(' · ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExperienceList({ items }: { items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-sm font-medium">工作经历</p>
      <div className="space-y-3">
        {(items as StructuredRecord[]).map((exp, i) => (
          <div key={i} className="rounded-lg border px-4 py-3 text-sm">
            <p className="font-medium">
              {[exp.company, exp.title].filter(Boolean).join(' · ') || '工作经历'}
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
  )
}

function CandidateProfileCard({
  match,
  resumeDoc,
  resumeStructured,
}: {
  match: MatchResult
  resumeDoc: Document | null
  resumeStructured: StructuredRecord
}) {
  const name = (resumeStructured.name as string) || match.candidateName || resumeDoc?.originalFilename || '候选人'
  const skills = (match.candidateTopSkills?.length
    ? match.candidateTopSkills
    : Array.isArray(resumeStructured.skills)
      ? (resumeStructured.skills as string[])
      : []) as string[]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{name}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(resumeStructured.title as string) && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> {String(resumeStructured.title)}
                </span>
              )}
              {(match.candidateCity || (resumeStructured.city as string)) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {match.candidateCity || String(resumeStructured.city)}
                </span>
              )}
              {resumeStructured.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {String(resumeStructured.email)}
                </span>
              )}
              {resumeStructured.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {String(resumeStructured.phone)}
                </span>
              )}
              {resumeDoc?.createdAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(resumeDoc.createdAt).toLocaleDateString('zh-CN')} 投递
                </span>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold tabular-nums ${scoreColor(match.overallScore)}`}>
              {Math.round(match.overallScore)}%
            </p>
            <p className="text-[10px] text-muted-foreground">匹配度</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <ScalarFields
          data={resumeStructured}
          exclude={['skills', 'education', 'experience', 'summary', 'title', 'name', 'city', 'email', 'phone']}
        />

        {skills.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">技能标签</p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-[11px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {resumeStructured.summary && (
          <div>
            <p className="mb-1.5 text-sm font-medium">个人简介</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {String(resumeStructured.summary)}
            </p>
          </div>
        )}

        <EducationList items={resumeStructured.education} />
        <ExperienceList items={resumeStructured.experience} />
      </CardContent>
    </Card>
  )
}

function JobProfileCard({
  match,
  jobDoc,
  jobStructured,
  compact,
}: {
  match: MatchResult
  jobDoc: Document | null
  jobStructured: StructuredRecord
  compact?: boolean
}) {
  return (
    <Card>
      <CardHeader className={compact ? 'pb-3' : undefined}>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className={compact ? 'text-base' : 'text-xl'}>
              {match.jobTitle || match.jobFilename}
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {match.companyName && (
                <span className="flex items-center gap-1">
                  <Building className="h-3.5 w-3.5" /> {match.companyName}
                </span>
              )}
              {match.jobCity && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {match.jobCity}
                </span>
              )}
              {jobDoc?.createdAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(jobDoc.createdAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </div>
          </div>
          {!compact && (
            <div className="text-center">
              <p className={`text-2xl font-bold tabular-nums ${scoreColor(match.overallScore)}`}>
                {Math.round(match.overallScore)}%
              </p>
              <p className="text-[10px] text-muted-foreground">匹配度</p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className={`space-y-6 ${compact ? 'pt-0' : ''}`}>
        {!compact && (
          <ScalarFields
            data={jobStructured}
            exclude={['skills', 'education', 'experience', 'summary', 'title', 'name']}
          />
        )}

        {match.jobTopSkills && match.jobTopSkills.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">技能要求</p>
            <div className="flex flex-wrap gap-1.5">
              {match.jobTopSkills.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-[11px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {jobStructured.summary && (
          <div>
            <p className="mb-1.5 text-sm font-medium">职位描述</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {String(jobStructured.summary)}
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  )
}

export function MatchingResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isRecruiter = user?.role === 'enterprise'

  const [match, setMatch] = useState<MatchResult | null>(null)
  const [jobDoc, setJobDoc] = useState<Document | null>(null)
  const [resumeDoc, setResumeDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    matchingApi
      .getResult(id)
      .then(async (res) => {
        setMatch(res.data)
        const [job, resume] = await Promise.all([
          documentApi
            .get(res.data.jobDocId)
            .then((r) => r.data)
            .catch(() => null),
          documentApi
            .get(res.data.resumeDocId)
            .then((r) => r.data)
            .catch(() => null),
        ])
        setJobDoc(job)
        setResumeDoc(resume)
      })
      .catch(() => setError('未找到该匹配结果'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">{error || '数据异常'}</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          返回工作台
        </Button>
      </div>
    )
  }

  const jobStructured = ((jobDoc?.parsedJson as StructuredRecord)?.structured || {}) as StructuredRecord
  const resumeStructured = ((resumeDoc?.parsedJson as StructuredRecord)?.structured ||
    {}) as StructuredRecord
  const candidateName =
    (resumeStructured.name as string) || match.candidateName || '候选人'
  const jobTitle = match.jobTitle || match.jobFilename || '职位'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isRecruiter ? candidateName : jobTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRecruiter
              ? `应聘 ${jobTitle} · 匹配度 ${Math.round(match.overallScore)}% · ${match.matchDetails?.length || 0} 项技能匹配`
              : `匹配度 ${Math.round(match.overallScore)}% · ${match.matchDetails?.length || 0} 项技能匹配`}
          </p>
        </div>
      </div>

      {isRecruiter ? (
        <>
          <CandidateProfileCard
            match={match}
            resumeDoc={resumeDoc}
            resumeStructured={resumeStructured}
          />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              对应职位
            </p>
            <JobProfileCard
              match={match}
              jobDoc={jobDoc}
              jobStructured={jobStructured}
              compact
            />
          </div>
        </>
      ) : (
        <JobProfileCard match={match} jobDoc={jobDoc} jobStructured={jobStructured} />
      )}

      {match.matchDetails && match.matchDetails.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">技能匹配 ({match.matchDetails.length} 项)</CardTitle>
            <CardDescription>
              {candidateName} ↔ {jobTitle}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {match.matchDetails.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div>
                    <span className="text-sm font-medium">{d.skillName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={
                        d.score >= 75
                          ? 'text-green-600 font-medium'
                          : d.score >= 50
                            ? 'text-amber-600'
                            : ''
                      }
                    >
                      {proficiencyLabel[d.personProficiency] || d.personProficiency}
                    </span>
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                    <span>{proficiencyLabel[d.jobRequirement] || d.jobRequirement}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
