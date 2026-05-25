/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 用户管理 - 搜索/筛选/分页/详情弹窗/启用禁用/删除(管理员保护)
 */
import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/services/api'
import type { AdminUser, PaginatedResponse } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'; import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'; import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

const RM: Record<string, string> = { individual: '个人', enterprise: '企业', admin: '管理员' }
const SM: Record<string, string> = { active: '正常', disabled: '禁用' }
const RB: Record<string, 'default' | 'secondary' | 'outline'> = { individual: 'default', enterprise: 'secondary', admin: 'outline' }

export function UserManagement() {
  const [data, setData] = useState<PaginatedResponse<AdminUser> | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [page, setPage] = useState(1); const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AdminUser | null>(null)

  const fetch = useCallback(() => {
    setLoading(true); setError('')
    adminApi.getUsers({ page, pageSize: 20, role, status, search }).then(r => setData(r.data)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [page, role, status, search])
  useEffect(() => { fetch() }, [fetch])

  const handleFilter = () => { setPage(1); fetch() }
  const handleStatus = async (u: AdminUser) => {
    const ns = u.status === 'active' ? 'disabled' : 'active'
    if (!confirm(`确定要${ns === 'disabled' ? '禁用' : '启用'} "${u.username}" 吗？`)) return
    try { await adminApi.updateUserStatus(u.id, ns); toast.success('操作成功'); fetch() } catch (e) { toast.error(e instanceof Error ? e.message : '操作失败') }
  }
  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`确定要删除 "${u.username}" 吗？此操作不可撤销。`)) return
    try { await adminApi.deleteUser(u.id); toast.success('已删除'); fetch() } catch (e) { toast.error(e instanceof Error ? e.message : '删除失败') }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">用户管理</h1><p className="text-muted-foreground">管理系统所有用户</p></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="flex-1 space-y-1" style={{ minWidth: 200 }}><Label className="text-xs">搜索</Label><Input placeholder="用户名或邮箱" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilter()} /></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">角色</Label><Select value={role} onValueChange={v => setRole(v === 'all' ? '' : v)}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="individual">个人</SelectItem><SelectItem value="enterprise">企业</SelectItem><SelectItem value="admin">管理员</SelectItem></SelectContent></Select></div>
        <div className="space-y-1" style={{ width: 140 }}><Label className="text-xs">状态</Label><Select value={status} onValueChange={v => setStatus(v === 'all' ? '' : v)}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="active">正常</SelectItem><SelectItem value="disabled">禁用</SelectItem></SelectContent></Select></div>
        <Button variant="outline" onClick={handleFilter}><Search className="mr-1 h-4 w-4" />搜索</Button>
      </CardContent></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="text-lg">用户列表</CardTitle></CardHeader><CardContent>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.items.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无用户数据</p> : (
          <>
            <Table><TableHeader><TableRow><TableHead>用户名</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead><TableHead>邮箱</TableHead><TableHead>手机</TableHead><TableHead>注册时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>{data.items.map(u => (<TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell><Badge variant={RB[u.role] || 'default'}>{RM[u.role] || u.role}</Badge></TableCell>
                <TableCell><Badge variant={u.status === 'active' ? 'outline' : 'destructive'}>{SM[u.status] || u.status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email || '--'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.phone || '--'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</TableCell>
                <TableCell><div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setDetail(u)}>详情</Button>
                  {u.role !== 'admin' && <><Button variant="ghost" size="sm" onClick={() => handleStatus(u)}>{u.status === 'active' ? '禁用' : '启用'}</Button><Button variant="destructive" size="sm" onClick={() => handleDelete(u)}>删除</Button></>}
                </div></TableCell>
              </TableRow>))}</TableBody>
            </Table>
            <div className="flex items-center justify-between pt-4"><span className="text-sm text-muted-foreground">共 {data.total} 条，{data.page}/{Math.ceil(data.total / data.pageSize)} 页</span>
              <div className="flex gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div>
            </div>
          </>
        )}
      </CardContent></Card>
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent><DialogHeader><DialogTitle>用户详情</DialogTitle><DialogDescription>{detail?.username} 的完整信息</DialogDescription></DialogHeader>
          {detail && <div className="grid grid-cols-2 gap-3 text-sm">
            <div>用户名：{detail.username}</div><div>角色：{RM[detail.role]}</div><div>状态：{SM[detail.status]}</div>
            <div>邮箱：{detail.email || '--'}</div><div>手机：{detail.phone || '--'}</div><div>城市：{detail.city || '--'}</div>
            <div>公司：{detail.companyName || '--'}</div><div>意向城市：{detail.intendedCities?.join(', ') || '--'}</div>
            <div className="col-span-2">注册时间：{new Date(detail.createdAt).toLocaleString('zh-CN')}</div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
