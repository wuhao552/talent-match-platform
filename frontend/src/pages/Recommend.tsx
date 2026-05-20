import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { matchingApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import type { MatchResult } from '@/types'

export function Recommend() {
  const { user } = useAuth()
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

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user?.role === 'individual' ? '职位推荐' : '候选人推荐'}
          </h1>
          <p className="text-muted-foreground">
            {user?.role === 'individual'
              ? '基于您的技能图谱为您推荐最匹配的职位'
              : '基于职位要求为您推荐最匹配的候选人'}
          </p>
        </div>
        <Button onClick={handleRecommend} disabled={loading}>
          {loading ? '分析中...' : '刷新推荐'}
        </Button>
      </div>

      {results.length === 0 && !loading ? (
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
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {user?.role === 'individual' ? '职位匹配' : '候选人匹配'}
                  </CardTitle>
                  <span className={`text-2xl font-bold ${scoreColor(result.overallScore)}`}>
                    {result.overallScore}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Badge variant="outline">技能: {result.skillMatchScore}%</Badge>
                  {result.cityMatchBonus > 0 && (
                    <Badge variant="secondary">城市: +{result.cityMatchBonus}%</Badge>
                  )}
                </div>

                {result.matchDetails && result.matchDetails.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      匹配技能 ({result.matchDetails.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {result.matchDetails.slice(0, 8).map((d, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {d.skillName} {d.score}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Button size="sm" variant="outline">
                  <a href={`/matching/${result.resumeDocId}`}>查看详情</a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
