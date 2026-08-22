import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Loader2, UserRoundPlus } from 'lucide-react'

export function Register() {
  const { register, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'individual' | 'enterprise'>('individual')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register({
        username,
        password,
        role,
        companyName: role === 'enterprise' ? companyName : undefined,
        email: email || undefined,
      })
      toast.success('注册成功')
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="创建账号"
      subtitle="选择你的身份，上传第一份文档即可开始智能匹配"
      footer={
        <>
          已有账号？{' '}
          <Link to="/" className="font-medium text-primary hover:underline">
            去登录
          </Link>
        </>
      }
    >
      <Tabs value={role} onValueChange={(v) => setRole(v as 'individual' | 'enterprise')} className="mb-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="individual">我是求职者</TabsTrigger>
          <TabsTrigger value="enterprise">我是招聘方</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="username">用户名</Label>
          <Input
            id="username"
            autoComplete="username"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-10"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
            required
          />
        </div>

        {role === 'enterprise' && (
          <div className="space-y-2">
            <Label htmlFor="companyName">公司名称</Label>
            <Input
              id="companyName"
              placeholder="请输入公司名称"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="h-10"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">邮箱（选填）</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10"
          />
        </div>

        <Button type="submit" size="lg" className="h-10 w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <UserRoundPlus className="size-4" />}
          {loading ? '注册中...' : '创建账号'}
        </Button>
      </form>
    </AuthLayout>
  )
}
