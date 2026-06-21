import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/hooks/useAuth'
import { DocumentProvider } from '@/hooks/useDocuments'
import { Layout } from '@/components/layout/Layout'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { ResumeUpload } from '@/pages/ResumeUpload'
import { JobUpload } from '@/pages/JobUpload'
import { MatchingResult } from '@/pages/MatchingResult'
import { ResumeDetail } from '@/pages/ResumeDetail'
import { JobDetail } from '@/pages/JobDetail'
import { Profile } from '@/pages/Profile'
import { PipelineView } from '@/pages/PipelineView'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DocumentProvider>
          <Routes>
            {/* Auth pages — no layout */}
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* App pages — with layout */}
            <Route
              path="/*"
              element={
                <Layout>
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
                </Layout>
              }
            />
          </Routes>
        </DocumentProvider>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
