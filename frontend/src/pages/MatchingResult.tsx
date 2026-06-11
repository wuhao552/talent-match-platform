import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { matchingApi, documentApi, graphApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor, proficiencyLabel } from '@/lib/utils'
import { SkillForceGraph } from '@/components/graph/SkillForceGraph'
import { ChevronLeft, MapPin, Building, Clock } from 'lucide-react'
import type { MatchResult, Document, DocumentSkill } from '@/types'

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right text-xs tabular-nums">
        +{value.toFixed(1)}
      </span>
    </div>
  )
}

export function MatchingResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [jobDoc, setJobDoc] = useState<Document | null>(null)
  const [skills, setSkills] = useState<DocumentSkill[]>([])
  const [jobSkills, setJobSkills] = useState<DocumentSkill[]>([])
  const [coocEdges, setCoocEdges] = useState<Array<{ sourceId: number; targetId: number; freqSkill: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    matchingApi.getResult(id)
      .then(async (res) => {
        setMatch(res.data)
        const [job, sk, jsk] = await Promise.all([
          documentApi.get(res.data.jobDocId).then((r) => r.data).catch(() => null),
          documentApi.getSkills(res.data.resumeDocId).then((r) => r.data).catch(() => [] as DocumentSkill[]),
          documentApi.getSkills(res.data.jobDocId).then((r) => r.data).catch(() => [] as DocumentSkill[]),
        ])
        setJobDoc(job)
        setSkills(sk)
        setJobSkills(jsk)
        // Fetch co-occurrence edges for the skill graph
        const allIds = [...new Set([...sk.map((s: DocumentSkill) => s.skillId), ...jsk.map((s: DocumentSkill) => s.skillId)])]
        if (allIds.length >= 2) {
          graphApi.getCooccurrenceBatch(allIds).then((r) => setCoocEdges(r.data)).catch(() => {})
        }
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
        <p className="text-muted-foreground">{error || '数据异常'}</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>返回工作台</Button>
      </div>
    )
  }

  const jobStructured = (jobDoc?.parsedJson as any)?.structured || {}

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{match.jobTitle || match.jobFilename || '职位详情'}</h1>
          <p className="text-sm text-muted-foreground">
            匹配度 {Math.round(match.overallScore)}% · {match.matchDetails?.length || 0} 项技能匹配
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl leading-tight">{match.jobTitle || match.jobFilename}</CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {match.companyName && <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" />{match.companyName}</span>}
                {match.jobCity && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{match.jobCity}</span>}
                {jobDoc?.createdAt && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(jobDoc.createdAt).toLocaleDateString('zh-CN')}</span>}
                {jobStructured.salary && <span className="font-medium text-foreground">{String(jobStructured.salary)}</span>}
                {jobStructured.education && <span>{String(jobStructured.education)}</span>}
                {(jobStructured.experience || jobStructured.workYears) && <span>{String(jobStructured.experience || jobStructured.workYears)}</span>}
              </div>
            </div>
            <div className="ml-4 shrink-0 text-center">
              <p className={`text-2xl font-bold tabular-nums ${scoreColor(match.overallScore)}`}>{Math.round(match.overallScore)}%</p>
              <p className="text-[10px] text-muted-foreground">匹配度</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {match.jobTopSkills && match.jobTopSkills.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">技能要求</p>
              <div className="flex flex-wrap gap-1.5">{match.jobTopSkills.map((s, i) => <Badge key={i} variant="secondary" className="text-[11px]">{s}</Badge>)}</div>
            </div>
          )}
          {jobStructured.summary && (
            <div>
              <p className="mb-1.5 text-sm font-medium">职位描述</p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{String(jobStructured.summary)}</p>
            </div>
          )}
          {(() => {
            const skipKeys = ['skills', 'education', 'experience', 'summary', 'title', 'name', 'company', 'companyName', 'location', 'city', 'salary', 'workYears']
            const extraEntries = Object.entries(jobStructured as Record<string, unknown>)
              .filter(([k, v]) => !skipKeys.includes(k) && v != null && typeof v !== 'object' && String(v).trim() !== '')
            if (extraEntries.length === 0) return null
            return (
              <div>
                <p className="mb-2 text-sm font-medium">其他信息</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {extraEntries.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <span className="shrink-0 text-muted-foreground">{k}</span>
                      <span className="truncate font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {match.matchDetails && match.matchDetails.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">技能匹配详情 ({match.matchDetails.length} 项)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {match.matchDetails.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{d.skillName}</span>
                    {d.importance && (
                      <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${
                        d.importance === 'required' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        d.importance === 'preferred' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {d.importance === 'required' ? '必须' : d.importance === 'preferred' ? '加分' : '可选'}
                      </span>
                    )}
                    {d.hotnessBoost != null && d.hotnessBoost > 0 && (
                      <span className="ml-1 text-[10px] text-orange-500">+{d.hotnessBoost}热度</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-3">
                    <span>{proficiencyLabel[d.personProficiency] || d.personProficiency}</span>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    <span>{proficiencyLabel[d.jobRequirement] || d.jobRequirement}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score breakdown */}
      {match.scoreBreakdown && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">匹配分详情</CardTitle>
              <span className={`text-lg font-bold tabular-nums ${scoreColor(match.scoreBreakdown.overallScore)}`}>
                {Math.round(match.scoreBreakdown.overallScore)} 分
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <ScoreBar label="技能匹配" value={match.scoreBreakdown.skillMatchScore * 0.6} max={60} />
              <ScoreBar label="知识图谱共现" value={match.scoreBreakdown.cooccurrenceBonus} max={15} />
              <ScoreBar label="同城/同区域" value={match.scoreBreakdown.cityMatchBonus} max={10} />
              <ScoreBar label="高热度技能" value={match.scoreBreakdown.hotnessBonus} max={15} />
              <ScoreBar label="经验溢出" value={match.scoreBreakdown.experienceBonus} max={5} />
              <ScoreBar label="行业匹配" value={match.scoreBreakdown.industryMatchBonus} max={5} />
              <ScoreBar label="技能趋势" value={match.scoreBreakdown.trendBonus} max={5} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skill graph */}
      {skills.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">能力图谱</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillForceGraph
              skills={skills}
              jobSkills={jobSkills}
              matchedSkillIds={match.matchDetails?.filter((d) => d.skillId > 0).map((d) => d.skillId)}
              matchedPairs={match.matchDetails?.map((d) => ({ resumeSkillId: d.resumeSkillId, jobSkillId: d.jobSkillId }))}
              coocEdges={coocEdges}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
