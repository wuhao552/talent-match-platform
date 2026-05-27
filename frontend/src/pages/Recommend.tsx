import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { matchingApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { scoreColor } from '@/lib/utils'

import type { MatchResult } from '@/types'

function ScoreBadge({ score, bonusInfo }: { score: number; bonusInfo?: string }) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1 text-2xl font-bold tabular-nums">
        <span className={scoreColor(score)}>{Math.round(score)}</span>
        <span className="text-sm font-normal text-muted-foreground">分</span>
      </div>
      {bonusInfo && (
        <span className="text-[10px] text-muted-foreground">{bonusInfo}</span>
      )}
    </div>
  )
}

export function Recommend() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [results, setResults] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(false)

  const handleRecommend = async () => {
    setLoading(true)
    try {
      const res = await matchingApi.recommend()
      setResults(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    handleRecommend()
  }, [])

  const isIndividual = user?.role === 'individual'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isIndividual ? '职位推荐' : '候选人推荐'}
          </h1>
          <p className="text-muted-foreground">
            {isIndividual
              ? '基于您的技能图谱为您推荐最匹配的职位'
              : '基于职位要求为您推荐最匹配的候选人'}
          </p>
        </div>
        <Button onClick={handleRecommend} disabled={loading}>
          {loading ? 'LLM 深度匹配中...' : '刷新推荐'}
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
            <p className="text-lg font-medium">LLM 深度匹配计算中...</p>
            <p className="text-sm text-muted-foreground mt-1">正在调用大模型进行技能语义匹配，请稍候</p>
          </CardContent>
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-4xl font-bold text-muted-foreground">--</p>
            <p className="mt-4 text-lg font-medium">暂无推荐结果</p>
            <p className="text-sm text-muted-foreground">
              请先上传文档后，系统将自动分析并推荐
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((result) => (
            <Card key={result.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base truncate">
                      {isIndividual
                        ? (result.jobTitle || result.jobFilename || '未知职位')
                        : (result.candidateName || '未知候选人')}
                    </CardTitle>
                    {isIndividual && result.companyName && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{result.companyName}</p>
                    )}
                    {!isIndividual && result.candidateCity && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{result.candidateCity}</p>
                    )}
                  </div>
                  <ScoreBadge
                    score={result.overallScore}
                    bonusInfo={
                      (result.cityMatchBonus || 0) > 0
                        ? `同城+${result.cityMatchBonus}`
                        : undefined
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Matching skills */}
                {result.matchDetails && result.matchDetails.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      匹配技能 ({result.matchDetails.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {result.matchDetails.slice(0, 8).map((d, i) => (
                        <Badge key={i} variant="secondary" className="text-[11px]">
                          {d.skillName}
                        </Badge>
                      ))}
                      {result.matchDetails.length > 8 && (
                        <span className="text-[11px] text-muted-foreground">
                          +{result.matchDetails.length - 8}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <Button size="sm" variant="outline" onClick={() => navigate(`/matching/${result.id}`)}>
                  查看详情
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
