import { useState, useEffect, useCallback } from 'react'
import { notificationApi } from '@/services/api'
import type { Notification } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Bell, CheckCheck, Inbox } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = {
  system: '系统', match: '匹配', application: '投递', message: '消息', job: '岗位',
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
    } catch (e: any) {
      toast.error(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [unreadOnly])

  useEffect(() => { load() }, [load])

  const handleMarkRead = async (n: Notification) => {
    if (n.readAt) return
    try {
      await notificationApi.markRead(n.id)
      setItems(arr => arr.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    }
  }

  const handleMarkAll = async () => {
    try {
      await notificationApi.markAllRead()
      toast.success('已全部标记为已读')
      load()
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6" />通知中心</h1>
          <p className="text-muted-foreground text-sm">查看系统通知和业务消息</p>
        </div>
        <div className="flex gap-2">
          <Button variant={unreadOnly ? 'default' : 'outline'} size="sm" onClick={() => setUnreadOnly(v => !v)}>
            {unreadOnly ? '显示全部' : '仅未读'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <CheckCheck className="h-4 w-4 mr-1" />全部已读
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-12 text-center">加载中...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Inbox className="h-10 w-10 opacity-40" />
          {unreadOnly ? '没有未读通知' : '暂无通知'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={n.readAt ? 'opacity-70' : 'border-primary/30'}>
              <CardContent className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    <span className="font-medium text-sm">{n.title}</span>
                    <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[n.type]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="ghost" onClick={() => handleMarkRead(n)}>已读</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
