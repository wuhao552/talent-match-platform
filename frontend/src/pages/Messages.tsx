import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { messageApi } from '@/services/api'
import type { ConversationListItem, Message } from '@/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Send, MessageSquare, ArrowLeft } from 'lucide-react'

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
      // 如果 URL 指定了 conv 且没有选中,自动选中
      const urlConv = searchParams.get('conv')
      if (urlConv && !selectedId) setSelectedId(urlConv)
    } catch (e: any) {
      toast.error(e?.message || '加载会话失败')
    } finally {
      setLoading(false)
    }
  }, [searchParams, selectedId])

  const loadMessages = useCallback(async () => {
    if (!selectedId) return
    try {
      const res = await messageApi.getMessages(selectedId, { size: 100 })
      setMessages(res.data.items)
      // 刷新会话列表(清未读)
      const convRes = await messageApi.listConversations()
      setConversations(convRes.data)
    } catch (e: any) {
      toast.error(e?.message || '加载消息失败')
    }
  }, [selectedId])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { if (selectedId) loadMessages() }, [selectedId, loadMessages])

  // 轮询刷新(5秒)
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
    } catch (e: any) {
      toast.error(e?.message || '发送失败')
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const selectConv = (id: string) => {
    setSelectedId(id)
    setSearchParams({ conv: id })
  }

  const selectedConv = conversations.find((c) => c.id === selectedId)

  return (
    // 固定高度布局:整体占满视口剩余空间,聊天区不随消息数量变化,
    // 消息列表内部滚动,输入框始终固定在底部可见
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6" />消息中心</h1>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* 会话列表 */}
        <Card className="w-72 shrink-0 overflow-hidden flex flex-col">
          <div className="p-3 border-b font-medium text-sm">会话列表</div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">加载中...</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">暂无会话</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConv(c.id)}
                  className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${
                    selectedId === c.id ? 'bg-primary-soft' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {c.otherUser?.username || '未知用户'}
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  {c.otherUser?.companyName && (
                    <p className="text-xs text-muted-foreground truncate">{c.otherUser.companyName}</p>
                  )}
                  {c.lastMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessage.content}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        {/* 聊天区 */}
        <Card className="flex-1 flex flex-col min-h-0">
          {selectedId && selectedConv ? (
            <>
              <div className="flex items-center gap-2 p-3 border-b">
                <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSelectedId('')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium">{selectedConv.otherUser?.username || '未知'}</span>
                {selectedConv.otherUser?.companyName && (
                  <span className="text-sm text-muted-foreground">· {selectedConv.otherUser.companyName}</span>
                )}
              </div>
              <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">暂无消息，发送第一条消息吧</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderId === user?.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                          mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={`text-[10px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                            {new Date(m.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="p-3 border-t flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="输入消息..."
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageSquare className="h-12 w-12 opacity-30" />
              <p>选择左侧会话开始聊天</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
