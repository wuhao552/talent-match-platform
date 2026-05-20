import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { documentApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Document } from '@/types'

const statusLabels: Record<string, string> = {
  uploaded: '已上传',
  parsing: '解析中',
  parsed: '已解析',
  failed: '解析失败',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  uploaded: 'secondary',
  parsing: 'default',
  parsed: 'outline',
  failed: 'destructive',
}

export function Dashboard() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    documentApi
      .list()
      .then((res) => setDocuments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">仪表盘</h1>
          <p className="text-muted-foreground">
            欢迎回来，{user?.username}
            {user?.role === 'individual' ? '（个人用户）' : '（企业用户）'}
          </p>
        </div>
        {user?.role === 'individual' ? (
          <Button>
            <Link to="/upload/resume">上传简历</Link>
          </Button>
        ) : (
          <Button>
            <Link to="/upload/job">发布职位</Link>
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              文档总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{documents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              已解析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {documents.filter((d) => d.status === 'parsed').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              待处理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {documents.filter((d) => d.status === 'uploaded' || d.status === 'parsing').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Document List */}
      <Card>
        <CardHeader>
          <CardTitle>我的文档</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">加载文档列表...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">还没有上传任何文档</p>
              <Button variant="outline" className="mt-4">
                <Link
                  to={
                    user?.role === 'individual'
                      ? '/upload/resume'
                      : '/upload/job'
                  }
                >
                  立即上传
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{doc.originalFilename}</p>
                        <Badge variant={statusVariants[doc.status] || 'secondary'} className="text-[10px]">
                          {statusLabels[doc.status] || doc.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {doc.docType === 'resume' ? '简历' : '职位描述'} ·{' '}
                        {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                      {doc.status === 'parsed' && doc.parsedText && (
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/70 italic">
                          {doc.parsedText.slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex shrink-0 items-center gap-2">
                      {doc.status === 'parsed' && (
                        <>
                          <Button size="sm" variant="outline">
                            <Link to={`/graph/${doc.id}`}>查看解析</Link>
                          </Button>
                          {user?.role === 'individual' && (
                            <Button size="sm" variant="outline">
                              <Link to={`/matching/${doc.id}`}>匹配职位</Link>
                            </Button>
                          )}
                        </>
                      )}
                      {doc.status === 'failed' && (
                        <Button size="sm" variant="outline">
                          <Link to={`/graph/${doc.id}`}>查看详情</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
