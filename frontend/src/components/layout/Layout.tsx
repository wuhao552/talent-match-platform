import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ReactNode } from 'react'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-primary">
              能力图谱匹配系统
            </Link>
            <nav className="hidden gap-4 md:flex">
              {isAuthenticated && (
                <>
                  <Link
                    to="/dashboard"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    仪表盘
                  </Link>
                  {user?.role === 'individual' && (
                    <>
                      <Link
                        to="/upload/resume"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        上传简历
                      </Link>
                      <Link
                        to="/recommend"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        职位推荐
                      </Link>
                    </>
                  )}
                  {user?.role === 'enterprise' && (
                    <>
                      <Link
                        to="/upload/job"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        发布职位
                      </Link>
                      <Link
                        to="/recommend"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        候选人推荐
                      </Link>
                    </>
                  )}
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="relative h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent p-0 hover:bg-muted">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>
                      {user?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.role === 'individual'
                        ? '个人用户'
                        : user?.role === 'enterprise'
                          ? '企业用户'
                          : '管理员'}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    个人资料
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    仪表盘
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>退出登录</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  登录
                </Button>
                <Button onClick={() => navigate('/register')}>注册</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
