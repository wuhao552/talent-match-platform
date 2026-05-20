import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { documentApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function ResumeUpload() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.pdf') || f.name.endsWith('.doc') || f.name.endsWith('.docx'))) {
      setFile(f)
    } else {
      toast.error('请上传 PDF 或 DOC/DOCX 格式文件')
    }
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      const res = await documentApi.upload(file, 'resume')
      toast.success('简历上传成功，正在解析...')
      navigate(`/graph/${res.data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (user?.role !== 'individual') {
    return (
      <Alert variant="destructive">
        <AlertDescription>仅个人用户可上传简历</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">上传简历</h1>
        <p className="text-muted-foreground">
          上传您的简历文件，系统将自动解析并提取技能标签
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选择文件</CardTitle>
          <CardDescription>支持 PDF、DOC、DOCX 格式，大小不超过 10MB</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
          >
            {file ? (
              <div className="text-center">
                <p className="text-lg font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setFile(null)}
                >
                  重新选择
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-4xl font-bold text-muted-foreground">PDF/DOCX</p>
                <p className="text-lg font-medium">拖拽文件到此处</p>
                <p className="text-sm text-muted-foreground">或点击下方按钮选择文件</p>
                <label className="mt-4 cursor-pointer">
                  <Button variant="outline">
                    <span>选择文件</span>
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) setFile(f)
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {file && (
            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  上传并解析中...
                </span>
              ) : (
                '上传并解析'
              )}
            </Button>
          )}

          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">PDF</Badge>
            <Badge variant="outline">DOC</Badge>
            <Badge variant="outline">DOCX</Badge>
            <span className="flex items-center">支持以上格式</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">解析说明</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>系统将自动提取简历中的技能标签</li>
            <li>解析结果将用于构建您的个人能力图谱</li>
            <li>能力图谱将用于匹配最适合您的职位</li>
            <li>支持的技能涵盖 314 个专业领域</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
