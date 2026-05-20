import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { matchingApi } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { MatchResult } from '@/types'

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-500'
}

function scoreBg(score: number) {
  if (score >= 80) return 'from-emerald-50 to-white border-emerald-200'
  if (score >= 60) return 'from-amber-50 to-white border-amber-200'
  if (score >= 40) return 'from-orange-50 to-white border-orange-200'
  return 'from-red-50 to-white border-red-200'
}

function scoreProgressColor(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export function MatchingResult() {
  const { docId } = useParams<{ docId: string }>()
  const { user } = useAuth()
  const [results, setResults] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)

  const loadResults = useCallback(() => {
    setLoading(true)
    matchingApi.getResults()
      .then((res) => {
        const filtered = docId
          ? res.data.filter((r: MatchResult) => r.resumeDocId === docId || r.jobDocId === docId)
          : res.data
        setResults(filtered)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [docId])

  useEffect(() => { loadResults() }, [loadResults])

  const handleMatch = async () => {
    setMatching(true)
    try {
      await matchingApi.recommend()
      await loadResults()
    } catch (err) {
      console.error(err)
    } finally {
      setMatching(false)
    }
  }

  const isIndividual = user?.role === 'individual'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isIndividual ? '职位匹配' : '候选人匹配'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isIndividual ? '根据您的技能图谱智能推荐匹配职位' : '根据职位要求智能推荐匹配候选人'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/dashboard'}>
            返回
          </Button>
          <Button size="sm" onClick={handleMatch} disabled={matching}>
            {matching ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                匹配中
              </span>
            ) : (
              isIndividual ? '开始匹配' : '开始匹配'
            )}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-muted-foreground">加载中...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && results.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-lg font-medium">暂无匹配结果</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isIndividual
                ? '点击「开始匹配」，系统将根据您的简历自动匹配所有已发布的职位'
                : '点击「开始匹配」，系统将根据您的职位要求自动匹配所有候选人简历'}
            </p>
            <Button className="mt-6" onClick={handleMatch} disabled={matching}>
              {matching ? '匹配中...' : '开始匹配'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-4">
          {results.map((r) => (
            <Card
              key={r.id}
              className={`overflow-hidden border bg-gradient-to-br ${scoreBg(r.overallScore)}`}
            >
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  {/* Left: Candidate / Job info */}
                  <div className="flex-1 p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {isIndividual ? '职位匹配' : '候选人匹配'}
                      </Badge>
                    </div>

                    {/* Main title */}
                    <h3 className="text-lg font-semibold leading-tight">
                      {isIndividual
                        ? (r.jobTitle || r.jobFilename || '未知职位')
                        : (r.candidateName || '未知候选人')}
                    </h3>

                    {/* Subtitle row */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {isIndividual && (
                        <>
                          {r.companyName && r.companyName !== r.jobFilename && (
                            <span>{r.companyName}</span>
                          )}
                          <span>{r.jobFilename}</span>
                        </>
                      )}
                      {!isIndividual && (
                        <>
                          <span>{r.candidateName}</span>
                          {r.candidateCity && <span>{r.candidateCity}</span>}
                        </>
                      )}
                    </div>

                    {/* Skills preview */}
                    {(isIndividual ? r.jobTopSkills : r.candidateTopSkills)?.length && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(isIndividual ? r.jobTopSkills! : r.candidateTopSkills!).slice(0, 8).map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                        ))}
                        {(isIndividual ? r.jobTopSkills! : r.candidateTopSkills!).length > 8 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{(isIndividual ? r.jobTopSkills! : r.candidateTopSkills!).length - 8} 更多
                          </span>
                        )}
                      </div>
                    )}

                    {/* Match details expandable */}
                    {r.matchDetails && r.matchDetails.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-primary/70 hover:text-primary">
                          查看技能匹配明细 ({r.matchDetails.length} 项)
                        </summary>
                        <div className="mt-2 space-y-1 max-h-48 overflow-auto">
                          {r.matchDetails.map((d, i) => (
                            <div key={i} className="flex items-center justify-between rounded bg-background/60 px-2 py-1 text-xs">
                              <span className="font-medium">{d.skillName}</span>
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <span>{d.personProficiency}</span>
                                <span>/</span>
                                <span>{d.jobRequirement}</span>
                                <span className={`ml-1 font-medium tabular-nums ${scoreColor(d.score)}`}>{d.score}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Right: Score */}
                  <div className="flex shrink-0 flex-col items-center justify-center border-t bg-white/40 p-5 sm:w-32 sm:border-l sm:border-t-0">
                    <span className={`text-4xl font-bold tabular-nums ${scoreColor(r.overallScore)}`}>
                      {r.overallScore}
                    </span>
                    <span className="text-xs text-muted-foreground">分</span>
                    <Progress
                      value={r.overallScore}
                      className={`mt-2 h-1.5 w-full [&>div]:${scoreProgressColor(r.overallScore)}`}
                    />

                    <div className="mt-3 space-y-0.5 text-center text-[10px] text-muted-foreground">
                      <div>技能 {r.skillMatchScore}%</div>
                      {r.cityMatchBonus > 0 && <div className="text-emerald-600">城市 +{r.cityMatchBonus}%</div>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
