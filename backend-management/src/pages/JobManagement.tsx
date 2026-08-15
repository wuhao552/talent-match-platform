/**
 * @description 岗位管理 - 平台所有岗位列表/筛选/状态变更/详情/删除
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'
import type { AdminJob, PaginatedResponse, JobStatus } from '@/types'
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
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight, Building2, MapPin } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', published: '已发布', closed: '已关闭', archived: '已归档',
}
const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary', published: 'default', closed: 'outline', archived: 'outline',
}
const EMP_LABEL: Record<string, string> = {
  full_time: '全职', part_time: '兼职', internship: '实习', contract: '合同制',
}

export function JobManagement() {
  const [data, setData] = useState<PaginatedResponse<AdminJob> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AdminJob | null>(null)

  const fetch = useCallback(() => {
    setLoading(true); setError('')
    adminApi.getJobs({ page, pageSize: 20, status, search })
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, status, search])
  useEffect(() => { fetch() }, [fetch])

  const handleFilter = () => { setPage(1); fetch() }

  const handleStatus = async (job: AdminJob, newStatus: JobStatus) => {
    try {
      await adminApi.updateJobStatus(job.id, newStatus)
      toast.success(`状态已更新为「${STATUS_LABEL[newStatus]}」`)
      fetch()
      if (detail?.id === job.id) {
        setDetail({ ...job, status: newStatus })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleDelete = async (job: AdminJob) => {
    if (!confirm(`确认删除岗位「${job.title}」？此操作不可撤销。`)) return
    try {
      await adminApi.deleteJob(job.id)
      toast.success('已删除')
      fetch()
      if (detail?.id === job.id) setDetail(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">岗位管理</h1>
        <p className="text-muted-foreground">查看和管理平台所有招聘岗位</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 space-y-1" style={{ minWidth: 200 }}>
            <Label className="text-xs">搜索</Label>
            <Input placeholder="岗位名称或公司" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilter()} />
          </div>
          <div className="space-y-1" style={{ width: 160 }}>
            <Label className="text-xs">状态</Label>
            <Select value={status || 'all'} onValueChange={v => setStatus(!v || v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleFilter}><Search className="mr-1 h-4 w-4" />搜索</Button>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle className="text-lg">岗位列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">暂无岗位数据</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>岗位</TableHead>
                    <TableHead>企业</TableHead>
                    <TableHead>地点</TableHead>
                    <TableHead>用工类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>发布时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map(j => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">
                        <div className="truncate" style={{ maxWidth: 220 }}>{j.title}</div>
                        <div className="text-xs text-muted-foreground">招聘 {j.headcount} 人</div>
                      </TableCell>
                      <TableCell>
                        {j.enterprise?.companyName || j.companyName || j.enterprise?.username || '--'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{j.location || '--'}</TableCell>
                      <TableCell><Badge variant="outline">{EMP_LABEL[j.employmentType] || j.employmentType}</Badge></TableCell>
                      <TableCell><Badge variant={STATUS_BADGE[j.status]}>{STATUS_LABEL[j.status] || j.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(j.createdAt).toLocaleDateString('zh-CN')}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetail(j)}>详情</Button>
                          {j.status !== 'published' && <Button variant="ghost" size="sm" onClick={() => handleStatus(j, 'published')}>发布</Button>}
                          {j.status === 'published' && <Button variant="ghost" size="sm" onClick={() => handleStatus(j, 'closed')}>关闭</Button>}
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(j)}>删除</Button>
                        </div>
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
            <DialogTitle>岗位详情</DialogTitle>
            <DialogDescription>{detail?.title}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant={STATUS_BADGE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
                <Badge variant="outline">{EMP_LABEL[detail.employmentType] || detail.employmentType}</Badge>
                {detail.companyName && <Badge variant="secondary" className="gap-1"><Building2 className="h-3 w-3" />{detail.companyName}</Badge>}
                {detail.location && <Badge variant="secondary" className="gap-1"><MapPin className="h-3 w-3" />{detail.location}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>企业：{detail.enterprise?.companyName || detail.companyName || detail.enterprise?.username || '--'}</div>
                <div>部门：{detail.department || '--'}</div>
                <div>薪资：{detail.salaryMin != null ? `${detail.salaryMin}${detail.salaryMax != null ? `-${detail.salaryMax}` : ''} ${detail.salaryUnit === 'month' ? '元/月' : detail.salaryUnit === 'year' ? '元/年' : ''}` : '面议'}</div>
                <div>招聘人数：{detail.headcount}</div>
                <div>经验要求：{detail.experienceRequired || '不限'}</div>
                <div>学历要求：{detail.educationRequired || '不限'}</div>
                <div className="col-span-2">发布时间：{new Date(detail.createdAt).toLocaleString('zh-CN')}</div>
              </div>
              <div>
                <h4 className="mb-1 font-medium">岗位描述</h4>
                <p className="whitespace-pre-wrap text-muted-foreground">{detail.description}</p>
              </div>
              <div className="flex gap-2 pt-2">
                {detail.status !== 'published' && <Button size="sm" onClick={() => handleStatus(detail, 'published')}>发布</Button>}
                {detail.status === 'published' && <Button size="sm" variant="outline" onClick={() => handleStatus(detail, 'closed')}>关闭招聘</Button>}
                {detail.status !== 'archived' && <Button size="sm" variant="outline" onClick={() => handleStatus(detail, 'archived')}>归档</Button>}
                <Button size="sm" variant="destructive" onClick={() => handleDelete(detail)}>删除</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
