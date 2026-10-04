import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { dashboardApi, documentApi } from '@/services/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn, scoreColor } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  Briefcase,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Document, DocumentSkill, MatchResult } from '@/types'

// ── 展示辅助 ──

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function getStructured(doc: Document): Record<string, unknown> {
  const parsed = doc.parsedJson as { structured?: Record<string, unknown> } | null | undefined
  return parsed?.structured ?? {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getDocTitle(doc: Document, isIndividual: boolean): string {
  const p = getStructured(doc)
  if (isIndividual) return asText(p.name) || doc.originalFilename
  return asText(p.jobTitle) || asText(p.title) || doc.originalFilename
}

function getDocMeta(doc: Document, isIndividual: boolean): string {
  const p = getStructured(doc)
  const parts = isIndividual
    ? [asText(p.title), asText(p.city)]
    : [asText(p.companyName) || asText(p.company), asText(p.location) || asText(p.city)]
  return parts.filter(Boolean).join(' · ') || '结构化信息解析后展示'
}

function formatDocDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ── 主页面 ──

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [documents, setDocuments] = useState<Document[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [skillsMap, setSkillsMap] = useState<Record<string, DocumentSkill[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState(false)
  const hasLoadedDataRef = useRef(false)

  const isIndividual = user?.role === 'individual'
  const isAdmin = user?.role === 'admin'
  const docType = isIndividual ? 'resume' : 'job_description'

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await dashboardApi.get()
      setDocuments(r.data.documents)
      setSkillsMap(r.data.skillsMap)
      setMatches(r.data.matches)
      setLoadError(null)
      hasLoadedDataRef.current = true
    } catch (e) {
      const message = (e as Error)?.message || '加载工作台数据失败'
      setLoadError(message)
      if (!hasLoadedDataRef.current) toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次加载需要发起异步请求
    fetchDashboard()
  }, [fetchDashboard])

  // 解析中的文档自动轮询
  const prevPendingRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const hasPending = documents.some((d) => d.status === 'uploaded' || d.status === 'parsing')

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(fetchDashboard, 3000)
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      if (prevPendingRef.current) fetchDashboard()
    }

    prevPendingRef.current = hasPending
  }, [documents, fetchDashboard])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchDashboard()
    setRefreshing(false)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await documentApi.delete(deleteTarget.id)
      toast.success('删除成功')
      setDeleteTarget(null)
      fetchDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleRetryParse = async (doc: Document) => {
    try {
      await documentApi.parse(doc.id)
      toast.success('已重新提交解析')
      fetchDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新解析失败')
    }
  }

  // ── 派生数据 ──
  const myDocs = useMemo(
    () => documents
      .filter((d) => d.docType === docType)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [documents, docType],
  )
  const parsedCount = myDocs.filter((d) => d.status === 'parsed').length
  const pendingCount = myDocs.filter((d) => d.status === 'uploaded' || d.status === 'parsing').length
  const failedCount = myDocs.filter((d) => d.status === 'failed').length

  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => b.overallScore - a.overallScore),
    [matches],
  )
  const totalMatches = sortedMatches.length
  const topScore = sortedMatches.reduce((max, m) => Math.max(max, m.overallScore), 0)
  if (loading) return <DashboardSkeleton />

  if (loadError && documents.length === 0) {
    return (
      <LoadErrorCard
        message={loadError}
        onRetry={() => {
          setLoading(true)
          setLoadError(null)
          fetchDashboard()
        }}
      />
    )
  }

  if (myDocs.length === 0) {
    return (
      <EmptyDashboard
        isIndividual={isIndividual}
        isAdmin={isAdmin}
        username={user?.username || ''}
        onUpload={() => navigate(isIndividual ? '/upload/resume' : '/upload/job')}
        onBrowse={() => navigate('/jobs')}
      />
    )
  }

  const uploadPath = isIndividual ? '/upload/resume' : '/upload/job'
  const secondaryAction = isIndividual
    ? { label: '岗位广场', to: '/jobs', icon: Building2 }
    : { label: '岗位管理', to: '/jobs', icon: Briefcase }

  const heroSummary = pendingCount > 0
    ? `${pendingCount} 个文档正在智能解析，完成后会自动刷新匹配结果`
    : totalMatches > 0
      ? `已为你找到 ${totalMatches} 个匹配${isIndividual ? '职位' : '候选人'}，最高匹配 ${Math.round(topScore)} 分`
      : parsedCount > 0
        ? `${parsedCount} 个文档已解析完成，系统正在为你寻找匹配机会`
        : `上传${isIndividual ? '简历' : '职位描述'}后，AI 将自动完成技能提取与双向匹配`

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4">
      {/* 欢迎区 */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-sky-100/40 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {pendingCount > 0 && (
                <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                  <Loader2 className="size-3 animate-spin" />
                  {pendingCount} 个文档解析中
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="size-3" />
                  {failedCount} 个文档待处理
                </Badge>
              )}
            </div>

            <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">
              {greeting()}，{user?.username}
            </h1>
            <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{heroSummary}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} aria-label="刷新数据">
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" onClick={() => navigate(secondaryAction.to)}>
              <secondaryAction.icon className="size-4" />
              {secondaryAction.label}
            </Button>
            {!isAdmin && (
              <Button onClick={() => navigate(uploadPath)}>
                <Upload className="size-4" />
                {isIndividual ? '上传简历' : '发布职位'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 内容区 */}
      <div className="grid items-stretch gap-4 lg:h-[calc(100vh-12rem)] lg:min-h-[480px] lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
        <DocumentsCard
          documents={myDocs}
          skillsMap={skillsMap}
          matches={sortedMatches}
          isIndividual={isIndividual}
          onOpenDoc={(doc) => {
            if (doc.status === 'uploaded' || doc.status === 'parsing' || doc.status === 'failed') {
              navigate(`/pipeline/${doc.id}`)
            } else {
              navigate(isIndividual ? `/resume/${doc.id}` : `/job/${doc.id}`)
            }
          }}
          onViewPipeline={(doc) => navigate(`/pipeline/${doc.id}`)}
          onDelete={(doc) => setDeleteTarget(doc)}
          onRetry={handleRetryParse}
        />

        <div className="min-h-0 lg:h-full">
          <AiInsightCard
            match={sortedMatches[0]}
            isIndividual={isIndividual}
            onOpen={(id) => navigate(`/matching/${id}`)}
          />
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除{isIndividual ? '简历' : '职位'}？</DialogTitle>
            <DialogDescription>
              「{deleteTarget ? getDocTitle(deleteTarget, isIndividual) : ''}」将被永久删除，关联的匹配结果也会一并移除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── 加载 / 错误 / 空状态 ──

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1200px] animate-pulse space-y-4">
      <div className="h-24 rounded-2xl bg-muted/70" />
      <div className="grid items-stretch gap-4 lg:h-[calc(100vh-12rem)] lg:min-h-[480px] lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
        <div className="h-[46vh] rounded-2xl bg-muted/70" />
        <div className="h-48 rounded-2xl bg-muted/70" />
      </div>
    </div>
  )
}

function LoadErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <CardContent className="flex flex-col items-center px-6 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive-soft text-destructive">
            <AlertTriangle className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold">工作台加载失败</h2>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          <Button className="mt-5" onClick={onRetry}>
            <RefreshCw className="size-4" />
            重新加载
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyDashboard({
  isIndividual,
  isAdmin,
  username,
  onUpload,
  onBrowse,
}: {
  isIndividual: boolean
  isAdmin: boolean
  username: string
  onUpload: () => void
  onBrowse: () => void
}) {
  const features = isIndividual
    ? [
        { icon: Sparkles, title: 'AI 技能提取', desc: '自动从简历中识别技能、等级与类别' },
        { icon: Target, title: '智能职位匹配', desc: '语义算法与大模型双重评估岗位契合度' },
        { icon: Brain, title: 'AI 深度解读', desc: '匹配差距、可迁移技能与面试建议' },
      ]
    : isAdmin
      ? [
          { icon: BarChart3, title: '数据洞察', desc: '查看平台解析与匹配运行状态' },
          { icon: Target, title: '匹配能力', desc: '语义理解与技能知识图谱双引擎' },
          { icon: Brain, title: 'AI 能力', desc: '大模型专家评估与可解释输出' },
        ]
      : [
          { icon: Sparkles, title: 'AI 职位解析', desc: '自动抽取职责、技能要求与结构化信息' },
          { icon: Target, title: '候选人智能匹配', desc: '深度语义匹配，结果可追溯' },
          { icon: Brain, title: 'AI 面试辅助', desc: '自动生成面试题与候选人分析' },
        ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-sky-100/40 px-6 py-12 text-center sm:px-10">
        <div className="pointer-events-none absolute -left-16 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">
            AI
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting()}，{username}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {isIndividual
              ? '上传你的简历，AI 将自动提取技能并匹配适合的职位，生成可解释的匹配报告。'
              : isAdmin
                ? '平台工作台已就绪，当前暂无业务文档。'
                : '发布职位描述，AI 将自动解析岗位需求并推荐高匹配度候选人。'}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {!isAdmin && (
              <Button size="lg" className="h-10" onClick={onUpload}>
                <Upload className="size-4" />
                {isIndividual ? '上传我的简历' : '发布第一个职位'}
              </Button>
            )}
            <Button size="lg" variant="outline" className="h-10" onClick={onBrowse}>
              {isIndividual ? '先逛逛岗位广场' : '了解产品能力'}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardContent className="p-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{feature.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── 匹配推荐 ──

function DocumentsCard({
  documents,
  skillsMap,
  matches,
  isIndividual,
  onOpenDoc,
  onViewPipeline,
  onDelete,
  onRetry,
}: {
  documents: Document[]
  skillsMap: Record<string, DocumentSkill[]>
  matches: MatchResult[]
  isIndividual: boolean
  onOpenDoc: (doc: Document) => void
  onViewPipeline: (doc: Document) => void
  onDelete: (doc: Document) => void
  onRetry: (doc: Document) => void
}) {
  const [filter, setFilter] = useState<'all' | 'parsed' | 'pending' | 'failed'>('all')
  const [keyword, setKeyword] = useState('')

  const parsedCount = documents.filter((d) => d.status === 'parsed').length
  const pendingCount = documents.filter((d) => d.status === 'uploaded' || d.status === 'parsing').length
  const failedCount = documents.filter((d) => d.status === 'failed').length

  const filteredDocs = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return documents.filter((doc) => {
      const statusOk =
        filter === 'all'
          ? true
          : filter === 'pending'
            ? doc.status === 'uploaded' || doc.status === 'parsing'
            : doc.status === filter
      if (!statusOk) return false
      if (!q) return true

      const p = getStructured(doc)
      const title = isIndividual
        ? asText(p.name) || doc.originalFilename
        : asText(p.jobTitle) || asText(p.title) || doc.originalFilename
      const company = asText(p.companyName) || asText(p.company)
      return `${title} ${company} ${doc.originalFilename}`.toLowerCase().includes(q)
    })
  }, [documents, filter, keyword, isIndividual])

  const tabs = [
    { value: 'all', label: '全部', count: documents.length },
    { value: 'parsed', label: '已解析', count: parsedCount },
    { value: 'pending', label: '处理中', count: pendingCount },
    { value: 'failed', label: '异常', count: failedCount },
  ]

  return (
    <Card className="h-full">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {isIndividual ? <FileText className="size-4 text-primary" /> : <Briefcase className="size-4 text-primary" />}
              {isIndividual ? '我的简历' : '我的职位'}
            </CardTitle>
            <CardDescription>
              {documents.length > 0
                ? `${parsedCount} 份已就绪${pendingCount > 0 ? ` · ${pendingCount} 份解析中` : ''}`
                : '上传文档后在此统一管理'}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={`搜索${isIndividual ? '简历' : '职位'}...`}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
        <Tabs value={filter} onValueChange={(value) => value && setFilter(value as typeof filter)}>
          <TabsList className="h-8 w-full sm:w-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1 px-2.5 text-xs">
                {tab.label}
                <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground group-data-active:bg-primary/10 group-data-active:text-primary">
                  {tab.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-8 text-center">
            <Search className="size-5 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">没有找到匹配的文档</p>
            <p className="mt-1 text-xs text-muted-foreground">试试切换筛选标签，或修改搜索关键词</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => { setFilter('all'); setKeyword('') }}>
              清除筛选
            </Button>
          </div>
        ) : (
          <div className="scrollbar-thin max-h-[42vh] min-h-[240px] flex-1 space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0">
            {filteredDocs.map((doc) => {
              const isPending = doc.status === 'uploaded' || doc.status === 'parsing'
              const isFailed = doc.status === 'failed'
              const docSkills = skillsMap[doc.id] || []
              const docMatches = matches.filter((m) =>
                isIndividual ? m.resumeDocId === doc.id : m.jobDocId === doc.id,
              )
              const bestMatch = docMatches[0]
              const statusLabel = isPending
                ? doc.status === 'uploaded' ? '等待解析' : 'AI 解析中'
                : isFailed ? '解析失败' : '已解析'

              return (
                <div
                  key={doc.id}
                  className={cn(
                    'group rounded-xl border bg-card p-3 transition-all hover:border-primary/25 hover:shadow-sm',
                    isFailed && 'border-destructive/30',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenDoc(doc)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenDoc(doc)
                        }
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 outline-none"
                    >
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1',
                          isFailed
                            ? 'bg-destructive-soft text-destructive ring-destructive/15'
                            : isPending
                              ? 'bg-amber-500/10 text-amber-600 ring-amber-500/15'
                              : 'bg-primary/10 text-primary ring-primary/15',
                        )}
                      >
                        {isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : isIndividual ? (
                          <FileText className="size-4" />
                        ) : (
                          <Briefcase className="size-4" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">{getDocTitle(doc, isIndividual)}</span>
                          <Badge
                            variant={isFailed ? 'destructive' : isPending ? 'secondary' : 'outline'}
                            className={cn('h-5 px-1.5 text-[10px]', isPending && 'text-amber-700')}
                          >
                            {isPending && <Loader2 className="size-2.5 animate-spin" />}
                            {statusLabel}
                          </Badge>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0 opacity-70" />
                          <span className="truncate">{getDocMeta(doc, isIndividual)}</span>
                          <span className="shrink-0 opacity-60">{formatDocDate(doc.createdAt)}</span>
                        </span>
                        {!isPending && !isFailed && docSkills.length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {docSkills.slice(0, 4).map((skill, i) => (
                              <span key={i} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {skill.skillName || skill.skill?.name || `技能#${skill.skillId}`}
                              </span>
                            ))}
                            {docSkills.length > 4 && (
                              <span className="text-[10px] leading-5 text-muted-foreground">+{docSkills.length - 4}</span>
                            )}
                          </span>
                        )}
                      </span>

                      <span className="hidden shrink-0 text-right md:block">
                        {isPending ? (
                          <span className="text-xs text-muted-foreground">解析后自动匹配</span>
                        ) : isFailed ? (
                          <span className="text-xs text-destructive">需要重新解析</span>
                        ) : docMatches.length > 0 && bestMatch ? (
                          <>
                            <span className="block text-xs text-muted-foreground">
                              匹配 {docMatches.length} {isIndividual ? '个职位' : '位候选人'}
                            </span>
                            <span className={cn('block text-sm font-bold tabular-nums', scoreColor(bestMatch.overallScore))}>
                              最佳 {Math.round(bestMatch.overallScore)} 分
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">暂无匹配结果</span>
                        )}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {isFailed ? (
                        <Button size="sm" variant="outline" onClick={() => onRetry(doc)}>
                          <RefreshCw className="size-3.5" />
                          重新解析
                        </Button>
                      ) : isPending ? (
                        <Button size="sm" variant="outline" onClick={() => onViewPipeline(doc)}>
                          解析进度
                        </Button>
                      ) : (
                        <Button size="icon-sm" variant="ghost" onClick={() => onViewPipeline(doc)} title="查看处理过程">
                          <Zap className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                        onClick={() => onDelete(doc)}
                        title="删除文档"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── 右栏卡片 ──

function AiInsightCard({
  match,
  isIndividual,
  onOpen,
}: {
  match?: MatchResult
  isIndividual: boolean
  onOpen: (id: string) => void
}) {
  const llm = match?.llmAssessment

  return (
    <Card className="relative h-full overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-primary/10 blur-3xl" />
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4 text-primary" />
          AI 匹配洞察
        </CardTitle>
        <CardDescription>基于最佳匹配结果的智能解读</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col pt-4">
        {!match ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center">
            <Brain className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-xs text-muted-foreground">有匹配结果后自动生成洞察</p>
          </div>
        ) : (
          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onOpen(match.id)}
              className="w-full rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:border-primary/25 hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {isIndividual ? match.jobTitle || match.jobFilename : match.candidateName || '未知候选人'}
                </span>
                <span className={cn('shrink-0 text-sm font-bold tabular-nums', scoreColor(match.overallScore))}>
                  {Math.round(match.overallScore)} 分
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {isIndividual
                  ? [match.companyName, match.jobCity].filter(Boolean).join(' · ') || '最佳匹配职位'
                  : [match.resumeFilename, match.candidateCity].filter(Boolean).join(' · ') || '最佳匹配候选人'}
              </p>
            </button>

            {llm ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-emerald-500/10 p-3">
                    <p className="text-lg font-bold tabular-nums text-emerald-600">{Math.round(llm.overallFit)}</p>
                    <p className="text-[10px] text-muted-foreground">AI 综合适配</p>
                  </div>
                  <div className="rounded-xl bg-sky-500/10 p-3">
                    <p className="text-lg font-bold tabular-nums text-sky-600">{Math.round((llm.confidence ?? 0) * 100)}%</p>
                    <p className="text-[10px] text-muted-foreground">评估置信度</p>
                  </div>
                </div>

                {llm.strengths?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">核心优势</p>
                    {llm.strengths.slice(0, 2).map((item, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground/80">
                        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                        <span className="line-clamp-2">{item}</span>
                      </p>
                    ))}
                  </div>
                )}

                {llm.gaps?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">待提升项</p>
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground/80">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
                      <span className="line-clamp-2">{llm.gaps[0]}</span>
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-3 text-center">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  当前结果仅含算法评分，打开详情后可生成大模型深度评估
                </p>
              </div>
            )}

            <Button size="sm" variant="outline" className="mt-auto w-full" onClick={() => onOpen(match.id)}>
              查看完整分析
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

