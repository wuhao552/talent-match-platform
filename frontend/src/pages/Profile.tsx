import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { authApi } from '@/services/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { AtSign, Building2, KeyRound, Loader2, Lock, MapPin, Phone, UserRound } from 'lucide-react'

const ROLE_LABEL = {
  individual: '个人用户',
  enterprise: '企业用户',
  admin: '管理员',
}

export function Profile() {
  const { user } = useAuth()

  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [changing, setChanging] = useState(false)

  if (!user) return null

  const infoItems = [
    { label: '用户名', value: user.username, icon: UserRound },
    { label: '邮箱', value: user.email, icon: AtSign },
    { label: '手机', value: user.phone, icon: Phone },
    { label: '城市', value: user.city, icon: MapPin },
    { label: '公司名称', value: user.companyName, icon: Building2 },
  ].filter((item) => item.value)

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '密码修改失败')
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="个人资料" description="管理你的账号信息与登录密码" icon={UserRound} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>基本信息</CardTitle>
            <CardDescription>你的身份与联系方式</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-16 ring-4 ring-primary/10">
                <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
                  {user.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{user.username}</p>
                <Badge variant="outline" className="mt-1">{ROLE_LABEL[user.role]}</Badge>
              </div>
            </div>

            <div className="mt-5 space-y-1">
              {infoItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm odd:bg-muted/40">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <item.icon className="size-3.5" />
                    {item.label}
                  </span>
                  <span className="max-w-[60%] truncate font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              修改密码
            </CardTitle>
            <CardDescription>定期更换密码可以提升账号安全性</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="oldPwd">原密码</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="oldPwd"
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入原密码"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newPwd">新密码</Label>
              <Input
                id="newPwd"
                type="password"
                autoComplete="new-password"
                placeholder="至少 4 位"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPwd">确认新密码</Label>
              <Input
                id="confirmPwd"
                type="password"
                autoComplete="new-password"
                placeholder="请再次输入新密码"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="h-10"
              />
            </div>

            <Button className="h-10 w-full sm:w-auto" onClick={handleChangePassword} disabled={changing}>
              {changing ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {changing ? '修改中...' : '确认修改'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
