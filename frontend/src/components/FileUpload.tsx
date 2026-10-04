import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useDocuments } from '@/hooks/useDocuments'
import { documentApi } from '@/services/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatSize, ALLOWED_EXTS } from '@/lib/utils'
import { toast } from 'sonner'
import { CloudUpload, FileText, Loader2, Upload, X } from 'lucide-react'

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
  const { refresh } = useDocuments()
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
        const existing = new Set(prev.map((f) => `${f.name}-${f.size}`))
        const added = valid.filter((f) => !existing.has(`${f.name}-${f.size}`))
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
        refresh()
        toast.success('上传成功，正在解析...')
        navigate(`/pipeline/${res.data.id}`)
      } else {
        await documentApi.uploadBatch(files, docType)
        refresh()
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
      <div className="page-container">
        <Alert variant="destructive">
          <AlertDescription>
            {requiredRole === 'individual' ? '仅个人用户可上传简历' : '仅企业用户可发布职位'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const isSingleSelected = mode === 'single' && files.length === 1

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} description={description} icon={Upload} />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>上传文档</CardTitle>
          <CardDescription>
            {mode === 'multi'
              ? '支持 PDF / DOC / DOCX，可一次选择多个文件；AI 将逐个解析并生成匹配结果'
              : '支持 PDF / DOC / DOCX 格式，单个文件不超过 10MB'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          {/* Dropzone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center outline-none transition-all focus-visible:ring-3 focus-visible:ring-ring/40 ${
              dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
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

            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              {dragOver ? <CloudUpload className="size-6 animate-bounce" /> : <FileText className="size-6" />}
            </span>

            {isSingleSelected ? (
              <>
                <p className="mt-4 text-sm font-semibold">{files[0].name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatSize(files[0].size)} · 点击可重新选择</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm font-semibold">
                  {dragOver ? '松开鼠标开始上传' : mode === 'multi' ? '拖拽多个文件到此处' : '拖拽文件到此处'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  或 <span className="font-medium text-primary">点击选择文件</span>
                  {mode === 'multi' && '（支持批量）'}
                </p>
              </>
            )}
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  已选择 <span className="font-semibold text-foreground">{files.length}</span> 个文件
                </p>
                <Button variant="ghost" size="sm" onClick={() => setFiles([])} disabled={uploading}>
                  <X className="size-3.5" />
                  清空
                </Button>
              </div>

              <div className="scrollbar-thin max-h-64 space-y-2 overflow-y-auto">
                {files.map((f, i) => (
                  <div key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5">
                    <FileText className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatSize(f.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(i)}
                      disabled={uploading}
                      aria-label={`移除 ${f.name}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <Button className="h-10 w-full" onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  上传并解析中...
                </>
              ) : (
                <>
                  <CloudUpload className="size-4" />
                  {mode === 'multi' ? `上传并解析 ${files.length} 个文件` : '上传并解析'}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
