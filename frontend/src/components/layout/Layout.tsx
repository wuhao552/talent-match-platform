import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { DocumentProvider } from '@/hooks/useDocuments'
import { notificationApi, messageApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, LogOut, Briefcase, FileText, MessageSquare, Bell, Brain, Menu, X,
} from 'lucide-react'
import type { ReactNode } from 'react'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badgeKey?: 'notification' | 'message'
}

const navItems: Record<string, NavItem[]> = {
  individual: [
    { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
    { to: '/jobs', label: '岗位广场', icon: Briefcase },
    { to: '/applications', label: '投递记录', icon: FileText },
    { to: '/ai-assistant', label: 'AI 助手', icon: Brain },
    { to: '/messages', label: '消息', icon: MessageSquare, badgeKey: 'message' },
    { to: '/notifications', label: '通知', icon: Bell, badgeKey: 'notification' },
  ],
  enterprise: [
    { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
    { to: '/jobs', label: '岗位管理', icon: Briefcase },
    { to: '/applications', label: '投递管理', icon: FileText },
    { to: '/ai-assistant', label: 'AI 助手', icon: Brain },
    { to: '/messages', label: '消息', icon: MessageSquare, badgeKey: 'message' },
    { to: '/notifications', label: '通知', icon: Bell, badgeKey: 'notification' },
  ],
  admin: [
    { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
    { to: '/notifications', label: '通知', icon: Bell, badgeKey: 'notification' },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  individual: '个人用户', enterprise: '企业用户', admin: '管理员',
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadNotif, setUnreadNotif] = useState(0)
  const [unreadMsg, setUnreadMsg] = useState(0)

  const items = navItems[user?.role || 'individual'] || navItems.individual

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    const tick = async () => {
      try {
        const [n, m] = await Promise.all([
          notificationApi.unreadCount(),
          messageApi.unreadCount(),
        ])
        if (!cancelled) {
          setUnreadNotif(n.data.count)
          setUnreadMsg(m.data.count)
        }
      } catch {
        // 静默失败：token 过期等由 api service 统一处理
      }
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [isAuthenticated])

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r bg-card/60">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b px-5">
        <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm">
            AI
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold tracking-tight">DeepMatch</span>
            <span className="block truncate text-[11px] text-muted-foreground">能力图谱智能匹配</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      {isAuthenticated && (
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            const Icon = item.icon
            const badge =
              item.badgeKey === 'notification' ? unreadNotif
              : item.badgeKey === 'message' ? unreadMsg
              : 0
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {badge > 0 && (
                  <span className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                    active ? 'bg-white/20 text-primary-foreground' : 'bg-destructive text-destructive-foreground',
                  )}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      )}

      {/* User */}
      <div className="shrink-0 border-t p-3">
        {isAuthenticated ? (
          <div className="flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted">
            <button type="button" onClick={() => { setMobileOpen(false); navigate('/profile') }} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-3">
                <Avatar className="size-9 ring-2 ring-primary/15">
                  <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                    {user?.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{user?.username}</span>
                  <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[user?.role || '']}</span>
                </span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="退出登录"
              className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
              onClick={() => { setMobileOpen(false); logout(); navigate('/') }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>登录</Button>
            <Button className="w-full" onClick={() => navigate('/register')}>注册</Button>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden h-full shrink-0 lg:block">{sidebar}</div>

      {/* Mobile sidebar */}
      <div className={cn('fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 lg:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        {sidebar}
      </div>
      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="icon" aria-label="打开导航" onClick={() => setMobileOpen(true)}>
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
            <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">AI</span>
              <span className="text-sm font-bold tracking-tight">DeepMatch</span>
            </Link>
          </div>
          <Avatar className="size-8 cursor-pointer" onClick={() => navigate('/profile')}>
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
              {user?.username?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 overflow-y-auto">
          <DocumentProvider>
            <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
          </DocumentProvider>
        </main>
      </div>
    </div>
  )
}
