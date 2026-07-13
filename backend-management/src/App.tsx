/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台路由入口 - 登录页 + 受保护的管理页面
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { UserManagement } from '@/pages/UserManagement'
import { DocumentManagement } from '@/pages/DocumentManagement'
import { SkillManagement } from '@/pages/SkillManagement'
import { MatchingRecords } from '@/pages/MatchingRecords'
import { LlmLogs } from '@/pages/LlmLogs'
import type { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/documents" element={<DocumentManagement />} />
        <Route path="/skills" element={<SkillManagement />} />
        <Route path="/matching" element={<MatchingRecords />} />
        <Route path="/llm-logs" element={<LlmLogs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (<BrowserRouter basename="/admin"><AuthProvider><AppRoutes /><Toaster /></AuthProvider></BrowserRouter>)
}
