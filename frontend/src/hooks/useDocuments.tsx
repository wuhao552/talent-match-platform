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

  // 全局轮询：只要有文档在解析中，就持续轮询，不随页面切换中断
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === 'uploaded' || d.status === 'parsing',
    )

    if (hasPending && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        documentApi.list().then((r) => {
          setDocuments(r.data)
        }).catch(() => {})
      }, 3000)
    }

    if (!hasPending && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // 注意：不在 cleanup 中清除定时器，保证切换页面时轮询继续运行
  }, [documents])

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
