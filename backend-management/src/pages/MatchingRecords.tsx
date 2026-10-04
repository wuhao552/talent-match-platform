/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 匹配记录 - 分数筛选/分页/分数颜色标记/匹配详情弹窗
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'; import type { AdminMatchResult, PaginatedResponse } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'; import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'; import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

function sC(s: number) { if (s >= 80) return 'text-emerald-600 bg-emerald-50'; if (s >= 60) return 'text-amber-600 bg-amber-50'; return 'text-red-600 bg-red-50' }
// 空值保护:fallback 记录分数可能为 null,避免渲染出 NaN
function fmt(v: number | null | undefined) { return v === null || v === undefined ? '--' : Number(v).toFixed(1) }

export function MatchingRecords() {
  const [data, setData] = useState<PaginatedResponse<AdminMatchResult> | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [page, setPage] = useState(1); const [minScore, setMinScore] = useState(''); const [maxScore, setMaxScore] = useState('')
  const [detail, setDetail] = useState<AdminMatchResult | null>(null)

  const fetch = useCallback(() => { setLoading(true); setError('')
    const p: Record<string, string | number> = { page, pageSize: 20 }; if (minScore) p.minScore = Number(minScore); if (maxScore) p.maxScore = Number(maxScore)
    adminApi.getMatchResults(p).then(r => setData(r.data)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [page, minScore, maxScore])
  useEffect(() => { fetch() }, [fetch])

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">匹配记录</h1><p className="text-muted-foreground">查看简历与职位的匹配结果</p></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="space-y-1" style={{ width: 120 }}><Label className="text-xs">最低分</Label><Input placeholder="0" value={minScore} onChange={e => setMinScore(e.target.value)} /></div>
        <div className="space-y-1" style={{ width: 120 }}><Label className="text-xs">最高分</Label><Input placeholder="100" value={maxScore} onChange={e => setMaxScore(e.target.value)} /></div>
        <Button variant="outline" onClick={() => { setPage(1); fetch() }}><Search className="mr-1 h-4 w-4" />搜索</Button>
      </CardContent></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="text-lg">匹配列表</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无匹配记录</p> : (
          <><Table><TableHeader><TableRow><TableHead>简历文件</TableHead><TableHead>职位文件</TableHead><TableHead>总分</TableHead><TableHead>技能分</TableHead><TableHead>城市加分</TableHead><TableHead>时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
            <TableBody>{data.items.map(m => (<TableRow key={m.id}>
              <TableCell className="max-w-[150px] truncate font-medium" title={m.resumeDoc?.originalFilename}>{m.resumeDoc?.originalFilename || '--'}</TableCell>
              <TableCell className="max-w-[150px] truncate" title={m.jobDoc?.originalFilename}>{m.jobDoc?.originalFilename || '--'}</TableCell>
              <TableCell><Badge className={`font-bold ${sC(Number(m.overallScore ?? 0))}`}>{fmt(m.overallScore)}</Badge></TableCell>
              <TableCell className="text-sm">{fmt(m.skillMatchScore)}</TableCell>
              <TableCell className="text-sm">{fmt(m.cityMatchBonus)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{new Date(m.createdAt).toLocaleDateString('zh-CN')}</TableCell>
              <TableCell><Button variant="ghost" size="sm" onClick={async () => { try { const r = await adminApi.getMatchResultDetail(m.id); setDetail(r.data) } catch (e) { toast.error('获取详情失败') } }}>详情</Button></TableCell>
            </TableRow>))}</TableBody></Table>
            <div className="flex items-center justify-between pt-4"><span className="text-sm text-muted-foreground">共 {data.total} 条，{data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
              <div className="flex gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div></div></>
        )}
      </CardContent></Card>
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>匹配详情</DialogTitle><DialogDescription>总分: {detail ? fmt(detail.overallScore) : '--'} | 技能: {detail ? fmt(detail.skillMatchScore) : '--'} | 城市: {detail ? fmt(detail.cityMatchBonus) : '--'}</DialogDescription></DialogHeader>
        {detail && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4"><div className="rounded-lg border p-3"><Label className="mb-1 block text-xs">简历</Label><p className="font-medium">{detail.resumeDoc?.originalFilename || '--'}</p></div><div className="rounded-lg border p-3"><Label className="mb-1 block text-xs">职位</Label><p className="font-medium">{detail.jobDoc?.originalFilename || '--'}</p></div></div>
          {detail.matchDetails?.length > 0 && <div><Label className="mb-2 block text-xs">技能匹配明细</Label><Table><TableHeader><TableRow><TableHead>技能</TableHead><TableHead>个人水平</TableHead><TableHead>岗位要求</TableHead><TableHead>得分</TableHead></TableRow></TableHeader><TableBody>{detail.matchDetails.map((d, i) => (<TableRow key={i}><TableCell className="font-medium">{d.skillName}</TableCell><TableCell>{d.personProficiency}</TableCell><TableCell>{d.jobRequirement}</TableCell><TableCell><span className={sC(d.score).split(' ')[0]}>{d.score}</span></TableCell></TableRow>))}</TableBody></Table></div>}
        </div>}
      </DialogContent></Dialog>
    </div>
  )
}
