import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { applicationApi, messageApi } from '@/services/api'
import type { Application, ApplicationStatus } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { BriefcaseBusiness, Building2, Clock, FileText, MessageSquare, RotateCcw, User, X } from 'lucide-react'

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: '已投递', viewed: '已查看', screening: '筛选中', interview: '面试中',
  offer: '已发 offer', hired: '已录用', rejected: '已拒绝', withdrawn: '已撤回',
}

function statusVariant(status: ApplicationStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'rejected') return 'destructive'
  if (status === 'submitted') return 'secondary'
  if (status === 'withdrawn') return 'outline'
  return 'default'
}

const ENTERPRISE_ACTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'viewed', label: '标记已查看' },
  { value: 'screening', label: '进入筛选' },
  { value: 'interview', label: '邀请面试' },
  { value: 'offer', label: '发放 offer' },
  { value: 'hired', label: '录用' },
  { value: 'rejected', label: '拒绝' },
]

export function Applications() {
  const { user } = useAuth()
  const isEnterprise = user?.role === 'enterprise'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filterJobId = searchParams.get('jobId')

  const [items, setItems] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionTarget, setActionTarget] = useState<Application | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: { page: number; size: number; status?: string; jobId?: string } = { page, size: 10 }
      if (status) params.status = status
      if (isEnterprise && filterJobId) params.jobId = filterJobId
      const res = isEnterprise
        ? await applicationApi.listForEnterprise(params)
        : await applicationApi.myList(params)
      setItems(res.data.items)
      setTotal(res.data.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [isEnterprise, filterJobId, page, status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 筛选条件变化时拉取数据
    load()
  }, [load])

  const handleWithdraw = async () => {
    if (!withdrawTarget) return
    try {
      await applicationApi.withdraw(withdrawTarget.id)
      toast.success('已撤回该投递')
      setWithdrawTarget(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleStatusUpdate = async (app: Application, newStatus: string, note?: string) => {
    try {
      await applicationApi.updateStatus(app.id, { status: newStatus, note })
      toast.success('状态已更新')
      setActionTarget(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isEnterprise ? '投递管理' : '投递记录'}
        description={isEnterprise ? '管理收到的岗位投递，推进招聘流程' : '查看你的岗位投递与最新进度'}
        icon={FileText}
        actions={
          <Select value={status || 'all'} onValueChange={(v) => { setStatus(!v || v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(STATUS_LABEL) as ApplicationStatus[]).map((key) => (
                <SelectItem key={key} value={key}>{STATUS_LABEL[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {filterJobId && (
        <div className="-mt-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/applications')}>
            <X className="size-3.5" />
            清除岗位筛选
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <FileText className="size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">{isEnterprise ? '暂无收到投递' : '暂无投递记录'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isEnterprise ? '发布岗位后，候选人投递会展示在这里' : '去岗位广场看看，找到适合的机会再投递'}
            </p>
            {!isEnterprise && (
              <Button className="mt-4" onClick={() => navigate('/jobs')}>
                <BriefcaseBusiness className="size-4" />
                浏览岗位
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((app) => {
            const canWithdraw = !isEnterprise && ['submitted', 'viewed', 'screening'].includes(app.status)
            return (
              <Card key={app.id} className="transition-all hover:shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {app.job ? (
                          <Link to={`/jobs/${app.job.id}`} className="truncate text-sm font-bold hover:text-primary hover:underline sm:text-base">
                            {app.job.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground">岗位已删除</span>
                        )}
                        <Badge variant={statusVariant(app.status)}>{STATUS_LABEL[app.status]}</Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                        {isEnterprise && app.applicant && (
                          <span className="flex items-center gap-1"><User className="size-3.5" />{app.applicant.username}{app.applicant.city && ` · ${app.applicant.city}`}</span>
                        )}
                        {!isEnterprise && app.job?.companyName && (
                          <span className="flex items-center gap-1"><Building2 className="size-3.5" />{app.job.companyName}</span>
                        )}
                        <span className="flex items-center gap-1"><Clock className="size-3.5" />投递于 {new Date(app.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {app.coverLetter && (
                        <p className="line-clamp-1 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                          求职信：{app.coverLetter}
                        </p>
                      )}

                      {app.statusHistory && app.statusHistory.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer select-none hover:text-foreground">
                            状态历史（{app.statusHistory.length}）
                          </summary>
                          <div className="mt-1.5 space-y-1 border-l-2 border-border pl-3">
                            {[...app.statusHistory].reverse().map((h, i) => (
                              <div key={i}>
                                <span className="font-medium text-foreground/70">{STATUS_LABEL[h.status] || h.status}</span>
                                <span className="mx-1 opacity-50">·</span>
                                {new Date(h.at).toLocaleString('zh-CN')}
                                {h.note && <span className="ml-1 opacity-70">· {h.note}</span>}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {canWithdraw && (
                        <Button size="sm" variant="outline" onClick={() => setWithdrawTarget(app)}>
                          <RotateCcw className="size-3.5" />
                          撤回
                        </Button>
                      )}
                      {isEnterprise && (
                        <Button size="sm" variant="outline" onClick={() => setActionTarget(app)}>
                          更新状态
                        </Button>
                      )}
                      {isEnterprise && app.applicant && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="联系候选人"
                          onClick={async () => {
                            try {
                              const res = await messageApi.createConversation({ receiverId: app.applicant!.id, applicationId: app.id })
                              navigate(`/messages?conv=${res.data.id}`)
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : '创建会话失败')
                            }
                          }}
                        >
                          <MessageSquare className="size-3.5" />
                          联系
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {total > 10 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            第 {page} / {Math.max(1, Math.ceil(total / 10))} 页
          </span>
          <Button variant="outline" size="sm" disabled={page * 10 >= total} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      )}

      {withdrawTarget && (
        <Dialog open onOpenChange={() => setWithdrawTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认撤回投递？</DialogTitle>
              <DialogDescription>
                撤回「{withdrawTarget.job?.title || '该岗位'}」的投递后，企业将无法继续处理此申请。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWithdrawTarget(null)}>取消</Button>
              <Button variant="destructive" onClick={handleWithdraw}>确认撤回</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {actionTarget && (
        <StatusUpdateDialog
          app={actionTarget}
          onClose={() => setActionTarget(null)}
          onSubmit={(nextStatus, note) => handleStatusUpdate(actionTarget, nextStatus, note)}
        />
      )}
    </div>
  )
}

function StatusUpdateDialog({ app, onClose, onSubmit }: {
  app: Application
  onClose: () => void
  onSubmit: (status: string, note?: string) => void
}) {
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>更新投递状态</DialogTitle>
          <DialogDescription>{app.job?.title || '岗位'} · {app.applicant?.username || ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">新状态 *</label>
            <Select value={status} onValueChange={(v) => setStatus(v || '')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="选择状态" /></SelectTrigger>
              <SelectContent>
                {ENTERPRISE_ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">备注（可选）</label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="如面试时间、地点等" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!status} onClick={() => onSubmit(status, note || undefined)}>确认更新</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
