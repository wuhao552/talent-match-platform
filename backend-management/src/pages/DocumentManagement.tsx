/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 文档管理 - 搜索/筛选/分页/详情弹窗/重解析/删除
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'; import type { AdminDocument, PaginatedResponse } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'; import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'; import { Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

const TM: Record<string, string> = { resume: '简历', job_description: '职位描述' }
const sV: Record<string, 'secondary' | 'default' | 'outline' | 'destructive'> = { uploaded: 'secondary', parsing: 'default', parsed: 'outline', failed: 'destructive' }
const sM: Record<string, string> = { uploaded: '已上传', parsing: '解析中', parsed: '已解析', failed: '失败' }

export function DocumentManagement() {
  const [data, setData] = useState<PaginatedResponse<AdminDocument> | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [page, setPage] = useState(1); const [docType, setDocType] = useState(''); const [status, setStatus] = useState(''); const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AdminDocument | null>(null)

  const fetch = useCallback(() => { setLoading(true); setError('')
    adminApi.getDocuments({ page, pageSize: 20, docType, status, search }).then(r => setData(r.data)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [page, docType, status, search])
  useEffect(() => { fetch() }, [fetch])

  const handleFilter = () => { setPage(1); fetch() }
  const handleReparse = async (d: AdminDocument) => { if (!confirm(`确定重解析 "${d.originalFilename}" 吗？`)) return; try { await adminApi.reparseDocument(d.id); toast.success('已触发'); fetch() } catch (e) { toast.error(e instanceof Error ? e.message : '操作失败') } }
  const handleDelete = async (d: AdminDocument) => { if (!confirm(`确定删除 "${d.originalFilename}" 吗？`)) return; try { await adminApi.deleteDocument(d.id); toast.success('已删除'); fetch() } catch (e) { toast.error(e instanceof Error ? e.message : '删除失败') } }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">文档管理</h1><p className="text-muted-foreground">管理所有上传的文档</p></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="flex-1 space-y-1" style={{ minWidth: 200 }}><Label className="text-xs">搜索文件名</Label><Input placeholder="文件名模糊搜索" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilter()} /></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">类型</Label><Select value={docType} onValueChange={v => setDocType(v === 'all' ? '' : (v || ''))}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="resume">简历</SelectItem><SelectItem value="job_description">职位描述</SelectItem></SelectContent></Select></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">状态</Label><Select value={status} onValueChange={v => setStatus(v === 'all' ? '' : (v || ''))}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="uploaded">已上传</SelectItem><SelectItem value="parsing">解析中</SelectItem><SelectItem value="parsed">已解析</SelectItem><SelectItem value="failed">失败</SelectItem></SelectContent></Select></div>
        <Button variant="outline" onClick={handleFilter}><Search className="mr-1 h-4 w-4" />搜索</Button>
      </CardContent></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="text-lg">文档列表</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无文档数据</p> : (
          <><Table><TableHeader><TableRow><TableHead>文件名</TableHead><TableHead>类型</TableHead><TableHead>所属用户</TableHead><TableHead>状态</TableHead><TableHead>上传时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
            <TableBody>{data.items.map(d => (<TableRow key={d.id}>
              <TableCell className="max-w-[200px] truncate font-medium" title={d.originalFilename}>{d.originalFilename}</TableCell>
              <TableCell><Badge variant="secondary">{TM[d.docType] || d.docType}</Badge></TableCell>
              <TableCell className="text-sm">{d.user?.username || '--'}</TableCell>
              <TableCell><Badge variant={sV[d.status] || 'secondary'}>{sM[d.status] || d.status}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleDateString('zh-CN')}</TableCell>
              <TableCell><div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setDetail(d)}>详情</Button>
                {d.status === 'failed' && <Button variant="ghost" size="sm" onClick={() => handleReparse(d)}><RefreshCw className="mr-1 h-3 w-3" />重解析</Button>}
                <Button variant="destructive" size="sm" onClick={() => handleDelete(d)}>删除</Button>
              </div></TableCell>
            </TableRow>))}</TableBody></Table>
            <div className="flex items-center justify-between pt-4"><span className="text-sm text-muted-foreground">共 {data.total} 条，{data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
              <div className="flex gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div></div></>
        )}
      </CardContent></Card>
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>文档详情</DialogTitle><DialogDescription>{detail?.originalFilename}</DialogDescription></DialogHeader>
        {detail && <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2"><div>类型：{TM[detail.docType]}</div><div>格式：{detail.fileFormat}</div><div>状态：{sM[detail.status]}</div><div>所属用户：{detail.user?.username || '--'}</div><div>上传时间：{new Date(detail.createdAt).toLocaleString('zh-CN')}</div>{detail.errorMessage && <div className="col-span-2 text-destructive">错误：{detail.errorMessage}</div>}</div>
          {detail.parsedText && <div><Label className="mb-1 block text-xs">解析文本</Label><pre className="max-h-[200px] overflow-y-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{detail.parsedText.slice(0, 2000)}{detail.parsedText.length > 2000 && '...'}</pre></div>}
          {detail.parsedJson && <div><Label className="mb-1 block text-xs">解析 JSON</Label><pre className="max-h-[200px] overflow-y-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(detail.parsedJson, null, 2).slice(0, 2000)}</pre></div>}
        </div>}
      </DialogContent></Dialog>
    </div>
  )
}
