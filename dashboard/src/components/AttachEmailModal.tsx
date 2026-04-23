import React, { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  attachEmail,
  groupIntoThreads,
  searchGraphMessages,
  type EmailThread,
} from '../services/emailAttachments'

interface AttachEmailModalProps {
  poNumber: string
  currentUser: string
  onClose: () => void
  // Called after a thread is attached so the parent can re-render its
  // list of attached emails without us caring how it stores them.
  onAttached: () => void
}

export const AttachEmailModal: React.FC<AttachEmailModalProps> = ({
  poNumber,
  currentUser,
  onClose,
  onAttached,
}) => {
  const { instance, accounts } = useMsal()
  const account = accounts[0]

  const [query, setQuery] = useState(poNumber)
  const [threads, setThreads] = useState<EmailThread[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState<string | null>(null)

  // Auto-run the first search on mount with the PO number so the user
  // sees results immediately without a redundant click.
  useEffect(() => {
    if (account && poNumber) {
      runSearch(poNumber)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runSearch = async (q: string) => {
    if (!account) {
      setError('Not signed in')
      return
    }
    const trimmed = q.trim()
    if (!trimmed) {
      setThreads([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const messages = await searchGraphMessages(instance, account, trimmed)
      setThreads(groupIntoThreads(messages))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleAttach = (thread: EmailThread) => {
    setAttaching(thread.conversationId)
    try {
      attachEmail(poNumber, {
        conversationId: thread.conversationId,
        latestMessageId: thread.latestMessageId,
        subject: thread.subject,
        fromName: thread.fromName,
        fromAddress: thread.fromAddress,
        latestDate: thread.latestDate,
        bodyPreview: thread.bodyPreview,
        attachedBy: currentUser,
        attachedAt: new Date().toISOString(),
      })
      onAttached()
      onClose()
    } finally {
      setAttaching(null)
    }
  }

  const header = useMemo(
    () => (
      <div className="sticky top-0 bg-mac-navy text-white px-6 py-4 rounded-t-xl">
        <h2 className="text-xl font-bold">Attach Email Thread</h2>
        <p className="text-blue-200 text-sm">
          PO <span className="font-mono font-bold">{poNumber}</span> — searches your Outlook for threads referencing this PO
        </p>
      </div>
    ),
    [poNumber],
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {header}

        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch(query)
              }}
              placeholder="Search your Outlook (PO number, subject, sender…)"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none font-mono text-sm"
            />
            <button
              onClick={() => runSearch(query)}
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white bg-mac-accent hover:bg-mac-blue rounded-lg shadow-sm disabled:opacity-50"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && threads.length === 0 && query && (
            <div className="text-center py-8 text-sm text-slate-500">
              No matching threads found in your mailbox for <span className="font-mono">{query}</span>.
            </div>
          )}

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {threads.map((t) => (
              <button
                key={t.conversationId}
                onClick={() => handleAttach(t)}
                disabled={attaching !== null}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-bold text-slate-800 truncate">{t.subject}</div>
                  <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                    {fmtShort(t.latestDate)}
                  </div>
                </div>
                <div className="text-xs text-slate-600 mt-0.5 truncate">
                  {t.fromName ? `${t.fromName} · ` : ''}{t.fromAddress}
                </div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{t.bodyPreview}</div>
                {attaching === t.conversationId && (
                  <div className="text-[11px] text-mac-accent mt-1 font-medium">Attaching…</div>
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

// Short human-readable date. ISO → "Mar 15, 2026 · 10:42a"
const fmtShort = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'a')
    .replace(' PM', 'p')
  return `${date} · ${time}`
}
