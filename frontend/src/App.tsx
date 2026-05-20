import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/hooks/useAuth'
import { Layout } from '@/components/layout/Layout'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { ResumeUpload } from '@/pages/ResumeUpload'
import { JobUpload } from '@/pages/JobUpload'
import { SkillGraph } from '@/pages/SkillGraph'
import { MatchingResult } from '@/pages/MatchingResult'
import { Recommend } from '@/pages/Recommend'
import { Profile } from '@/pages/Profile'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload/resume" element={<ResumeUpload />} />
            <Route path="/upload/job" element={<JobUpload />} />
            <Route path="/graph/:docId" element={<SkillGraph />} />
            <Route path="/matching/:docId" element={<MatchingResult />} />
            <Route path="/recommend" element={<Recommend />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </Layout>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
