import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  /** 覆盖数字颜色（如"最佳匹配"按分数着色） */
  valueClassName?: string
}

/** 简约统计卡：统一 muted 图标底 + 主题色图标，shadcn 风格 */
export function StatCard({ label, value, sub, icon: Icon, valueClassName }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
          <Icon className={cn('h-4 w-4 text-primary')} />
        </div>
      </div>
      <p className={cn('mt-1.5 text-2xl font-bold tabular-nums tracking-tight', valueClassName)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
