import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { jobApi } from '@/services/api'
import type { Job } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Briefcase, Building2, Edit, MapPin, Plus, Power, Search, Trash2, WalletCards } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', published: '招聘中', closed: '已关闭', archived: '已归档',
}

function statusBadge(status: string) {
  if (status === 'published') return <Badge>招聘中</Badge>
  if (status === 'closed') return <Badge variant="outline">已关闭</Badge>
  return <Badge variant="secondary">{STATUS_LABEL[status] || status}</Badge>
}

function salaryText(job: Job): string {
  if (job.salaryMin == null && job.salaryMax == null) return '薪资面议'
  const unit = job.salaryUnit === 'year' ? '元/年' : job.salaryUnit === 'hour' ? '元/小时' : '元/月'
  if (job.salaryMin != null && job.salaryMax != null) return `${job.salaryMin}-${job.salaryMax} ${unit}`
  if (job.salaryMin != null) return `${job.salaryMin} ${unit} 起`
  return `最高 ${job.salaryMax} ${unit}`
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: '全职', part_time: '兼职', internship: '实习', contract: '合同制',
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [isEnterprise, keyword, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 搜索条件变化时拉取数据
    load()
  }, [load])

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleStatus = async (job: Job, status: string) => {
    try {
      await jobApi.updateStatus(job.id, status)
      toast.success(status === 'published' ? '岗位已发布' : status === 'closed' ? '岗位已关闭' : '操作成功')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleDelete = async (job: Job) => {
    if (!confirm(`确认删除岗位「${job.title}」？删除后不可恢复。`)) return
    try {
      await jobApi.remove(job.id)
      toast.success('已删除')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isEnterprise ? '岗位管理' : '岗位广场'}
        description={isEnterprise ? '发布和管理招聘岗位' : '浏览在招岗位，找到与你能力匹配的机会'}
        icon={Briefcase}
        actions={
          isEnterprise ? (
            <Button onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus className="size-4" />
              发布岗位
            </Button>
          ) : undefined
        }
      />

      {!isEnterprise && (
        <form
          className="mb-5 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); load() }}
        >
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
              placeholder="搜索岗位名称、公司或城市..."
              className="h-10 pl-9"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10">
            搜索
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Briefcase className="size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">{isEnterprise ? '暂无岗位' : '暂无在招岗位'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isEnterprise ? '点击右上角「发布岗位」创建第一个职位' : '换个关键词试试，或稍后再来看看'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className={!isEnterprise ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md' : 'transition-all hover:shadow-sm'}
              onClick={() => !isEnterprise && navigate(`/jobs/${job.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 sm:flex">
                    <Briefcase className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold tracking-tight">{job.title}</h3>
                      {statusBadge(job.status)}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {job.companyName && (
                        <span className="flex items-center gap-1"><Building2 className="size-3.5" />{job.companyName}</span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>
                      )}
                      <span className="font-medium text-foreground/80">{salaryText(job)}</span>
                      <span>{EMPLOYMENT_LABEL[job.employmentType] || job.employmentType}</span>
                      {job.experienceRequired && <span>{job.experienceRequired}</span>}
                      {job.educationRequired && <span>{job.educationRequired}</span>}
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{job.description}</p>
                  </div>

                  {isEnterprise && (
                    <div className="flex shrink-0 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => { setEditing(job); setShowForm(true) }}>
                        <Edit className="size-3.5" />
                        编辑
                      </Button>
                      {job.status === 'draft' && (
                        <Button size="sm" onClick={() => handleStatus(job, 'published')}>
                          <Power className="size-3.5" />
                          发布
                        </Button>
                      )}
                      {job.status === 'published' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatus(job, 'closed')}>
                          关闭
                        </Button>
                      )}
                      {job.status === 'closed' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatus(job, 'published')}>
                          <Power className="size-3.5" />
                          重新发布
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(job)}>
                        <Trash2 className="size-3.5" />
                        删除
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
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            第 {page} / {Math.max(1, Math.ceil(total / 10))} 页
          </span>
          <Button variant="outline" size="sm" disabled={page * 10 >= total} onClick={() => setPage((p) => p + 1)}>下一页</Button>
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时用编辑对象重置表单
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

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job ? '编辑岗位' : '发布岗位'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="job-title">岗位名称 *</Label>
              <Input id="job-title" value={form.title as string} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-company">公司名称</Label>
              <Input id="job-company" value={form.companyName as string} onChange={(e) => set('companyName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-department">部门</Label>
              <Input id="job-department" value={form.department as string} onChange={(e) => set('department', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-location">工作城市</Label>
              <Input id="job-location" value={form.location as string} onChange={(e) => set('location', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="job-salary-min">薪资下限</Label>
              <Input id="job-salary-min" type="number" value={form.salaryMin as number | string} onChange={(e) => set('salaryMin', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-salary-max">薪资上限</Label>
              <Input id="job-salary-max" type="number" value={form.salaryMax as number | string} onChange={(e) => set('salaryMax', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1.5">
              <Label>薪资单位</Label>
              <Select value={form.salaryUnit as string} onValueChange={(v) => set('salaryUnit', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">元/月</SelectItem>
                  <SelectItem value="year">元/年</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="job-exp">经验要求</Label>
              <Input id="job-exp" placeholder="如 3-5年" value={form.experienceRequired as string} onChange={(e) => set('experienceRequired', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-edu">学历要求</Label>
              <Input id="job-edu" placeholder="如 本科" value={form.educationRequired as string} onChange={(e) => set('educationRequired', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-count">招聘人数</Label>
              <Input id="job-count" type="number" min={1} value={form.headcount as number} onChange={(e) => set('headcount', Number(e.target.value) || 1)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>用工类型</Label>
            <Select value={form.employmentType as string} onValueChange={(v) => set('employmentType', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">全职</SelectItem>
                <SelectItem value="part_time">兼职</SelectItem>
                <SelectItem value="internship">实习</SelectItem>
                <SelectItem value="contract">合同制</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="job-description">岗位描述 *</Label>
            <Textarea id="job-description" rows={5} value={form.description as string} onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => {
            if (!form.title) { toast.error('请输入岗位名称'); return }
            if (!form.description) { toast.error('请输入岗位描述'); return }
            onSave(form)
          }}>
            <WalletCards className="size-4" />
            保存岗位
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
