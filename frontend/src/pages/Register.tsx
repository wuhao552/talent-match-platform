import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

function TextureBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -500, y: -500, tx: -500, ty: -500 })
  const animRef = useRef(0)
  const linesRef = useRef<{ points: { x: number; y: number }[]; baseY: number; amp: number; phase: number; speed: number }[]>([])

  const initLines = useCallback((_w: number, h: number) => {
    const count = Math.floor(h / 28)
    linesRef.current = Array.from({ length: count }, (_, i) => ({
      points: [],
      baseY: (i / count) * h,
      amp: 8 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7,
    }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const p = canvas.parentElement!
      canvas.width = p.clientWidth
      canvas.height = p.clientHeight
      initLines(canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    let t = 0
    const draw = () => {
      if (!canvas || !ctx) return
      const w = canvas.width; const h = canvas.height
      t += 0.008

      const mx = mouseRef.current.tx += (mouseRef.current.x - mouseRef.current.tx) * 0.05
      const my = mouseRef.current.ty += (mouseRef.current.y - mouseRef.current.ty) * 0.05

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#c8f0dc'
      ctx.fillRect(0, 0, w, h)

      for (const line of linesRef.current) {
        ctx.beginPath()
        for (let x = 0; x <= w; x += 3) {
          let yOff = Math.sin(x * 0.012 + line.phase + t * line.speed) * line.amp
          yOff += Math.sin(x * 0.025 + line.phase * 1.7 + t * 0.6) * line.amp * 0.5
          yOff += Math.sin(x * 0.006 + t * 0.3) * line.amp * 0.8

          const dx = x - mx
          const dy = (line.baseY + yOff) - my
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) yOff += Math.sin(dx * 0.04) * (1 - dist / 140) * 28

          const py = line.baseY + yOff
          if (x === 0) ctx.moveTo(x, py)
          else ctx.lineTo(x, py)
        }
        ctx.strokeStyle = '#2d7a60'
        ctx.lineWidth = 0.55
        ctx.stroke()
      }

      if (mx > 0 && my > 0) {
        for (let r = 0; r < 3; r++) {
          const radius = 40 + r * 35 + ((t * 80) % 70)
          const alpha = 0.08 * (1 - radius / 160)
          if (alpha > 0) {
            ctx.beginPath()
            ctx.arc(mx, my, radius, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(45,122,96,${alpha})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [initLines])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mouseRef.current.x = e.clientX - r.left
        mouseRef.current.y = e.clientY - r.top
      }}
      onMouseLeave={() => { mouseRef.current.x = -500; mouseRef.current.y = -500 }}
    />
  )
}

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
        username, password, role,
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
    <div className="flex h-screen">
      <div className="hidden w-1/2 md:flex items-center justify-center p-8">
        <div className="relative h-full w-full overflow-hidden rounded-3xl">
          <TextureBg />
        </div>
      </div>

      <div className="flex w-full md:w-1/2 items-center justify-center px-8 overflow-auto">
        <div className="w-full max-w-sm space-y-8 py-8">
          <div className="text-center md:hidden">
            <h1 className="text-xl font-bold">能力图谱匹配系统</h1>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">创建账号</h1>
            <p className="text-sm text-muted-foreground">加入能力图谱匹配系统，开启智能人才匹配</p>
            <p className="text-sm text-muted-foreground/70 leading-relaxed">
              上传简历或职位描述，AI 自动提取技能标签并构建能力图谱，实现精准双向匹配。
            </p>
          </div>

          <Tabs value={role} onValueChange={(v) => setRole(v as 'individual' | 'enterprise')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="individual">个人用户</TabsTrigger>
              <TabsTrigger value="enterprise">企业用户</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {role === 'enterprise' && (
              <Input placeholder="公司名称" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            )}
            <Input type="email" placeholder="邮箱（选填）" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            已有账号？{' '}
            <Link to="/" className="font-medium text-primary hover:underline">去登录</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
