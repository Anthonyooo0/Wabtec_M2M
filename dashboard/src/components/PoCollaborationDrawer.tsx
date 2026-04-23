import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { usePoCollaboration } from '../contexts/PoCollaborationContext'
import {
  addImage,
  addMessage,
  addEmail,
  fileToImageAttachment,
  getTimeline,
  removeEntry,
  type TimelineEntry,
} from '../services/poCollaboration'
import { AttachEmailModal } from './AttachEmailModal'
import { AttachTeamsChatModal } from './AttachTeamsChatModal'

// Mounted once at the App level. Reads `activePo` from PoCollaborationContext
// — when non-null, slides in from the right and shows the unified timeline
// of messages + attachments for that PO. Closing dismisses cleanly without
// unmounting (animated close not implemented yet — straight cut for now).
export const PoCollaborationDrawer: React.FC = () => {
  const { activePo, closePo, version, bumpVersion } = usePoCollaboration()
  const { accounts } = useMsal()
  const currentUser = accounts[0]?.username || 'unknown'

  const [attachOpen, setAttachOpen] = useState<'email' | 'teams' | null>(null)
  const [draft, setDraft] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Re-read on activePo or version change. version is bumped after every
  // mutation so the drawer stays in sync without lifting timeline state up.
  const timeline: TimelineEntry[] = useMemo(() => {
    if (!activePo) return []
    return getTimeline(activePo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePo, version])

  // Auto-scroll to bottom whenever new entries appear.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [timeline.length, activePo])

  if (!activePo) return null

  const sendMessage = () => {
    const body = draft.trim()
    if (!body) return
    addMessage(activePo, body, currentUser)
    setDraft('')
    bumpVersion()
  }

  const onPickImage = async (file: File | null) => {
    if (!file) return
    setError(null)
    try {
      const img = await fileToImageAttachment(file)
      addImage(activePo, img, currentUser)
      bumpVersion()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop — click to dismiss */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={closePo} />

      {/* Drawer */}
      <aside className="w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <header className="bg-mac-navy text-white px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
              PO Collaboration
            </div>
            <div className="text-xl font-bold font-mono mt-0.5">{activePo}</div>
            <div className="text-xs text-blue-200 mt-0.5">
              {timeline.length} {timeline.length === 1 ? 'entry' : 'entries'} in thread
            </div>
          </div>
          <button
            onClick={closePo}
            aria-label="Close"
            className="text-white/70 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/40">
          {timeline.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-12">
              No messages or attachments yet.
              <br />
              Start the conversation below.
            </div>
          )}
          {timeline.map((e) => (
            <TimelineEntryCard
              key={e.id}
              entry={e}
              onRemove={() => {
                removeEntry(activePo, e.id)
                bumpVersion()
              }}
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border-t border-red-200 px-5 py-2 text-xs text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        <footer className="border-t border-slate-200 bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Write a message…"
              rows={2}
              className="flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none"
            />
            <div className="flex flex-col gap-1">
              <div className="relative">
                <button
                  onClick={() => setPickerOpen((p) => !p)}
                  className="px-2 py-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                  title="Attach"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                {pickerOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    <PickerItem
                      icon={<EnvelopeIcon />}
                      label="Outlook email"
                      onClick={() => {
                        setPickerOpen(false)
                        setAttachOpen('email')
                      }}
                    />
                    <PickerItem
                      icon={<ImageIcon />}
                      label="Image / screenshot"
                      onClick={() => {
                        setPickerOpen(false)
                        fileInputRef.current?.click()
                      }}
                    />
                    <PickerItem
                      icon={<ChatIcon />}
                      label="Teams chat"
                      onClick={() => {
                        setPickerOpen(false)
                        setAttachOpen('teams')
                      }}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={sendMessage}
                disabled={!draft.trim()}
                className="px-3 py-2 text-sm font-bold text-white bg-mac-accent hover:bg-mac-blue rounded-lg shadow-sm disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPickImage(e.target.files?.[0] || null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
          />
        </footer>
      </aside>

      {attachOpen === 'email' && (
        <AttachEmailModal
          poNumber={activePo}
          currentUser={currentUser}
          onClose={() => setAttachOpen(null)}
          onAttached={() => {
            // The legacy AttachEmailModal writes to its own per-PO email
            // store — mirror the most recent attach into the unified
            // timeline so this drawer shows it. Read & dedupe by
            // conversationId to avoid double-counts.
            try {
              const raw = localStorage.getItem('wabtec-po-email-attachments-v1')
              if (raw) {
                const parsed = JSON.parse(raw) as Record<string, { conversationId: string; latestMessageId: string; subject: string; fromName: string; fromAddress: string; latestDate: string; bodyPreview: string }[]>
                const list = parsed[activePo] || []
                if (list.length > 0) {
                  const latest = list[0]
                  const existing = getTimeline(activePo).some(
                    (e) => e.kind === 'email' && e.email?.conversationId === latest.conversationId,
                  )
                  if (!existing) {
                    addEmail(activePo, latest, currentUser)
                  }
                }
              }
            } catch {
              // best-effort; the email is still in its own store
            }
            bumpVersion()
          }}
        />
      )}

      {attachOpen === 'teams' && (
        <AttachTeamsChatModal
          poNumber={activePo}
          currentUser={currentUser}
          onClose={() => setAttachOpen(null)}
          onAttached={() => bumpVersion()}
        />
      )}
    </div>
  )
}

const PickerItem: React.FC<{
  icon: React.ReactNode
  label: string
  onClick: () => void
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
  >
    <span className="text-slate-500 flex-shrink-0">{icon}</span>
    <span>{label}</span>
  </button>
)

const EnvelopeIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const ImageIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
  </svg>
)

const ChatIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)

const TimelineEntryCard: React.FC<{ entry: TimelineEntry; onRemove: () => void }> = ({
  entry,
  onRemove,
}) => {
  const ts = new Date(entry.createdAt)
  const stamp = `${ts.toLocaleDateString()} · ${ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
        <span className="font-medium uppercase tracking-wider">
          {entry.createdBy} · {kindLabel(entry.kind)}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono">{stamp}</span>
          <button
            onClick={onRemove}
            className="text-slate-400 hover:text-red-500 text-xs"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      {entry.kind === 'message' && entry.body && (
        <p className="text-sm text-slate-800 whitespace-pre-wrap">{entry.body}</p>
      )}

      {entry.kind === 'email' && entry.email && (
        <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <EnvelopeIcon />
            <span className="truncate">{entry.email.subject}</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 truncate">
            {entry.email.fromName ? `${entry.email.fromName} · ` : ''}
            {entry.email.fromAddress}
          </div>
          {entry.email.bodyPreview && (
            <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{entry.email.bodyPreview}</div>
          )}
        </div>
      )}

      {entry.kind === 'image' && entry.image && (
        <div>
          <img
            src={entry.image.dataUrl}
            alt={entry.image.name}
            className="rounded-lg border border-slate-200 max-h-72 w-auto"
          />
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {entry.image.name} · {Math.round(entry.image.sizeBytes / 1024)}KB
          </div>
        </div>
      )}

      {entry.kind === 'teams' && entry.teams && (
        <a
          href={entry.teams.webUrl || '#'}
          target="_blank"
          rel="noreferrer"
          className="block border border-slate-200 rounded-lg p-2 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <ChatIcon />
            <span className="truncate">{entry.teams.topic}</span>
          </div>
          {entry.teams.participants.length > 0 && (
            <div className="text-[11px] text-slate-600 mt-0.5 truncate">
              {entry.teams.participants.slice(0, 4).join(' · ')}
            </div>
          )}
          {entry.teams.bodyPreview && (
            <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{entry.teams.bodyPreview}</div>
          )}
          {entry.teams.webUrl && (
            <div className="text-[10px] text-mac-accent mt-1 font-medium">Open in Teams →</div>
          )}
        </a>
      )}
    </div>
  )
}

const kindLabel = (k: TimelineEntry['kind']): string => {
  if (k === 'message') return 'message'
  if (k === 'email') return 'email attached'
  if (k === 'image') return 'image attached'
  if (k === 'teams') return 'teams chat attached'
  return k
}
