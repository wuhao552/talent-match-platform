import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { documentApi, matchingApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { STATUS_LABEL, STATUS_VARIANT, DOC_TYPE_LABEL, scoreColor } from '@/lib/utils'
import { toast } from 'sonner'
import type { Document, MatchResult } from '@/types'

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)

  const isIndividual = user?.role === 'individual'

  useEffect(() => {
    documentApi.list()
      .then((res) => setDocuments(res.data))
      .catch(() => toast.error('加载文档列表失败'))
      .finally(() => setLoading(false))
  }, [])

  const loadMatches = () => {
    const hasParsed = documents.some((d) => d.status === 'parsed')
    if (!hasParsed) return
    setMatching(true)
    matchingApi.recommend()
      .then((res) => setMatches(res.data))
      .catch(() => {})
      .finally(() => setMatching(false))
  }

  useEffect(() => {
    if (!loading && documents.length > 0) loadMatches()
  }, [loading, documents.length])

  const parsedCount = documents.filter((d) => d.status === 'parsed').length
  const pendingCount = documents.filter((d) => d.status === 'uploaded' || d.status === 'parsing').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工作台</h1>
          <p className="text-muted-foreground">
            欢迎回来，{user?.username}
            {isIndividual ? '（个人用户）' : '（企业用户）'}
          </p>
        </div>
        <Button onClick={() => navigate(isIndividual ? '/upload/resume' : '/upload/job')}>
          {isIndividual ? '上传简历' : '发布职位'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">文档总数</CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{documents.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已解析</CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{parsedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">待处理</CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{pendingCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isIndividual ? '匹配职位' : '匹配候选人'}
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{matches.length}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">我的文档</TabsTrigger>
          <TabsTrigger value="matches">
            {isIndividual ? '职位推荐' : '候选人推荐'}
            {matches.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{matches.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground">还没有上传任何文档</p>
              <Button
                variant="outline" className="mt-4"
                onClick={() => navigate(isIndividual ? '/upload/resume' : '/upload/job')}
              >
                立即上传
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{doc.originalFilename}</p>
                      <Badge variant={(STATUS_VARIANT[doc.status] as any) || 'secondary'} className="text-[10px]">
                        {STATUS_LABEL[doc.status] || doc.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {DOC_TYPE_LABEL[doc.docType] || doc.docType} · {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-2">
                    {doc.status === 'parsed' && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/graph/${doc.id}`)}>
                        查看解析
                      </Button>
                    )}
                    {doc.status === 'failed' && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/graph/${doc.id}`)}>
                        查看详情
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          {matching ? (
            <div className="flex items-center justify-center gap-3 py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">匹配计算中...</span>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground">
                {parsedCount === 0 ? '请先上传并解析文档' : '暂无匹配结果'}
              </p>
              {parsedCount === 0 && (
                <Button variant="outline" className="mt-4" onClick={() => navigate(isIndividual ? '/upload/resume' : '/upload/job')}>
                  立即上传
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matches.map((m) => (
                <Card key={m.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate(`/matching/${m.id}`)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">
                          {isIndividual ? (m.jobTitle || m.jobFilename) : (m.candidateName || '未知')}
                        </CardTitle>
                        {isIndividual && m.companyName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.companyName}</p>
                        )}
                        {!isIndividual && m.candidateCity && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.candidateCity}</p>
                        )}
                      </div>
                      <div className="text-center">
                        <p className={`text-xl font-bold tabular-nums ${scoreColor(m.overallScore)}`}>
                          {Math.round(m.overallScore)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">分</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {m.matchDetails && m.matchDetails.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.matchDetails.slice(0, 6).map((d, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{d.skillName}</Badge>
                        ))}
                        {m.matchDetails.length > 6 && (
                          <span className="text-[10px] text-muted-foreground">+{m.matchDetails.length - 6}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
