import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { messageApi } from '@/services/api'
import type { ConversationListItem, Message } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, MessageCircle, MessageSquare, Send } from 'lucide-react'

export function Messages() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [selectedId, setSelectedId] = useState(searchParams.get('conv') || '')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const res = await messageApi.listConversations()
      setConversations(res.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载会话失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async () => {
    if (!selectedId) return
    try {
      const res = await messageApi.getMessages(selectedId, { size: 100 })
      setMessages(res.data.items)
      const convRes = await messageApi.listConversations()
      setConversations(convRes.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载消息失败')
    }
  }, [selectedId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次进入拉取会话列表
    loadConversations()
  }, [loadConversations])
  useEffect(() => {
    const urlConv = searchParams.get('conv')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步 URL 中的会话参数
    if (urlConv && urlConv !== selectedId) setSelectedId(urlConv)
  }, [searchParams, selectedId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换会话时拉取消息
    if (selectedId) loadMessages()
  }, [selectedId, loadMessages])

  useEffect(() => {
    const t = setInterval(() => {
      loadConversations()
      if (selectedId) loadMessages()
    }, 5000)
    return () => clearInterval(t)
  }, [selectedId, loadConversations, loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !selectedId) return
    setSending(true)
    const content = input.trim()
    setInput('')
    try {
      await messageApi.sendMessage({ conversationId: selectedId, content })
      await loadMessages()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败')
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const selectConv = (id: string) => {
    setSelectedId(id)
    setSearchParams({ conv: id })
  }

  const closeConversation = () => {
    setSelectedId('')
    setSearchParams({})
  }

  const selectedConv = conversations.find((c) => c.id === selectedId)

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
      <PageHeader title="消息中心" description="与招聘方或候选人保持沟通" icon={MessageSquare} />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* 会话列表 */}
        <Card className={`w-full shrink-0 overflow-hidden md:w-72 ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex h-12 items-center justify-between border-b px-4">
            <span className="text-sm font-semibold">会话</span>
            <span className="text-xs tabular-nums text-muted-foreground">{conversations.length} 个</span>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载中...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center text-muted-foreground">
                <MessageCircle className="size-8 opacity-30" />
                <p className="mt-2 text-sm">暂无会话</p>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConv(c.id)}
                  className={`flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 ${
                    selectedId === c.id ? 'bg-primary-soft' : ''
                  }`}
                >
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {(c.otherUser?.username || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.otherUser?.username || '未知用户'}</span>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.unread > 99 ? '99+' : c.unread}
                        </span>
                      )}
                    </span>
                    {c.otherUser?.companyName && (
                      <span className="block truncate text-xs text-muted-foreground">{c.otherUser.companyName}</span>
                    )}
                    {c.lastMessage && (
                      <span className="mt-1 block truncate text-xs text-muted-foreground/80">{c.lastMessage.content}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* 聊天区 */}
        <Card className={`min-h-0 flex-1 flex-col ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {selectedId && selectedConv ? (
            <>
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={closeConversation}>
                  <ArrowLeft className="size-4" />
                </Button>
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {(selectedConv.otherUser?.username || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedConv.otherUser?.username || '未知用户'}</p>
                  {selectedConv.otherUser?.companyName && (
                    <p className="truncate text-xs text-muted-foreground">{selectedConv.otherUser.companyName}</p>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">暂无消息，发送第一条消息吧</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderId === user?.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                          mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card text-foreground'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={`mt-1 text-right text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                            {new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="shrink-0 border-t p-3">
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="输入消息，按 Enter 发送..."
                    disabled={sending}
                    className="h-10"
                  />
                  <Button className="h-10" onClick={handleSend} disabled={sending || !input.trim()} aria-label="发送消息">
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquare className="size-12 opacity-30" />
              <p className="text-sm">选择左侧会话开始聊天</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
