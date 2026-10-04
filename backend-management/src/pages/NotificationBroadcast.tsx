/**
 * @description 通知广播 - 管理员向平台全体用户发送系统通知
 */
import { useState } from 'react'
import { adminApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Megaphone, Check } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = {
  system: '系统通知', match: '匹配相关', application: '投递相关', message: '消息相关', job: '岗位相关',
}

export function NotificationBroadcast() {
  const [type, setType] = useState('system')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [lastSent, setLastSent] = useState<{ count: number; title: string; at: string } | null>(null)

  const handleSend = async () => {
    if (!title.trim()) { toast.error('请填写通知标题'); return }
    if (!content.trim()) { toast.error('请填写通知内容'); return }
    setSending(true)
    try {
      const res = await adminApi.broadcastNotification({ type, title: title.trim(), content: content.trim() })
      const count = res.data.count
      toast.success(`已成功推送给 ${count} 位用户`)
      setLastSent({ count, title: title.trim(), at: new Date().toLocaleString('zh-CN') })
      setTitle('')
      setContent('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">通知广播</h1>
        <p className="text-muted-foreground">向平台所有用户发送系统通知</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5" />新建广播
            </CardTitle>
            <CardDescription>填写通知内容，确认后立即推送给所有用户</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>通知类型</Label>
              <Select value={type} onValueChange={(v) => setType(v || 'system')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>标题 *</Label>
              <Input placeholder="如：系统维护通知" value={title} onChange={e => setTitle(e.target.value)} maxLength={128} />
              <p className="text-xs text-muted-foreground">{title.length} / 128</p>
            </div>
            <div className="space-y-1">
              <Label>内容 *</Label>
              <Textarea rows={6} placeholder="通知正文..." value={content} onChange={e => setContent(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Alert variant="default" className="flex-1 mr-3 py-2">
                <AlertDescription className="text-xs">
                  广播将立即推送，所有用户将在通知中心收到。请仔细检查内容。
                </AlertDescription>
              </Alert>
              <Button onClick={handleSend} disabled={sending || !title.trim() || !content.trim()}>
                {sending ? <><Spinner className="mr-1 h-4 w-4" />发送中</> : <><Megaphone className="mr-1 h-4 w-4" />立即发送</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">最近发送</CardTitle>
            <CardDescription>本次会话内的发送记录(刷新页面后清空)</CardDescription>
          </CardHeader>
          <CardContent>
            {lastSent ? (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="font-medium">{lastSent.title}</div>
                    <div className="text-xs text-muted-foreground">推送至 {lastSent.count} 位用户</div>
                    <div className="text-xs text-muted-foreground">时间：{lastSent.at}</div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无发送记录</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
