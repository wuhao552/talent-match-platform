import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { applicationApi, messageApi } from '@/services/api'
import type { Application, ApplicationStatus } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { FileText, Clock, Building2, User, MessageSquare } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  submitted: '已投递', viewed: '已查看', screening: '筛选中', interview: '面试中',
  offer: '已发offer', hired: '已录用', rejected: '已拒绝', withdrawn: '已撤回',
}
const STATUS_COLOR: Record<string, any> = {
  submitted: 'secondary', viewed: 'outline', screening: 'default', interview: 'default',
  offer: 'default', hired: 'default', rejected: 'destructive', withdrawn: 'outline',
}

// 企业可流转的状态选项
const ENTERPRISE_ACTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'viewed', label: '标记已查看' },
  { value: 'screening', label: '进入筛选' },
  { value: 'interview', label: '邀请面试' },
  { value: 'offer', label: '发放offer' },
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, size: 10 }
      if (status) params.status = status
      if (isEnterprise && filterJobId) params.jobId = filterJobId
      const res = isEnterprise
        ? await applicationApi.listForEnterprise(params)
        : await applicationApi.myList(params)
      setItems(res.data.items)
      setTotal(res.data.total)
    } catch (e: any) {
      toast.error(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [isEnterprise, filterJobId, page, status])

  useEffect(() => { load() }, [load])

  const handleWithdraw = async (app: Application) => {
    if (!confirm('确认撤回此投递?')) return
    try {
      await applicationApi.withdraw(app.id)
      toast.success('已撤回')
      load()
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    }
  }

  const handleStatusUpdate = async (app: Application, newStatus: string, note?: string) => {
    try {
      await applicationApi.updateStatus(app.id, { status: newStatus, note })
      toast.success('状态已更新')
      setActionTarget(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />投递记录</h1>
        <p className="text-muted-foreground text-sm">
          {isEnterprise ? '管理收到的岗位投递' : '查看我的投递记录'}
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <Select
          value={status}
          onValueChange={(v) => { setStatus(!v || v === 'all' ? '' : v); setPage(1) }}
          items={{ all: '全部状态', ...STATUS_LABEL }}
        >
          <SelectTrigger className="w-40"><SelectValue placeholder="全部状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-12 text-center">加载中...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {isEnterprise ? '暂无投递记录' : '暂无投递记录,去岗位广场看看吧'}
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((app) => (
            <Card key={app.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {app.job ? (
                        <Link to={`/jobs/${app.job.id}`} className="font-semibold hover:underline truncate">
                          {app.job.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">岗位已删除</span>
                      )}
                      <Badge variant={STATUS_COLOR[app.status]}>{STATUS_LABEL[app.status]}</Badge>
                    </div>
                    {isEnterprise && app.applicant && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />{app.applicant.username}
                        {app.applicant.city && ` · ${app.applicant.city}`}
                      </p>
                    )}
                    {!isEnterprise && app.job?.companyName && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />{app.job.companyName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />投递于 {new Date(app.createdAt).toLocaleString()}
                    </p>
                    {app.coverLetter && <p className="text-sm text-muted-foreground line-clamp-1">求职信:{app.coverLetter}</p>}
                    {app.statusHistory && app.statusHistory.length > 0 && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">状态历史 ({app.statusHistory.length})</summary>
                        <div className="mt-1 space-y-0.5 pl-2">
                          {app.statusHistory.map((h, i) => (
                            <div key={i}>{STATUS_LABEL[h.status] || h.status} - {new Date(h.at).toLocaleString()}{h.note ? ` · ${h.note}` : ''}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!isEnterprise && (app.status === 'submitted' || app.status === 'viewed' || app.status === 'screening') && (
                      <Button size="sm" variant="outline" onClick={() => handleWithdraw(app)}>撤回</Button>
                    )}
                    {isEnterprise && (
                      <Button size="sm" variant="outline" onClick={() => setActionTarget(app)}>
                        更新状态
                      </Button>
                    )}
                    {isEnterprise && app.applicant && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try {
                          const res = await messageApi.createConversation({ receiverId: app.applicant!.id, applicationId: app.id })
                          navigate(`/messages?conv=${res.data.id}`)
                        } catch (e: any) {
                          toast.error(e?.message || '创建会话失败')
                        }
                      }}>
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > 10 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="py-2 text-sm">第 {page} 页</span>
          <Button variant="outline" disabled={items.length < 10} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      {actionTarget && (
        <StatusUpdateDialog
          app={actionTarget}
          onClose={() => setActionTarget(null)}
          onSubmit={(status, note) => handleStatusUpdate(actionTarget, status, note)}
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
        <DialogHeader><DialogTitle>更新投递状态 - {app.job?.title || ''}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">新状态 *</label>
            <Select value={status} onValueChange={(v) => setStatus(v || '')}>
              <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
              <SelectContent>
                {ENTERPRISE_ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">备注(可选)</label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="如面试时间、地点等" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!status} onClick={() => onSubmit(status, note || undefined)}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
