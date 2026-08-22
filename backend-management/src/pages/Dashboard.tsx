/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 仪表盘 - 统计卡片 + 趋势柱状图 + 快捷操作入口
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '@/services/api'
import type { AdminStats, TrendData } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Users, FileText, GitCompare, Terminal, TrendingUp } from 'lucide-react'

export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [trend, setTrend] = useState<TrendData[]>([])
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    Promise.all([adminApi.getStats(), adminApi.getStatsTrend(days)])
      .then(([s, t]) => { setStats(s.data); setTrend(t.data) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!stats) return null

  const maxT = Math.max(...trend.map(t => Math.max(t.newUsers, t.newDocuments, t.llmCalls)), 1)
  const cards = [
    { label: '用户总数', icon: Users, value: stats.totalUsers, extra: stats.usersByRole.map(r => `${r.role}: ${r.count}`).join('  ') },
    { label: '文档总数', icon: FileText, value: stats.totalDocuments, extra: stats.documentsByType.map(d => `${d.docType}: ${d.count}`).join('  ') },
    { label: '匹配次数', icon: GitCompare, value: stats.totalMatches, extra: '' },
    { label: 'LLM 调用', icon: Terminal, value: stats.totalLlmCalls, extra: '' },
  ]

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">仪表盘</h1><p className="text-muted-foreground">平台数据概览</p></div>
      <div className="grid grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle><c.icon className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">{c.value}</div>{c.extra && <div className="mt-1 flex gap-2 text-xs text-muted-foreground">{c.extra}</div>}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5" />趋势数据</CardTitle>
          <div className="flex gap-1">{[7, 14, 30].map(d => <Button key={d} variant={days === d ? 'default' : 'outline'} size="sm" onClick={() => setDays(d)}>{d}天</Button>)}</div>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无趋势数据</p> : (
            <div className="space-y-1">
              <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-primary" />新用户</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-500" />新文档</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-500" />LLM调用</span>
              </div>
              <div className="flex items-end gap-1" style={{ height: 160 }}>
                {trend.map(t => (
                  <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: 130 }}>
                      <div className="w-full rounded-t bg-amber-500" style={{ height: `${(t.llmCalls / maxT) * 130}px` }} />
                      <div className="w-full bg-emerald-500" style={{ height: `${(t.newDocuments / maxT) * 130}px` }} />
                      <div className="w-full rounded-t bg-primary" style={{ height: `${(t.newUsers / maxT) * 130}px` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate('/users')}>管理用户</Button>
        <Button variant="outline" onClick={() => navigate('/documents')}>管理文档</Button>
        <Button variant="outline" onClick={() => navigate('/llm-logs')}>查看 LLM 日志</Button>
      </div>
    </div>
  )
}
