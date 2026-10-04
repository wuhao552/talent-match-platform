import { FileUpload } from '@/components/FileUpload'

export function JobUpload() {
  return (
    <FileUpload
      mode="multi"
      docType="job_description"
      requiredRole="enterprise"
      title="发布职位"
      description="批量上传职位描述文件，系统将自动解析各职位的技能要求"
    />
  )
}
