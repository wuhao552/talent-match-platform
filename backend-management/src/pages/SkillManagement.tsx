/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 技能管理 - 搜索/筛选/分页/分类统计/结构断裂/低频标记
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'; import type { AdminSkill, PaginatedResponse, SkillStats } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'; import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

export function SkillManagement() {
  const [data, setData] = useState<PaginatedResponse<AdminSkill> | null>(null); const [stats, setStats] = useState<SkillStats[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [category, setCategory] = useState('')
  const [hasBreak, setHasBreak] = useState<boolean | undefined>(); const [isLow, setIsLow] = useState<boolean | undefined>()

  const fetch = useCallback(() => { setLoading(true); setError('')
    const p: Record<string, string | number | boolean> = { page, pageSize: 20, search }
    if (category) p.category = category; if (hasBreak !== undefined) p.hasStructuralBreak = hasBreak; if (isLow !== undefined) p.isLowFrequency = isLow
    adminApi.getSkills(p).then(r => setData(r.data)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [page, search, category, hasBreak, isLow])
  useEffect(() => { fetch() }, [fetch])
  useEffect(() => { adminApi.getSkillsStats().then(r => setStats(r.data)).catch(() => {}) }, [])

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">技能管理</h1><p className="text-muted-foreground">管理技能库和分类统计</p></div>
      <div className="grid grid-cols-2 gap-4"><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">技能总数</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.total || 0}</div></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">分类数量</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.length}</div></CardContent></Card></div>
      {stats.length > 0 && <Card><CardHeader><CardTitle className="text-lg">分类统计</CardTitle></CardHeader><CardContent><div className="flex flex-wrap gap-2">{stats.map(s => <Badge key={s.category} variant="secondary" className="text-xs">{s.category}: {s.count}</Badge>)}</div></CardContent></Card>}
      <Card><CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="flex-1 space-y-1" style={{ minWidth: 200 }}><Label className="text-xs">搜索技能名</Label><Input placeholder="技能名称" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && (() => { setPage(1); fetch() })()} /></div>
        <div className="space-y-1" style={{ width: 160 }}><Label className="text-xs">分类</Label><Select value={category} onValueChange={v => setCategory(v === 'all' ? '' : (v || ''))}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{stats.map(s => <SelectItem key={s.category} value={s.category}>{s.category}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">结构断裂</Label><Select value={hasBreak === undefined ? 'all' : String(hasBreak)} onValueChange={v => setHasBreak(v === 'all' ? undefined : v === 'true')}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="true">是</SelectItem><SelectItem value="false">否</SelectItem></SelectContent></Select></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">低频技能</Label><Select value={isLow === undefined ? 'all' : String(isLow)} onValueChange={v => setIsLow(v === 'all' ? undefined : v === 'true')}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="true">是</SelectItem><SelectItem value="false">否</SelectItem></SelectContent></Select></div>
        <Button variant="outline" onClick={() => { setPage(1); fetch() }}><Search className="mr-1 h-4 w-4" />搜索</Button>
      </CardContent></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="text-lg">技能列表</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无技能数据</p> : (
          <><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>技能名称</TableHead><TableHead>分类</TableHead><TableHead>结构断裂</TableHead><TableHead>低频技能</TableHead><TableHead>创建时间</TableHead></TableRow></TableHeader>
            <TableBody>{data.items.map(s => (<TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{s.id}</TableCell><TableCell className="font-medium">{s.name || '--'}</TableCell>
              <TableCell><Badge variant="outline">{s.category || '未分类'}</Badge></TableCell>
              <TableCell>{s.hasStructuralBreak ? <Badge variant="destructive">是</Badge> : <span className="text-sm text-muted-foreground">否</span>}</TableCell>
              <TableCell>{s.isLowFrequency ? <Badge variant="secondary">是</Badge> : <span className="text-sm text-muted-foreground">否</span>}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{new Date(s.createdAt).toLocaleDateString('zh-CN')}</TableCell>
            </TableRow>))}</TableBody></Table>
            <div className="flex items-center justify-between pt-4"><span className="text-sm text-muted-foreground">共 {data.total} 条，{data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
              <div className="flex gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div></div></>
        )}
      </CardContent></Card>
    </div>
  )
}
