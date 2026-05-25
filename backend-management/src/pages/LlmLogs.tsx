/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description LLM 日志监控 - 统计卡片/筛选/分页/详情弹窗(可折叠prompt)
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'; import type { AdminLlmLog, PaginatedResponse, LlmStats } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Button } from '@/components/ui/button'; import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'; import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'; import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export function LlmLogs() {
  const [data, setData] = useState<PaginatedResponse<AdminLlmLog> | null>(null); const [stats, setStats] = useState<LlmStats | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [page, setPage] = useState(1); const [callType, setCallType] = useState(''); const [model, setModel] = useState(''); const [success, setSuccess] = useState<boolean | undefined>()
  const [detail, setDetail] = useState<AdminLlmLog | null>(null); const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const fetch = useCallback(() => { setLoading(true); setError('')
    const p: Record<string, string | number | boolean> = { page, pageSize: 20 }; if (callType) p.callType = callType; if (model) p.model = model; if (success !== undefined) p.success = success
    adminApi.getLlmLogs(p).then(r => setData(r.data)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [page, callType, model, success])
  useEffect(() => { fetch() }, [fetch])
  useEffect(() => { adminApi.getLlmStats().then(r => setStats(r.data)).catch(() => {}) }, [])

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">LLM 日志</h1><p className="text-muted-foreground">监控 LLM API 调用情况</p></div>
      {stats && <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">总调用次数</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalCalls}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">成功率</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${stats.successRate >= 95 ? 'text-emerald-600' : stats.successRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{stats.successRate}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">平均延迟</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.avgLatency}<span className="text-sm font-normal text-muted-foreground"> ms</span></div></CardContent></Card>
      </div>}
      {stats && <div className="grid grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">按模型</CardTitle></CardHeader><CardContent className="text-xs space-y-1">{stats.byModel?.map(m => <div key={m.model} className="flex justify-between"><span>{m.model || 'unknown'}</span><span className="text-muted-foreground">{m.count} 次, {m.avgLatency}ms</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">按调用类型</CardTitle></CardHeader><CardContent className="text-xs space-y-1">{stats.byCallType?.map(c => <div key={c.callType} className="flex justify-between"><span>{c.callType}</span><span className="text-muted-foreground">{c.count} 次</span></div>)}</CardContent></Card>
      </div>}
      <Card><CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="space-y-1" style={{ width: 160 }}><Label className="text-xs">调用类型</Label><Select value={callType} onValueChange={v => setCallType(v === 'all' ? '' : v)}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="extract_skills">提取技能</SelectItem><SelectItem value="parse_document">解析文档</SelectItem><SelectItem value="generate_explanation">生成说明</SelectItem></SelectContent></Select></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">模型</Label><Select value={model} onValueChange={v => setModel(v === 'all' ? '' : v)}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{stats?.byModel?.map(m => <SelectItem key={m.model} value={m.model}>{m.model}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">是否成功</Label><Select value={success === undefined ? 'all' : String(success)} onValueChange={v => setSuccess(v === 'all' ? undefined : v === 'true')}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="true">成功</SelectItem><SelectItem value="false">失败</SelectItem></SelectContent></Select></div>
        <Button variant="outline" onClick={() => { setPage(1); fetch() }}><Search className="mr-1 h-4 w-4" />搜索</Button>
      </CardContent></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="text-lg">日志列表</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无日志数据</p> : (
          <><Table><TableHeader><TableRow><TableHead>调用类型</TableHead><TableHead>模型</TableHead><TableHead>成功</TableHead><TableHead>降级</TableHead><TableHead>Token</TableHead><TableHead>延迟</TableHead><TableHead>时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
            <TableBody>{data.items.map(log => (<TableRow key={log.id}>
              <TableCell><Badge variant="secondary">{log.callType}</Badge></TableCell><TableCell className="text-sm font-mono">{log.model}</TableCell>
              <TableCell>{log.success ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
              <TableCell>{log.fallbackUsed && <AlertTriangle className="h-4 w-4 text-amber-500" />}</TableCell>
              <TableCell className="text-sm">{log.tokensUsed || '--'}</TableCell><TableCell className="text-sm">{log.latencyMs ? `${log.latencyMs}ms` : '--'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleString('zh-CN')}</TableCell>
              <TableCell><Button variant="ghost" size="sm" onClick={async () => { try { const r = await adminApi.getLlmLogDetail(log.id); setDetail(r.data); setExpanded({}) } catch (e) { toast.error('获取详情失败') } }}>详情</Button></TableCell>
            </TableRow>))}</TableBody></Table>
            <div className="flex items-center justify-between pt-4"><span className="text-sm text-muted-foreground">共 {data.total} 条，{data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
              <div className="flex gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div></div></>
        )}
      </CardContent></Card>
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}><DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>LLM 日志详情</DialogTitle><DialogDescription>{detail?.callType} | {detail?.model} | {detail?.success ? '成功' : '失败'}</DialogDescription></DialogHeader>
        {detail && <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground"><div>Token: {detail.tokensUsed || '--'}</div><div>延迟: {detail.latencyMs ? `${detail.latencyMs}ms` : '--'}</div><div>{new Date(detail.createdAt).toLocaleString('zh-CN')}</div>{detail.errorMessage && <div className="col-span-3 text-destructive">错误: {detail.errorMessage}</div>}</div>
          {(['systemPrompt', 'userMessage', 'rawResponse'] as const).map(k => { const c = detail[k]; if (!c) return null; const ex = expanded[k]; return (<div key={k}><button className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted" onClick={() => setExpanded(p => ({ ...p, [k]: !p[k] }))}>{k === 'systemPrompt' ? 'System Prompt' : k === 'userMessage' ? 'User Message' : 'Raw Response'} ({c.length} 字符){ex ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>{ex && <pre className="mt-1 max-h-[250px] overflow-y-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{c}</pre>}</div>) })}
          {detail.parsedResult && <div><Label className="mb-1 block text-xs">解析结果</Label><pre className="max-h-[200px] overflow-y-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(detail.parsedResult, null, 2)}</pre></div>}
        </div>}
      </DialogContent></Dialog>
    </div>
  )
}
