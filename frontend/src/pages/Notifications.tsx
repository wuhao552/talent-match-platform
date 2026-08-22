import { useState, useEffect, useCallback } from 'react'
import { notificationApi } from '@/services/api'
import type { Notification } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = {
  system: '系统', match: '匹配', application: '投递', message: '消息', job: '岗位',
}

function formatTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function Notifications() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await notificationApi.list({ unreadOnly: unreadOnly || undefined, size: 50 })
      setItems(res.data.items)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [unreadOnly])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 筛选条件变化时拉取数据
    load()
  }, [load])

  const handleMarkRead = async (n: Notification) => {
    if (n.readAt) return
    try {
      await notificationApi.markRead(n.id)
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleMarkAll = async () => {
    try {
      await notificationApi.markAllRead()
      toast.success('已全部标记为已读')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="通知中心"
        description="查看系统通知与业务消息"
        icon={Bell}
        actions={
          <>
            <Button variant={unreadOnly ? 'default' : 'outline'} size="sm" onClick={() => setUnreadOnly((v) => !v)}>
              {unreadOnly ? '显示全部' : '仅看未读'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleMarkAll}>
              <CheckCheck className="size-3.5" />
              全部已读
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
            <BellOff className="size-10 opacity-40" />
            <p className="mt-3 text-sm font-medium text-foreground">{unreadOnly ? '没有未读通知' : '暂无通知'}</p>
            <p className="mt-1 text-xs">有新的匹配或投递动态时，会第一时间通知你</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card
              key={n.id}
              className={n.readAt ? 'opacity-70' : 'border-primary/25 bg-primary/[0.02]'}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-border' : 'bg-primary'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{n.title}</h3>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{TYPE_LABEL[n.type] || n.type}</Badge>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.content}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground/70">{formatTime(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <Button size="sm" variant="ghost" className="shrink-0 text-primary" onClick={() => handleMarkRead(n)}>
                      标为已读
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
