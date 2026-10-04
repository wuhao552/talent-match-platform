import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User, RegisterRequest } from '@/types'
import { authApi } from '@/services/api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      authApi
        .profile()
        .then((res) => setUser(res.data.user))
        .catch(() => {
          localStorage.removeItem('token')
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password })
    localStorage.setItem('token', res.data.accessToken)
    setToken(res.data.accessToken)
    setUser(res.data.user)
  }

  const register = async (data: RegisterRequest) => {
    const res = await authApi.register(data)
    localStorage.setItem('token', res.data.accessToken)
    setToken(res.data.accessToken)
    setUser(res.data.user)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
