import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Shared display helpers ──

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-500'
}

/**
 * 返回与分数相匹配的进度条填充色（Tailwind 渐变类）。
 * 高分偏绿、中等偏蓝、低分偏红，使进度条颜色本身就能传达分数高低。
 */
export function scoreBarColor(score: number) {
  if (score >= 80) return 'from-green-500 to-emerald-400'
  if (score >= 60) return 'from-sky-500 to-blue-400'
  if (score >= 40) return 'from-amber-500 to-yellow-400'
  return 'from-rose-500 to-red-400'
}

export const proficiencyLabel: Record<string, string> = {
  beginner: '入门', intermediate: '熟悉', advanced: '熟练', expert: '精通',
}

export const proficiencyColor: Record<string, string> = {
  beginner: 'bg-slate-100 text-slate-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-purple-100 text-purple-700',
  expert: 'bg-amber-100 text-amber-700',
}

export const STATUS_LABEL: Record<string, string> = {
  uploaded: '已上传', parsing: '解析中', parsed: '已解析', failed: '失败',
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  resume: '简历', job_description: '职位描述',
}

export const ALLOWED_EXTS = ['.pdf', '.doc', '.docx']
