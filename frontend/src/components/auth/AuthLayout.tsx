import { Link } from 'react-router-dom'
import { Brain, FileText, Target } from 'lucide-react'
import type { ReactNode } from 'react'

const FEATURES = [
  { icon: FileText, title: '文档智能解析', desc: '自动提取简历与 JD 中的技能和结构化信息' },
  { icon: Brain, title: 'AI 深度评估', desc: '大模型从优势、差距与可迁移性多维解读匹配' },
  { icon: Target, title: '精准双向匹配', desc: '能力图谱与语义算法共同驱动，结果可解释' },
]

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      {/* 品牌区 */}
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-sky-300/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:36px_36px]" />

        <Link to="/" className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-sm font-bold ring-1 ring-white/20 backdrop-blur">
            AI
          </span>
          <span>
            <span className="block text-base font-bold tracking-tight">DeepMatch</span>
            <span className="block text-xs text-primary-foreground/70">能力图谱智能匹配系统</span>
          </span>
        </Link>

        <div className="relative max-w-lg">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            让每一份能力，
            <br />
            遇见真正适合的机会。
          </h2>
          <div className="mt-10 space-y-5">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <feature.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{feature.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-primary-foreground/70">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          AI Agent · 技能知识图谱 · 可解释匹配
        </p>
      </aside>

      {/* 表单区 */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">
                AI
              </span>
              <span className="font-bold tracking-tight">DeepMatch</span>
            </Link>
          </div>

          <div className="mb-8 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>

          {children}

          {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
