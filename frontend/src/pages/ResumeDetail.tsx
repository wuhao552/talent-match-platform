import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentApi, matchingApi } from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react'
import type { Document, DocumentSkill, MatchResult } from '@/types'

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
      matchingApi.getByResume(resumeDocId).then((r) => setMatches(r.data)).catch(() => {}),
      documentApi.getSkills(resumeDocId).then((r) => setSkills(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [resumeDocId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (!resume) return <div className="py-12 text-center text-muted-foreground">简历不存在</div>

  const structured = (resume.parsedJson as any)?.structured || {}

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{structured.name || resume.originalFilename}</h1>
          <p className="text-sm text-muted-foreground">
            {[structured.title, structured.city, structured.email].filter(Boolean).join(' · ') || '个人简历'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/pipeline/${resume.id}`)}>
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          解析过程
        </Button>
      </div>

      {/* Resume fields */}
      {Object.keys(structured).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(structured as Record<string, unknown>)
            .filter(([k, v]) => !['skills', 'education', 'experience', 'summary'].includes(k) && typeof v !== 'object')
            .map(([k, v]) => (
              <div key={k} className="rounded-lg border px-3 py-2">
                <p className="text-[10px] text-muted-foreground">{k}</p>
                <p className="text-sm font-medium truncate">{v == null ? '未提取' : String(v)}</p>
              </div>
            ))}
        </div>
      )}

      {structured.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">{String(structured.summary)}</p>
      )}

      {/* Skills from the resume */}
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s, i) => (
          <Badge key={i} variant="secondary" className="text-[11px]">{s.skillName || `技能#${s.skillId}`}</Badge>
        ))}
      </div>

      {/* Ranked job matches */}
      <div>
        <h2 className="mb-3 text-base font-semibold">
          匹配职位 {matches.length > 0 && `(${matches.length})`}
        </h2>
        {matches.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>暂无匹配职位</p>
            <p className="text-xs mt-1">系统中还需有已解析的职位描述</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m, i) => (
              <Card
                key={m.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/matching/${m.id}`)}
              >
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold tabular-nums">
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="font-medium">{m.jobTitle || m.jobFilename || '未知职位'}</h3>
                      <p className="text-xs text-muted-foreground">
                        {[m.companyName, m.jobCity].filter(Boolean).join(' · ')}
                        {m.matchDetails?.length ? ` · ${m.matchDetails.length} 项技能匹配` : ''}
                      </p>
                      {m.matchDetails && m.matchDetails.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.matchDetails.slice(0, 5).map((d, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{d.skillName}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className={`text-lg font-bold tabular-nums ${scoreColor(m.overallScore)}`}>
                        {Math.round(m.overallScore)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">分</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
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
