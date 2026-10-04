import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Loader2, LogIn } from 'lucide-react'

export function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
      await login(username, password)
      toast.success('登录成功')
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="欢迎回来"
      subtitle="登录 DeepMatch，继续你的智能招聘与求职之旅"
      footer={
        <>
          还没有账号？{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            立即注册
          </Link>
        </>
      }
    >
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">密码</Label>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
            required
          />
        </div>

        <Button type="submit" size="lg" className="h-10 w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {loading ? '登录中...' : '登录'}
        </Button>
      </form>
    </AuthLayout>
  )
}
