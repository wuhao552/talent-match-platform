import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const features = [
  {
    icon: '📄',
    title: '文档智能解析',
    desc: '支持 PDF、DOC、DOCX 格式的简历与职位描述自动解析，大模型提取结构化信息。',
  },
  {
    icon: '🧠',
    title: '能力图谱构建',
    desc: '自动构建个人能力图谱与职位能力图谱，基于 D3 力导向图可视化展示能力结构。',
  },
  {
    icon: '🎯',
    title: '智能双向匹配',
    desc: '人才与职位双向智能推荐，多维度匹配评分，提供详细的技能对比依据。',
  },
  {
    icon: '🔗',
    title: '知识图谱分析',
    desc: '基于招聘数据构建的技能共现知识图谱，洞察技能关联与需求趋势。',
  },
]

const stats = [
  { value: '314', label: '技能节点' },
  { value: '60,804', label: '共现关系' },
  { value: '5', label: '分析粒度' },
  { value: '< 3s', label: '平均解析' },
]

const roles = [
  {
    emoji: '👤',
    title: '个人用户',
    tag: '求职者',
    items: ['上传简历自动提取技能', '可视化个人能力图谱', '智能职位匹配推荐', '技能趋势洞察'],
  },
  {
    emoji: '🏢',
    title: '企业用户',
    tag: '招聘方',
    items: ['批量上传职位描述', '构建职位能力画像', '智能候选人匹配', '匹配明细与评分'],
  },
]

export function Home() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="space-y-24 pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden pt-16 pb-12 text-center">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="text-primary">AI</span> 智能匹配与能力图谱
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground leading-relaxed">
          基于大语言模型与知识图谱技术，实现简历与职位的深度解析、
          能力可视化与双向智能匹配。
        </p>
        <div className="mt-8 flex justify-center gap-3">
          {isAuthenticated ? (
            <Button size="lg" onClick={() => navigate('/dashboard')}>
              进入工作台
            </Button>
          ) : (
            <>
              <Button size="lg" onClick={() => navigate('/register')}>
                免费注册
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                登录
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Stats bar */}
      <section className="mx-auto max-w-3xl">
        <div className="grid grid-cols-4 rounded-xl border bg-card/60 py-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-primary tabular-nums">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          核心能力
        </p>
        <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">
          全流程智能化人才匹配
        </h2>
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xl">
                  {f.icon}
                </span>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="mx-auto max-w-xs" />

      {/* Roles */}
      <section>
        <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          适用角色
        </p>
        <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">
          无论是求职还是招聘，都能找到价值
        </h2>
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          {roles.map((r) => (
            <Card key={r.title} className="group transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl">{r.emoji}</span>
                  <h3 className="font-semibold">{r.title}</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {r.tag}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {r.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      {!isAuthenticated && (
        <section className="text-center">
          <div className="mx-auto max-w-lg rounded-2xl bg-primary/5 px-8 py-10">
            <h2 className="text-xl font-semibold">开始使用能力图谱匹配系统</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              注册即享文档解析、能力图谱、智能匹配全流程服务
            </p>
            <Button size="lg" className="mt-6" onClick={() => navigate('/register')}>
              免费注册
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
