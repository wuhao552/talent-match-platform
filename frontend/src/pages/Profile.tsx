import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export function Profile() {
  const { user } = useAuth()

  if (!user) return null

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
            <div className="flex justify-between">
              <span className="text-muted-foreground">注册时间</span>
              <span>-</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
