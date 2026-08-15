/**
 * @description 投递记录 - 平台所有投递记录列表/筛选/详情/状态历史
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'
import type { AdminApplication, PaginatedResponse } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  submitted: '已投递', viewed: '已查看', screening: '筛选中', interview: '面试中',
  offer: '已发offer', hired: '已录用', rejected: '已拒绝', withdrawn: '已撤回',
}
const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  submitted: 'secondary', viewed: 'outline', screening: 'default', interview: 'default',
  offer: 'default', hired: 'default', rejected: 'destructive', withdrawn: 'outline',
}

export function ApplicationRecords() {
  const [data, setData] = useState<PaginatedResponse<AdminApplication> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [jobId, setJobId] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AdminApplication | null>(null)

  const fetch = useCallback(() => {
    setLoading(true); setError('')
    const params: Record<string, string | number> = { page, pageSize: 20, search }
    if (status) params.status = status
    if (jobId) params.jobId = jobId
    adminApi.getApplications(params)
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, status, jobId, search])
  useEffect(() => { fetch() }, [fetch])

  const handleFilter = () => { setPage(1); fetch() }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">投递记录</h1>
        <p className="text-muted-foreground">查看平台所有岗位投递记录</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 space-y-1" style={{ minWidth: 200 }}>
            <Label className="text-xs">搜索(岗位/求职者)</Label>
            <Input placeholder="岗位名称或用户名" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilter()} />
          </div>
          <div className="space-y-1" style={{ width: 140 }}>
            <Label className="text-xs">状态</Label>
            <Select value={status || 'all'} onValueChange={v => setStatus(!v || v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1" style={{ width: 200 }}>
            <Label className="text-xs">岗位 ID (可选)</Label>
            <Input placeholder="精确匹配 jobId" value={jobId} onChange={e => setJobId(e.target.value)} />
          </div>
          <Button variant="outline" onClick={handleFilter}><Search className="mr-1 h-4 w-4" />搜索</Button>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle className="text-lg">投递列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">暂无投递记录</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>岗位</TableHead>
                    <TableHead>求职者</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>求职信</TableHead>
                    <TableHead>投递时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div className="truncate" style={{ maxWidth: 200 }}>{a.job?.title || '岗位已删除'}</div>
                        {a.job?.companyName && <div className="text-xs text-muted-foreground">{a.job.companyName}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{a.applicant?.username || '--'}</div>
                        {a.applicant?.city && <div className="text-xs text-muted-foreground">{a.applicant.city}</div>}
                      </TableCell>
                      <TableCell><Badge variant={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status] || a.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.coverLetter ? <span className="truncate inline-block align-bottom" style={{ maxWidth: 160 }}>{a.coverLetter}</span> : '--'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(a.createdAt).toLocaleString('zh-CN')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setDetail(a)}>详情</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-4">
                <span className="text-sm text-muted-foreground">共 {data.total} 条，{data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button>
                  <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>投递详情</DialogTitle>
            <DialogDescription>{detail?.job?.title || '岗位已删除'}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>岗位：{detail.job?.title || '--'}</div>
                <div>企业：{detail.job?.companyName || detail.job?.enterprise?.username || '--'}</div>
                <div>求职者：{detail.applicant?.username || '--'}</div>
                <div>城市：{detail.applicant?.city || '--'}</div>
                <div>简历 ID：{detail.resumeDocId}</div>
                <div>匹配记录：{detail.matchResultId || '未生成'}</div>
                <div>状态：<Badge variant={STATUS_BADGE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge></div>
                <div>投递时间：{new Date(detail.createdAt).toLocaleString('zh-CN')}</div>
              </div>
              {detail.coverLetter && (
                <div>
                  <h4 className="mb-1 font-medium">求职信</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detail.coverLetter}</p>
                </div>
              )}
              {detail.enterpriseNote && (
                <div>
                  <h4 className="mb-1 font-medium">企业备注</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detail.enterpriseNote}</p>
                </div>
              )}
              {detail.statusHistory && detail.statusHistory.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">状态流转历史</h4>
                  <div className="space-y-1.5">
                    {detail.statusHistory.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 border-l-2 pl-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                        <Badge variant={STATUS_BADGE[h.status] || 'outline'}>{STATUS_LABEL[h.status] || h.status}</Badge>
                        <span className="text-muted-foreground">{new Date(h.at).toLocaleString('zh-CN')}</span>
                        {h.note && <span className="text-muted-foreground">· {h.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
