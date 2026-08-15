/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台布局 - 侧边栏导航 + 面包屑 + 用户菜单(修改密码/退出登录)
 */
import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { adminApi } from '@/services/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  LayoutDashboard, Users, FileText, Wrench, GitCompare, Terminal,
  LogOut, ChevronRight, KeyRound, ChevronUp, ChevronDown,
  Briefcase, Send, Megaphone,
} from 'lucide-react'
import { toast } from 'sonner'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘', end: true },
  { to: '/users', icon: Users, label: '用户管理' },
  { to: '/documents', icon: FileText, label: '文档管理' },
  { to: '/skills', icon: Wrench, label: '技能管理' },
  { to: '/matching', icon: GitCompare, label: '匹配记录' },
  { to: '/llm-logs', icon: Terminal, label: 'LLM 日志' },
  { to: '/jobs', icon: Briefcase, label: '岗位管理' },
  { to: '/applications', icon: Send, label: '投递记录' },
  { to: '/notifications', icon: Megaphone, label: '通知广播' },
]

const bcMap: Record<string, string> = {
  '/': '仪表盘', '/users': '用户管理', '/documents': '文档管理',
  '/skills': '技能管理', '/matching': '匹配记录', '/llm-logs': 'LLM 日志',
  '/jobs': '岗位管理', '/applications': '投递记录', '/notifications': '通知广播',
}

export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const crumbs = bcMap[location.pathname] ? ['首页', bcMap[location.pathname]] : ['首页']

  const [menuOpen, setMenuOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { setMenuOpen(false); logout(); navigate('/login') }

  const handleChangePassword = async () => {
    if (!oldPw || !newPw) { toast.error('请填写旧密码和新密码'); return }
    if (newPw.length < 4) { toast.error('新密码至少4位'); return }
    setPwSaving(true)
    try {
      await adminApi.changePassword(oldPw, newPw)
      toast.success('密码修改成功，请重新登录')
      setPwOpen(false); setOldPw(''); setNewPw('')
      logout(); navigate('/login')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败')
    } finally { setPwSaving(false) }
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">T</div>
          <span className="font-semibold text-sm">管理后台</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}>
              <Icon className="h-4 w-4" />{label}
            </NavLink>
          ))}
        </nav>

        {/* User area */}
        <div className="relative border-t p-3" ref={menuRef}>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">{user?.username?.charAt(0).toUpperCase() || 'A'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate text-left">
              <div className="text-xs font-medium">{user?.username || 'Admin'}</div>
              <Badge variant="secondary" className="text-[10px]">管理员</Badge>
            </div>
            {menuOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border bg-popover p-1 shadow-lg ring-1 ring-foreground/10">
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                onClick={() => { setMenuOpen(false); setPwOpen(true) }}
              >
                <KeyRound className="h-4 w-4" />修改密码
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />退出登录
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
          {crumbs.map((c, i) => (
            <span key={c} className="flex items-center gap-1 text-sm text-muted-foreground">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className={i === crumbs.length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
            </span>
          ))}
        </header>
        <main className="flex-1 overflow-y-auto p-6"><Outlet /></main>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>修改管理员 {user?.username} 的登录密码</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oldPw">旧密码</Label>
              <Input id="oldPw" type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="输入当前密码" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPw">新密码</Label>
              <Input id="newPw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="输入新密码（至少4位）" />
            </div>
            <Button className="w-full" onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? '修改中...' : '确认修改'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
