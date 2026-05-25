import { FileUpload } from '@/components/FileUpload'

export function ResumeUpload() {
  return (
    <FileUpload
      mode="single"
      docType="resume"
      requiredRole="individual"
      title="上传简历"
      description="上传您的简历文件，系统将自动解析并提取技能标签"
    />
  )
}
