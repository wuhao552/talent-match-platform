import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { jobApi } from '@/services/api'
import type { Job } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Briefcase, Plus, Search, MapPin, Building2, Edit, Trash2, Power } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', published: '招聘中', closed: '已关闭', archived: '已归档',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'secondary', published: 'default', closed: 'outline', archived: 'outline',
}

export function Jobs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isEnterprise = user?.role === 'enterprise'

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // 企业端:新建/编辑弹窗
  const [editing, setEditing] = useState<Job | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isEnterprise) {
        const res = await jobApi.mine()
        setJobs(res.data)
        setTotal(res.data.length)
      } else {
        const res = await jobApi.list({ keyword, page, size: 10 })
        setJobs(res.data.items)
        setTotal(res.data.total)
      }
    } catch (e: any) {
      toast.error(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [isEnterprise, keyword, page])

  useEffect(() => { load() }, [load])

  const handleSave = async (data: Record<string, unknown>) => {
    try {
      if (editing) {
        await jobApi.update(editing.id, data)
        toast.success('岗位已更新')
      } else {
        await jobApi.create(data)
        toast.success('岗位已创建')
      }
      setShowForm(false)
      setEditing(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    }
  }

  const handleStatus = async (job: Job, status: string) => {
    try {
      await jobApi.updateStatus(job.id, status)
      toast.success(`已${status === 'published' ? '发布' : status === 'closed' ? '关闭' : '操作'}`)
      load()
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    }
  }

  const handleDelete = async (job: Job) => {
    if (!confirm(`确认删除岗位「${job.title}」?`)) return
    try {
      await jobApi.remove(job.id)
      toast.success('已删除')
      load()
    } catch (e: any) {
      toast.error(e?.message || '删除失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6" />
            {isEnterprise ? '岗位管理' : '岗位广场'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isEnterprise ? '发布和管理招聘岗位' : '浏览所有在招岗位'}
          </p>
        </div>
        {isEnterprise && (
          <Button onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-1" /> 发布岗位
          </Button>
        )}
      </div>

      {!isEnterprise && (
        <div className="flex gap-2">
          <Input
            placeholder="搜索岗位名称、公司..."
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="max-w-sm"
          />
          <Button variant="outline" onClick={() => load()}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground py-12 text-center">加载中...</p>
      ) : jobs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {isEnterprise ? '暂无岗位,点击「发布岗位」创建' : '暂无在招岗位'}
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id} className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => !isEnterprise && navigate(`/jobs/${job.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg truncate">{job.title}</h3>
                      <Badge variant={STATUS_COLOR[job.status] as any}>{STATUS_LABEL[job.status]}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {job.companyName && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{job.companyName}</span>}
                      {job.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
                      {job.salaryMin != null && (
                        <span>{job.salaryMax != null ? `${job.salaryMin}-${job.salaryMax}` : job.salaryMin} {job.salaryUnit === 'month' ? '元/月' : job.salaryUnit === 'year' ? '元/年' : ''}</span>
                      )}
                      {job.experienceRequired && <span>{job.experienceRequired}</span>}
                      {job.educationRequired && <span>{job.educationRequired}</span>}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{job.description}</p>
                  </div>
                  {isEnterprise && (
                    <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(job); setShowForm(true) }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {job.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatus(job, 'published')}>
                          <Power className="h-3.5 w-3.5" />发布
                        </Button>
                      )}
                      {job.status === 'published' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatus(job, 'closed')}>
                          关闭
                        </Button>
                      )}
                      {job.status === 'closed' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatus(job, 'published')}>
                          <Power className="h-3.5 w-3.5" />重新发布
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(job)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isEnterprise && total > 10 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="py-2 text-sm">第 {page} 页</span>
          <Button variant="outline" disabled={jobs.length < 10} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      <JobFormDialog
        open={showForm}
        job={editing}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSave={handleSave}
      />
    </div>
  )
}

function JobFormDialog({ open, job, onClose, onSave }: {
  open: boolean
  job: Job | null
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const { user } = useAuth()

  useEffect(() => {
    if (open) {
      setForm({
        title: job?.title || '',
        companyName: job?.companyName || user?.companyName || '',
        department: job?.department || '',
        description: job?.description || '',
        location: job?.location || '',
        salaryMin: job?.salaryMin ?? '',
        salaryMax: job?.salaryMax ?? '',
        salaryUnit: job?.salaryUnit || 'month',
        experienceRequired: job?.experienceRequired || '',
        educationRequired: job?.educationRequired || '',
        employmentType: job?.employmentType || 'full_time',
        headcount: job?.headcount || 1,
      })
    }
  }, [open, job, user])

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job ? '编辑岗位' : '发布岗位'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>岗位名称 *</Label>
              <Input value={form.title as string} onChange={e => set('title', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>公司名称</Label>
              <Input value={form.companyName as string} onChange={e => set('companyName', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>部门</Label>
              <Input value={form.department as string} onChange={e => set('department', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>工作城市</Label>
              <Input value={form.location as string} onChange={e => set('location', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>薪资下限</Label>
              <Input type="number" value={form.salaryMin as any} onChange={e => set('salaryMin', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <Label>薪资上限</Label>
              <Input type="number" value={form.salaryMax as any} onChange={e => set('salaryMax', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <Label>薪资单位</Label>
              <Select value={form.salaryUnit as string} onValueChange={v => set('salaryUnit', v)} items={{ month: '元/月', year: '元/年' }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">元/月</SelectItem>
                  <SelectItem value="year">元/年</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>经验要求</Label>
              <Input placeholder="如 3-5年" value={form.experienceRequired as string} onChange={e => set('experienceRequired', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>学历要求</Label>
              <Input placeholder="如 本科" value={form.educationRequired as string} onChange={e => set('educationRequired', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>招聘人数</Label>
              <Input type="number" value={form.headcount as any} onChange={e => set('headcount', Number(e.target.value) || 1)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>用工类型</Label>
            <Select
              value={form.employmentType as string}
              onValueChange={v => set('employmentType', v)}
              items={{ full_time: '全职', part_time: '兼职', internship: '实习', contract: '合同制' }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">全职</SelectItem>
                <SelectItem value="part_time">兼职</SelectItem>
                <SelectItem value="internship">实习</SelectItem>
                <SelectItem value="contract">合同制</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>岗位描述 *</Label>
            <Textarea rows={5} value={form.description as string} onChange={e => set('description', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => {
            if (!form.title) { toast.error('请输入岗位名称'); return }
            if (!form.description) { toast.error('请输入岗位描述'); return }
            onSave(form)
          }}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
