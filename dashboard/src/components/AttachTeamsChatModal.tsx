import React, { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  addTeams,
  listGraphChats,
  type AttachedTeamsChat,
} from '../services/poCollaboration'

interface Props {
  poNumber: string
  currentUser: string
  onClose: () => void
  onAttached: () => void
}

// Lists the user's recent Teams chats (1:1 + group), with a client-side
// filter box. Graph's /me/chats endpoint doesn't support $search, so we
// filter the page locally — fine for typical inbox sizes (<200 chats).
export const AttachTeamsChatModal: React.FC<Props> = ({
  poNumber,
  currentUser,
  onClose,
  onAttached,
}) => {
  const { instance, accounts } = useMsal()
  const account = accounts[0]

  const [chats, setChats] = useState<AttachedTeamsChat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState(poNumber)

  useEffect(() => {
    if (!account) return
    setLoading(true)
    setError(null)
    listGraphChats(instance, account)
      .then(setChats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => {
      if (c.topic.toLowerCase().includes(q)) return true
      if (c.participants.some((p) => p.toLowerCase().includes(q))) return true
      if (c.bodyPreview && c.bodyPreview.toLowerCase().includes(q)) return true
      return false
    })
  }, [chats, filter])

  const handleAttach = (chat: AttachedTeamsChat) => {
    addTeams(poNumber, chat, currentUser)
    onAttached()
    onClose()
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
            PO <span className="font-mono font-bold">{poNumber}</span> — pick a chat from your Teams
          </p>
        </div>

        <div className="p-6 space-y-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by topic, participant, or message text…"
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none text-sm"
          />

          {loading && (
            <div className="text-center py-6 text-sm text-slate-500">Loading chats…</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-6 text-sm text-slate-500">
              No matching chats. Showing {chats.length} most recent.
            </div>
          )}

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {filtered.map((c) => (
              <button
                key={c.chatId}
                onClick={() => handleAttach(c)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-bold text-slate-800 truncate">{c.topic}</div>
                  {c.lastDate && (
                    <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                      {fmtShort(c.lastDate)}
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
              </button>
            ))}
          </div>
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

const fmtShort = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
