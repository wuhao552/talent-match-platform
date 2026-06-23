import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/hooks/useAuth'
import { Layout } from '@/components/layout/Layout'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'

// 懒加载非首屏页面，减少首屏 bundle 体积
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const ResumeUpload = lazy(() => import('@/pages/ResumeUpload').then(m => ({ default: m.ResumeUpload })))
const JobUpload = lazy(() => import('@/pages/JobUpload').then(m => ({ default: m.JobUpload })))
const MatchingResult = lazy(() => import('@/pages/MatchingResult').then(m => ({ default: m.MatchingResult })))
const ResumeDetail = lazy(() => import('@/pages/ResumeDetail').then(m => ({ default: m.ResumeDetail })))
const JobDetail = lazy(() => import('@/pages/JobDetail').then(m => ({ default: m.JobDetail })))
const Profile = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
const PipelineView = lazy(() => import('@/pages/PipelineView').then(m => ({ default: m.PipelineView })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth pages — no layout */}
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* App pages — with layout */}
          <Route
            path="/*"
            element={
              <Layout>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/upload/resume" element={<ResumeUpload />} />
                    <Route path="/upload/job" element={<JobUpload />} />
                    <Route path="/graph/:docId" element={<Navigate to="/pipeline/:docId" replace />} />
                    <Route path="/matching/:id" element={<MatchingResult />} />
                    <Route path="/resume/:resumeDocId" element={<ResumeDetail />} />
                    <Route path="/job/:jobDocId" element={<JobDetail />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/pipeline/:docId" element={<PipelineView />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            }
          />
        </Routes>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
