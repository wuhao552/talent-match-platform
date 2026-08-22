import { useEffect, useMemo, useState } from 'react'
import { applicationApi } from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Document } from '@/types'

/**
 * 投递岗位弹窗(岗位详情页与匹配结果页共用):
 * 选择简历 + 可选求职信,提交后回调 onApplied。
 */
export function ApplyDialog({
  open,
  jobId,
  resumes,
  defaultResumeId,
  onClose,
  onApplied,
}: {
  open: boolean
  jobId: string
  resumes: Document[]
  defaultResumeId?: string
  onClose: () => void
  onApplied: () => void
}) {
  const [resumeDocId, setResumeDocId] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Base UI Select 需要 items 才能把 value 解析为 label，否则下拉框显示原始 id
  const resumeItems = useMemo(
    () => Object.fromEntries(resumes.map((r) => [r.id, r.originalFilename])),
    [resumes],
  )

  useEffect(() => {
    if (open) {
      // 优先用当前匹配关联的简历,否则默认第一份
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时按上下文重置表单
      setResumeDocId(
        (defaultResumeId && resumes.some((r) => r.id === defaultResumeId)
          ? defaultResumeId
          : resumes[0]?.id) || '',
      )
      setCoverLetter('')
    }
  }, [open, resumes, defaultResumeId])

  const submit = async () => {
    if (!resumeDocId) { toast.error('请选择简历'); return }
    setSubmitting(true)
    try {
      await applicationApi.create({ jobId, resumeDocId, coverLetter: coverLetter || undefined })
      toast.success('投递成功')
      onApplied()
    } catch (e) {
      toast.error((e as Error)?.message || '投递失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>投递岗位</DialogTitle>
          <DialogDescription>选择一份已解析的简历，系统会附带 AI 匹配结果供招聘方参考。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">选择简历 *</label>
            {resumes.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无已解析的简历,请先上传简历</p>
            ) : (
              <Select value={resumeDocId} onValueChange={(v) => setResumeDocId(v || '')} items={resumeItems}>
                <SelectTrigger><SelectValue placeholder="选择简历" /></SelectTrigger>
                <SelectContent>
                  {resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.originalFilename}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">求职信（可选）</label>
            <Textarea rows={4} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="简单介绍您的优势..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={submitting || resumes.length === 0}>
            {submitting ? '投递中...' : '确认投递'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
