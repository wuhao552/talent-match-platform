import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentApi, matchingApi } from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor } from '@/lib/utils'
import { ChevronLeft, Activity } from 'lucide-react'
import type { Document, MatchResult } from '@/types'

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

  const structured = (job.parsedJson as any)?.structured as Record<string, unknown> | undefined
  const title = (structured?.title as string) || job.originalFilename
  const company = structured?.company as string | undefined
  const city = structured?.city as string | undefined
  const summary = structured?.summary as string | undefined

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {[company, city].filter(Boolean).join(' · ')}
            {candidates.length > 0 ? ` · ${candidates.length} 位匹配候选人` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/graph/${job.id}`)}>
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          解析过程
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {structured && Object.entries(structured)
          .filter(([, v]) => v != null && typeof v !== 'object' && typeof v !== 'undefined')
          .map(([k, v]) => (
            <div key={k} className="rounded-lg border px-3 py-1.5">
              <span className="text-[10px] text-muted-foreground mr-2">{k}</span>
              <span className="text-sm font-medium">{String(v)}</span>
            </div>
          ))}
      </div>

      {summary && <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>}

      {job.parsedText && (
        <div>
          <p className="mb-1.5 text-sm font-medium">原始招聘信息</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs leading-relaxed text-muted-foreground">{job.parsedText}</pre>
        </div>
      )}

      <h2 className="text-base font-semibold">候选人排名</h2>
      {candidates.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>暂无匹配候选人</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c, i) => (
            <Card key={c.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate(`/matching/${c.id}`)}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold tabular-nums">{i + 1}</div>
                  <div>
                    <h3 className="font-medium">{c.candidateName || '未知候选人'}</h3>
                    <p className="text-xs text-muted-foreground">
                      {[c.candidateCity, c.matchDetails?.length ? `${c.matchDetails.length} 项技能匹配` : ''].filter(Boolean).join(' · ')}
                    </p>
                    {c.matchDetails && c.matchDetails.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.matchDetails.slice(0, 5).map((d, j) => (
                          <Badge key={j} variant="secondary" className="text-[10px]">{d.skillName}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <p className={`text-xl font-bold tabular-nums ${scoreColor(c.overallScore)}`}>{Math.round(c.overallScore)}</p>
                  <p className="text-[10px] text-muted-foreground">分</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
