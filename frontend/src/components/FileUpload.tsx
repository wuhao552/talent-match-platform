import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { documentApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { formatSize, ALLOWED_EXTS } from '@/lib/utils'
import { toast } from 'sonner'

interface FileUploadProps {
  mode: 'single' | 'multi'
  docType: 'resume' | 'job_description'
  requiredRole: 'individual' | 'enterprise'
  title: string
  description: string
}

export function FileUpload({ mode, docType, requiredRole, title, description }: FileUploadProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid: File[] = []
    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i]
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
      if (ALLOWED_EXTS.includes(ext)) valid.push(f)
    }
    if (valid.length === 0) {
      toast.error('请上传 PDF、DOC 或 DOCX 格式文件')
      return
    }
    if (mode === 'single') {
      setFiles([valid[0]])
    } else {
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.name + f.size))
        const added = valid.filter((f) => !existing.has(f.name + f.size))
        return [...prev, ...added]
      })
    }
  }, [mode])

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    try {
      if (mode === 'single') {
        const res = await documentApi.upload(files[0], docType)
        toast.success('上传成功，正在解析...')
        navigate(`/graph/${res.data.id}`)
      } else {
        await documentApi.uploadBatch(files, docType)
        toast.success(`成功上传 ${files.length} 个文件，解析中...`)
        navigate('/dashboard')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (user?.role !== requiredRole) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {requiredRole === 'individual' ? '仅个人用户可上传简历' : '仅企业用户可发布职位'}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选择文件</CardTitle>
          <CardDescription>
            {mode === 'multi'
              ? '支持 PDF、DOC、DOCX，单文件 ≤ 10MB，可多选或拖拽文件夹'
              : '支持 PDF、DOC、DOCX 格式，大小不超过 10MB'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
          >
            {files.length > 0 && mode === 'single' ? (
              <div className="text-center">
                <p className="text-lg font-medium">{files[0].name}</p>
                <p className="text-sm text-muted-foreground">{formatSize(files[0].size)}</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFiles([])}>
                  重新选择
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-1 text-3xl font-bold text-muted-foreground">PDF/DOCX</p>
                <p className="text-sm font-medium">
                  {mode === 'multi' ? '拖拽文件或文件夹到此处' : '拖拽文件到此处'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mode === 'multi' ? '或点击下方按钮选择多个文件' : '或点击下方按钮选择文件'}
                </p>
                <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                  选择文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                  multiple={mode === 'multi'}
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </div>

          {mode === 'multi' && files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">已选 <strong>{files.length}</strong> 个文件</p>
                <Button variant="ghost" size="xs" onClick={() => setFiles([])}>清空</Button>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border">
                {files.map((f, i) => (
                  <div key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-5 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatSize(f.size)}</span>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(i)}
                      disabled={uploading}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <Button className="w-full" onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  上传并解析中...
                </span>
              ) : mode === 'multi' ? (
                `上传并解析 ${files.length} 个文件`
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
    </div>
  )
}
