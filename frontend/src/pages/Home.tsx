import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export function Home() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="py-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          AI 智能匹配与能力图谱系统
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          基于自然语言处理与知识图谱技术，实现简历与职位要求的深度结构化解析、
          能力可视化与智能推荐，提升人才匹配的效率与精准度。
        </p>
        {!isAuthenticated && (
          <div className="mt-8 flex justify-center gap-4">
            <Button size="lg">
              <Link to="/register">立即注册</Link>
            </Button>
            <Button size="lg" variant="outline">
              <Link to="/login">登录</Link>
            </Button>
          </div>
        )}
        {isAuthenticated && (
          <div className="mt-8">
            <Button size="lg">
              <Link to="/dashboard">进入仪表盘</Link>
            </Button>
          </div>
        )}
      </section>

      <Separator />

      {/* Feature Cards */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-semibold">核心功能</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">文档智能解析</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                支持 DOC、PDF 格式的简历与职位描述自动解析，提取关键信息并结构化入库。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">能力图谱构建</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                基于解析数据自动构建个人能力图谱与职位能力图谱，可视化展示能力结构。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">智能双向匹配</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                人才与职位双向智能推荐，提供匹配度评分与详细依据，提升招聘效率。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">知识图谱分析</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                基于 10 万+ 招聘数据构建的技能共现知识图谱，洞察技能需求趋势。
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Stats */}
      <section className="rounded-lg bg-muted p-8">
        <div className="grid gap-6 text-center md:grid-cols-3">
          <div>
            <p className="text-3xl font-bold text-primary">314</p>
            <p className="text-sm text-muted-foreground">技能节点</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">60,804</p>
            <p className="text-sm text-muted-foreground">技能共现关系</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">5</p>
            <p className="text-sm text-muted-foreground">分析粒度</p>
          </div>
        </div>
      </section>

      {/* Role Info */}
      <section>
        <h2 className="mb-4 text-center text-2xl font-semibold">适用角色</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>个人用户</CardTitle>
                <Badge variant="secondary">求职者</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>上传简历，自动提取技能标签</li>
                <li>生成个人能力图谱，直观了解自身优势</li>
                <li>智能推荐匹配职位，查看匹配度评分</li>
                <li>了解技能需求趋势，指导职业发展</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>企业用户</CardTitle>
                <Badge variant="secondary">招聘方</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>上传职位描述，自动提取技能要求</li>
                <li>构建职位能力图谱，明确岗位画像</li>
                <li>智能推荐高分候选人，查看匹配依据</li>
                <li>批量管理职位与候选人匹配</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
