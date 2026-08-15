import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { aiAssistantApi, parseSseStream } from '@/services/api'
import { MessageSquare, Send, Sparkles, AlertCircle, Loader2 } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 预设提问:企业(HR 视角)与个人(候选人视角)不同 */
const SUGGESTIONS: Record<'individual' | 'enterprise', string[]> = {
  individual: [
    '这份工作的核心要求是什么？我的匹配度怎么样？',
    '和这个岗位相比，我最大的差距在哪里？该怎么补？',
    '面试这个岗位，我应该重点准备哪些内容？',
  ],
  enterprise: [
    '这个候选人最缺什么？多久能上手？',
    '相比其他候选人，他有什么独特优势？',
    '如果录用，建议先安排哪些培训？',
  ],
}

/**
 * 智能问答助手面板 — 绑定到单个匹配记录上下文,
 * 嵌入在匹配结果页右侧使用(高度由父容器控制,内部消息区滚动)。
 */
export function MatchChatPanel({ matchId }: { matchId: string }) {
  const { user } = useAuth()
  const isIndividual = user?.role === 'individual'
  const suggestions = SUGGESTIONS[isIndividual ? 'individual' : 'enterprise']
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // 只滚动面板内部的消息列表,不要用 scrollIntoView——
    // 它会级联滚动所有可滚动祖先,导致整个页面跟着向下滚动
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamText])

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || streaming || !matchId) return
    setInput('')
    setError(null)
    setStreamText('')

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setStreaming(true)

    try {
      const res = await aiAssistantApi.chatStream({
        contextType: 'match',
        contextId: matchId,
        messages: newMessages,
      })

      let acc = ''
      for await (const ev of parseSseStream(res)) {
        if (ev.event === 'chunk') {
          const data = ev.data as { token?: string }
          if (data?.token) {
            acc += data.token
            setStreamText(acc)
          }
        } else if (ev.event === 'result') {
          const data = ev.data as { reply?: string }
          if (data?.reply && !acc) {
            acc = data.reply
            setStreamText(acc)
          }
        } else if (ev.event === 'error') {
          const data = ev.data as { message?: string }
          setError(data?.message || '请求失败')
        }
      }

      if (acc) {
        setMessages([...newMessages, { role: 'assistant', content: acc }])
      }
      setStreamText('')
    } catch (err) {
      setError((err as Error).message || '请求失败')
    } finally {
      setStreaming(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2 border-b shrink-0">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          智能问答助手
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {isIndividual
            ? '站在候选人视角，聊聊你和这个岗位的匹配与准备'
            : '站在 HR 视角，深入分析这位候选人'}
        </p>
      </CardHeader>

      <CardContent ref={listRef} className="flex-1 overflow-auto p-3 space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle className="inline-block h-3.5 w-3.5 mr-1" />
            {error}
          </div>
        )}

        {messages.length === 0 && !streaming && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
            针对这次匹配，可以问我：
            <div className="mt-3 space-y-1.5 text-left">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={streaming}
                  className="w-full rounded border px-2.5 py-2 text-xs text-left text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary hover:border-primary/40 disabled:opacity-50"
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted whitespace-pre-wrap break-words">
                {streamText || (
                  <span className="inline-flex items-center text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    思考中...
                  </span>
                )}
                {streamText && <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse" />}
              </div>
            </div>
          )}
      </CardContent>

      <div className="border-t p-2.5 flex gap-2 items-end shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="基于当前匹配提问（Enter 发送，Shift+Enter 换行）..."
          rows={1}
          className="resize-none max-h-32 min-h-[40px]"
          disabled={streaming || !matchId}
        />
        <Button
          onClick={() => send()}
          disabled={streaming || !matchId || !input.trim()}
          size="icon"
          className="h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
