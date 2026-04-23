import React, { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  addTeams,
  listChatMessages,
  listGraphChats,
  type AttachedTeamsChat,
  type GraphChatMessage,
} from '../services/poCollaboration'

interface Props {
  poNumber: string
  currentUser: string
  onClose: () => void
  onAttached: () => void
}

// Two-step picker:
//   Step 1 — pick a chat (1:1 or group). Filterable by topic, participant,
//            or last-message snippet.
//   Step 2 — pick a specific message inside that chat, OR attach the whole
//            chat. Step 2 is only mounted after the user clicks a chat in
//            step 1, so we don't pre-fetch every chat's messages.
export const AttachTeamsChatModal: React.FC<Props> = ({
  poNumber,
  currentUser,
  onClose,
  onAttached,
}) => {
  const { instance, accounts } = useMsal()
  const account = accounts[0]

  const [chats, setChats] = useState<AttachedTeamsChat[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)
  const [chatsError, setChatsError] = useState<string | null>(null)
  const [filter, setFilter] = useState(poNumber)
  const [activeChat, setActiveChat] = useState<AttachedTeamsChat | null>(null)

  useEffect(() => {
    if (!account) return
    setChatsLoading(true)
    setChatsError(null)
    listGraphChats(instance, account)
      .then(setChats)
      .catch((e) => setChatsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setChatsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredChats = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(
      (c) =>
        c.topic.toLowerCase().includes(q) ||
        c.participants.some((p) => p.toLowerCase().includes(q)) ||
        (c.bodyPreview && c.bodyPreview.toLowerCase().includes(q)),
    )
  }, [chats, filter])

  const attachWholeChat = (chat: AttachedTeamsChat) => {
    addTeams(poNumber, chat, currentUser)
    onAttached()
    onClose()
  }

  const persistMessage = (chat: AttachedTeamsChat, message: GraphChatMessage): void => {
    const fromName =
      message.from?.user?.displayName || message.from?.application?.displayName || 'Unknown'
    const body = message.body?.content || ''
    const text = message.body?.contentType === 'html' ? stripHtml(body) : body
    addTeams(
      poNumber,
      {
        ...chat,
        messageId: message.id,
        messageFromName: fromName,
        messageDate: message.createdDateTime,
        messageBody: text,
      },
      currentUser,
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-mac-navy text-white px-6 py-4 rounded-t-xl">
          <h2 className="text-xl font-bold">Attach Teams Chat</h2>
          <p className="text-blue-200 text-sm">
            PO <span className="font-mono font-bold">{poNumber}</span>
            {' — '}
            {activeChat ? `pick a message from "${activeChat.topic}"` : 'pick a chat from your Teams'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {!activeChat && (
            <ChatList
              loading={chatsLoading}
              error={chatsError}
              chats={chats}
              filtered={filteredChats}
              filter={filter}
              setFilter={setFilter}
              onPickChat={(c) => setActiveChat(c)}
              onAttachWholeChat={attachWholeChat}
            />
          )}

          {activeChat && account && (
            <MessageList
              chat={activeChat}
              instance={instance}
              account={account}
              onBack={() => setActiveChat(null)}
              onAttachWholeChat={() => attachWholeChat(activeChat)}
              onPersistMessage={(m) => persistMessage(activeChat, m)}
              onDone={() => {
                onAttached()
                onClose()
              }}
            />
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const ChatList: React.FC<{
  loading: boolean
  error: string | null
  chats: AttachedTeamsChat[]
  filtered: AttachedTeamsChat[]
  filter: string
  setFilter: (s: string) => void
  onPickChat: (c: AttachedTeamsChat) => void
  onAttachWholeChat: (c: AttachedTeamsChat) => void
}> = ({ loading, error, chats, filtered, filter, setFilter, onPickChat, onAttachWholeChat }) => (
  <>
    <input
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
      placeholder="Filter by topic, participant, or message text…"
      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none text-sm"
    />

    {loading && <div className="text-center py-6 text-sm text-slate-500">Loading chats…</div>}
    {error && (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
    )}
    {!loading && !error && filtered.length === 0 && (
      <div className="text-center py-6 text-sm text-slate-500">
        No matching chats. Showing {chats.length} most recent.
      </div>
    )}

    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
      {filtered.map((c) => (
        <div key={c.chatId} className="px-4 py-3 hover:bg-slate-50 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => onPickChat(c)}
              className="flex-1 text-left min-w-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-bold text-slate-800 truncate">{c.topic}</div>
                {c.lastDate && (
                  <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                    {fmtShortDate(c.lastDate)}
                  </div>
                )}
              </div>
              {c.participants.length > 0 && (
                <div className="text-xs text-slate-600 mt-0.5 truncate">
                  {c.participants.slice(0, 5).join(' · ')}
                  {c.participants.length > 5 && ` +${c.participants.length - 5}`}
                </div>
              )}
              {c.bodyPreview && (
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{c.bodyPreview}</div>
              )}
              <div className="text-[10px] text-mac-accent font-medium mt-1">
                Browse messages →
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAttachWholeChat(c)
              }}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 whitespace-nowrap"
              title="Attach the whole chat (latest message preview only)"
            >
              Attach all
            </button>
          </div>
        </div>
      ))}
    </div>
  </>
)

const MessageList: React.FC<{
  chat: AttachedTeamsChat
  instance: ReturnType<typeof useMsal>['instance']
  account: NonNullable<ReturnType<typeof useMsal>['accounts'][number]>
  onBack: () => void
  onAttachWholeChat: () => void
  onPersistMessage: (m: GraphChatMessage) => void
  onDone: () => void
}> = ({ chat, instance, account, onBack, onAttachWholeChat, onPersistMessage, onDone }) => {
  const [messages, setMessages] = useState<GraphChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Compare against the signed-in user's email so we can mark a "you"
  // badge on their own replies. Email is reliable across tenants;
  // displayName may not be. Fall back to displayName if email is empty.
  const me = useMemo(() => {
    const email = (account.username || '').toLowerCase()
    const name = (account.name || '').toLowerCase()
    return { email, name }
  }, [account])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    listChatMessages(instance, account, chat.chatId)
      .then(setMessages)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.chatId])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return messages
    return messages.filter((m) => {
      const body = m.body?.content || ''
      const text = m.body?.contentType === 'html' ? stripHtml(body) : body
      const fromName = m.from?.user?.displayName || ''
      return text.toLowerCase().includes(q) || fromName.toLowerCase().includes(q)
    })
  }, [messages, filter])

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const attachSelected = () => {
    // Preserve chronological order (oldest first) so the timeline reads
    // naturally when multiple messages land in sequence.
    const picked = messages
      .filter((m) => selected.has(m.id))
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdDateTime).getTime() - new Date(b.createdDateTime).getTime(),
      )
    for (const m of picked) onPersistMessage(m)
    onDone()
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="text-xs font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1"
        >
          ← Back to chats
        </button>
        <button
          onClick={onAttachWholeChat}
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
        >
          Attach whole chat instead
        </button>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter messages by text or sender…"
        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none text-sm"
      />

      {loading && <div className="text-center py-6 text-sm text-slate-500">Loading messages…</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-6 text-sm text-slate-500">
          {messages.length === 0
            ? 'No messages found in this chat.'
            : 'No messages match the filter.'}
        </div>
      )}

      <div className="text-[11px] text-slate-500">
        Click a message to select. Pick as many as you want, then attach them all at once.
      </div>

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
        {filtered.map((m) => {
          const fromName = m.from?.user?.displayName || m.from?.application?.displayName || 'Unknown'
          const body = m.body?.content || ''
          const text = m.body?.contentType === 'html' ? stripHtml(body) : body
          const fromNameLower = fromName.toLowerCase()
          const isMine = (me.name && fromNameLower === me.name) || fromNameLower.includes(me.email)
          const isSelected = selected.has(m.id)
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`w-full text-left px-4 py-3 transition-colors flex gap-3 ${
                isSelected ? 'bg-mac-accent/10' : 'hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(m.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 flex-shrink-0 accent-mac-accent"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs font-bold text-slate-700 truncate flex items-center gap-1.5">
                    {fromName}
                    {isMine && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-mac-accent/15 text-mac-accent">
                        you
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                    {fmtShortDateTime(m.createdDateTime)}
                  </div>
                </div>
                <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap line-clamp-4">
                  {text || '(empty)'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shadow-lg">
          <span className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">{selected.size}</span>{' '}
            message{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg"
            >
              Clear
            </button>
            <button
              onClick={attachSelected}
              className="px-4 py-2 text-sm font-bold text-white bg-mac-accent hover:bg-mac-blue rounded-lg shadow-sm"
            >
              Attach {selected.size}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const fmtShortDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtShortDateTime = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = d
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'a')
    .replace(' PM', 'p')
  return `${date} · ${time}`
}

const stripHtml = (s: string): string =>
  s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
