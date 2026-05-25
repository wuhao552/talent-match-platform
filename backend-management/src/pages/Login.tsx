/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理员登录页 - 仅限 role=admin 用户登录
 */
import { useState } from 'react'; import { useNavigate } from 'react-router-dom'; import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'; import { ShieldCheck } from 'lucide-react'

export function Login() {
  const { login } = useAuth(); const navigate = useNavigate()
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setLoading(true)
    try { await login(username, password); navigate('/') } catch (err) { setError(err instanceof Error ? err.message : '登录失败') } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">管理后台登录</CardTitle><CardDescription>仅限管理员账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2"><Label htmlFor="username">用户名</Label><Input id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入管理员账号" required /></div>
            <div className="space-y-2"><Label htmlFor="password">密码</Label><Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? '登录中...' : '登录'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
