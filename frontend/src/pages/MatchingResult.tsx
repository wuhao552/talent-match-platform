import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { matchingApi } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreColor, proficiencyLabel } from '@/lib/utils'
import type { MatchResult } from '@/types'

export function MatchingResult() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    matchingApi.getResult(id)
      .then((res) => setMatch(res.data))
      .catch(() => setError('未找到该匹配结果'))
      .finally(() => setLoading(false))
  }, [id])

  const isIndividual = user?.role === 'individual'

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-muted-foreground">加载中...</span>
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

  const leftName = isIndividual
    ? (match.jobTitle || match.jobFilename || '未知职位')
    : (match.candidateName || '未知候选人')
  const leftSub = isIndividual
    ? [match.companyName, match.jobCity].filter(Boolean).join(' · ')
    : match.candidateCity || ''
  const leftSkills = isIndividual ? match.jobTopSkills : match.candidateTopSkills

  const rightName = isIndividual
    ? (match.candidateName || '您的简历')
    : (match.jobTitle || match.jobFilename || '职位要求')
  const rightSub = isIndividual
    ? match.candidateCity || ''
    : [match.companyName, match.jobCity].filter(Boolean).join(' · ')
  const rightSkills = isIndividual ? match.candidateTopSkills : match.jobTopSkills

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">匹配详情</h1>
          <p className="text-sm text-muted-foreground">
            {isIndividual ? '您与该职位的技能匹配分析' : '该候选人与职位要求的匹配分析'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
          返回工作台
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-medium">综合匹配度</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`text-3xl font-bold tabular-nums ${scoreColor(match.overallScore)}`}>
                {Math.round(match.overallScore)}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-lg font-semibold tabular-nums">{Math.round(match.skillMatchScore)}%</p>
              <p className="text-[10px] text-muted-foreground">技能匹配</p>
            </div>
            {match.cityMatchBonus > 0 && (
              <div>
                <p className="text-lg font-semibold text-green-600 tabular-nums">+{Math.round(match.cityMatchBonus)}%</p>
                <p className="text-[10px] text-muted-foreground">同城加分</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <Badge variant="outline" className="mb-1 text-[10px]">
              {isIndividual ? '目标职位' : '候选人'}
            </Badge>
            <CardTitle className="text-base">{leftName}</CardTitle>
            {leftSub && <p className="text-xs text-muted-foreground">{leftSub}</p>}
          </CardHeader>
          <CardContent>
            {leftSkills && leftSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {leftSkills.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无技能数据</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <Badge variant="outline" className="mb-1 text-[10px]">
              {isIndividual ? '我的简历' : '职位要求'}
            </Badge>
            <CardTitle className="text-base">{rightName}</CardTitle>
            {rightSub && <p className="text-xs text-muted-foreground">{rightSub}</p>}
          </CardHeader>
          <CardContent>
            {rightSkills && rightSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {rightSkills.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无技能数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {match.matchDetails && match.matchDetails.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">技能匹配明细</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {match.matchDetails.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium">{d.skillName}</span>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{proficiencyLabel[d.personProficiency] || d.personProficiency}</span>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
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
