import { cn } from '@/lib/utils'

interface ScoreRingProps {
  score: number
  size?: number
  strokeWidth?: number
  className?: string
}

// 高分偏绿、中等偏琥珀、低分偏红，与 utils 的 scoreColor 语义一致
const RING_COLORS: Record<'high' | 'mid' | 'low', string> = {
  high: '#16a34a',
  mid: '#d97706',
  low: '#dc2626',
}

/** SVG 环形评分：单色圆弧 + 中心分数，颜色随分数高低变化 */
export function ScoreRing({ score, size = 44, strokeWidth = 4, className }: ScoreRingProps) {
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, score))
  const color = clamped >= 80 ? RING_COLORS.high : clamped >= 60 ? RING_COLORS.mid : RING_COLORS.low
  const dash = (clamped / 100) * circumference

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={strokeWidth} className="stroke-muted/60"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-bold tabular-nums" style={{ fontSize: size * 0.3, color }}>
          {Math.round(clamped)}
        </span>
        <span className="mt-0.5 text-muted-foreground" style={{ fontSize: size * 0.13 }}>
          分
        </span>
      </div>
    </div>
  )
}
