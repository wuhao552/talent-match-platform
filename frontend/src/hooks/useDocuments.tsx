import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { documentApi } from '@/services/api'
import type { Document } from '@/types'

interface DocumentContextType {
  documents: Document[]
  loading: boolean
  refresh: () => void
}

const DocumentContext = createContext<DocumentContextType | null>(null)

export function DocumentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await documentApi.list()
      setDocuments(res.data)
    } catch { /* ignore */ }
  }, [])

  // 初始加载
  useEffect(() => {
    if (!user) {
      setDocuments([])
      setLoading(false)
      return
    }
    setLoading(true)
    fetchDocuments().finally(() => setLoading(false))
  }, [user, fetchDocuments])

  // 全局轮询：只要有文档在解析中，就持续轮询
  // 使用 ref 追踪 pending 状态，避免 useEffect 依赖 documents 导致频繁重建定时器
  const pendingCountRef = useRef(0)
  useEffect(() => {
    const count = documents.filter(
      (d) => d.status === 'uploaded' || d.status === 'parsing',
    ).length
    pendingCountRef.current = count

    if (count > 0 && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        documentApi.list().then((r) => {
          setDocuments(r.data)
        }).catch(() => {})
      }, 3000)
    } else if (count === 0 && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [documents])

  // 组件卸载时清理定时器（登出等场景）
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  const refresh = useCallback(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return (
    <DocumentContext.Provider value={{ documents, loading, refresh }}>
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  const ctx = useContext(DocumentContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentProvider')
  return ctx
}
