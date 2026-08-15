import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { DocumentProvider } from '@/hooks/useDocuments'
import { notificationApi, messageApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, LogOut, ChevronLeft, Briefcase, FileText, MessageSquare, Bell, Brain,
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
  const [collapsed, setCollapsed] = useState(false)
  const [unreadNotif, setUnreadNotif] = useState(0)
  const [unreadMsg, setUnreadMsg] = useState(0)

  const items = navItems[user?.role || 'individual'] || navItems.individual

  // 轮询未读消息/通知数(30秒)
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
        // 静默失败:token 过期等不打扰用户
      }
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [isAuthenticated])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'relative flex shrink-0 flex-col border-r bg-muted/30 transition-all duration-300',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        {/* Logo area */}
        <div className={cn('flex items-center border-b h-14', collapsed ? 'justify-center px-2' : 'justify-between px-3')}>
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground hover:opacity-90 transition-opacity"
              title="展开导航"
            >
              AI
            </button>
          ) : (
            <>
              <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
                  AI
                </span>
                <span className="font-bold tracking-tight text-sm truncate">能力图谱匹配</span>
              </Link>
              <button
                onClick={() => setCollapsed(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="收起导航"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        {isAuthenticated && (
          <nav className="flex-1 space-y-0.5 p-2">
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
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg text-sm transition-colors',
                    collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2',
                    active
                      ? 'bg-primary-soft text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {/* active 左侧主题色指示条 */}
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <div className="relative shrink-0">
                    <Icon className="h-4 w-4" />
                    {badge > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && badge > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        )}

        {/* User footer */}
        <div className={cn('border-t', collapsed ? 'p-2' : 'p-3')}>
          {isAuthenticated ? (
            <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-3')}>
              <Avatar className="h-8 w-8 shrink-0 ring-2 ring-primary/20 cursor-pointer hover:ring-primary/50 transition-all" onClick={() => navigate('/profile')} title="个人资料">
                <AvatarFallback className="text-xs">
                  {user?.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user?.username}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ROLE_LABEL[user?.role || '']}
                    </p>
                  </div>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => { logout(); navigate('/') }}
                    title="退出登录"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => { logout(); navigate('/') }}
                  title="退出登录"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>登录</Button>
              <Button size="sm" onClick={() => navigate('/register')}>注册</Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-background">
        <DocumentProvider>
          <div className="container mx-auto px-6 py-6">{children}</div>
        </DocumentProvider>
      </main>
    </div>
  )
}
