import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { authApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Lock, Eye, EyeOff } from 'lucide-react'

export function Profile() {
  const { user } = useAuth()

  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [changing, setChanging] = useState(false)

  if (!user) return null

  const handleChangePassword = async () => {
    if (!oldPwd) { toast.error('请输入原密码'); return }
    if (!newPwd) { toast.error('请输入新密码'); return }
    if (newPwd.length < 4) { toast.error('新密码至少 4 位'); return }
    if (newPwd !== confirmPwd) { toast.error('两次输入的新密码不一致'); return }
    if (oldPwd === newPwd) { toast.error('新密码不能与原密码相同'); return }

    setChanging(true)
    try {
      await authApi.changePassword({ oldPassword: oldPwd, newPassword: newPwd })
      toast.success('密码修改成功')
      setOldPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err: any) {
      const msg = err?.message || '密码修改失败'
      toast.error(msg)
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">个人资料</h1>
        <p className="text-muted-foreground">管理您的账号信息</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xl font-semibold">{user.username}</p>
              <Badge variant="outline">
                {user.role === 'individual'
                  ? '个人用户'
                  : user.role === 'enterprise'
                    ? '企业用户'
                    : '管理员'}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">用户名</span>
              <span>{user.username}</span>
            </div>
            {user.email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">邮箱</span>
                <span>{user.email}</span>
              </div>
            )}
            {user.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">手机</span>
                <span>{user.phone}</span>
              </div>
            )}
            {user.city && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">城市</span>
                <span>{user.city}</span>
              </div>
            )}
            {user.companyName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">公司名称</span>
                <span>{user.companyName}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            修改密码
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oldPwd">原密码</Label>
            <div className="relative">
              <Input
                id="oldPwd"
                type={showOld ? 'text' : 'password'}
                placeholder="请输入原密码"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowOld(!showOld)}
              >
                {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPwd">新密码</Label>
            <div className="relative">
              <Input
                id="newPwd"
                type={showNew ? 'text' : 'password'}
                placeholder="请输入新密码（至少 4 位）"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPwd">确认新密码</Label>
            <Input
              id="confirmPwd"
              type="password"
              placeholder="请再次输入新密码"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
            />
          </div>

          <Button onClick={handleChangePassword} disabled={changing}>
            {changing ? '修改中...' : '确认修改'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
