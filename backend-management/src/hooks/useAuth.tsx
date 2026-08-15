/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台认证 Hook - 登录/登出/角色校验(仅限admin)
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { AdminUser } from '@/types'
import { adminApi } from '@/services/api'

interface AuthContextType {
  user: AdminUser | null; token: string | null; loading: boolean
  login: (username: string, password: string) => Promise<void>; logout: () => void; isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      // 用 /auth/profile 校验 token 并加载管理员信息
      const req = async () => {
        const BASE = '/api'
        const res = await fetch(`${BASE}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json()
        if (res.ok && json.data?.user?.role === 'admin') {
          setUser(json.data.user)
        } else {
          localStorage.removeItem('admin_token'); setToken(null)
        }
        setLoading(false)
      }
      req()
    } else { setLoading(false) }
  }, [])

  const login = async (username: string, password: string) => {
    const res = await adminApi.login(username, password)
    if (res.data.user.role !== 'admin') throw new Error('无管理员权限，仅限管理员登录')
    localStorage.setItem('admin_token', res.data.accessToken)
    setToken(res.data.accessToken); setUser(res.data.user)
  }

  const logout = () => { localStorage.removeItem('admin_token'); setToken(null); setUser(null) }

  return <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated: !!user }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
