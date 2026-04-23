import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser'
import { graphChatReadRequest } from '../authConfig'

// All collaboration around a PO lives in a single per-PO timeline of
// entries. Each entry is one of: a chat message, an email attachment, an
// image attachment, or a Teams chat attachment. Storing them as one
// chronological list (rather than separate buckets) means the drawer can
// render a single timeline without merging/sorting at read time.
export type TimelineEntryKind = 'message' | 'email' | 'image' | 'teams'

export interface AttachedEmailRef {
  conversationId: string
  latestMessageId: string
  subject: string
  fromName: string
  fromAddress: string
  latestDate: string
  bodyPreview: string
}

export interface AttachedImage {
  // Base64 data URL — fine for small images, swap to Azure Blob URL later
  // without changing this shape.
  dataUrl: string
  mimeType: string
  sizeBytes: number
  name: string
}

export interface AttachedTeamsChat {
  chatId: string
  topic: string
  participants: string[]
  lastDate: string
  bodyPreview?: string
  webUrl?: string
}

export interface TimelineEntry {
  id: string
  poNumber: string
  kind: TimelineEntryKind
  createdBy: string
  createdAt: string
  body?: string
  email?: AttachedEmailRef
  image?: AttachedImage
  teams?: AttachedTeamsChat
}

const STORAGE_KEY = 'wabtec-po-collab-v1'
type StorageShape = Record<string, TimelineEntry[]>

const readAll = (): StorageShape => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StorageShape) : {}
  } catch {
    return {}
  }
}

const writeAll = (data: StorageShape): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    // Most likely cause: quota exceeded after enough images. Surface to
    // the caller so the UI can show a "storage full" toast instead of
    // silently dropping the write.
    throw new Error(`Failed to persist PO collaboration: ${e instanceof Error ? e.message : e}`)
  }
}

const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const getTimeline = (poNumber: string): TimelineEntry[] => {
  const key = (poNumber || '').trim()
  if (!key) return []
  const all = readAll()
  return [...(all[key] || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

const append = (entry: TimelineEntry): void => {
  const all = readAll()
  const key = entry.poNumber.trim()
  all[key] = [...(all[key] || []), entry]
  writeAll(all)
}

export const addMessage = (poNumber: string, body: string, createdBy: string): TimelineEntry => {
  const entry: TimelineEntry = {
    id: newId(),
    poNumber: poNumber.trim(),
    kind: 'message',
    createdBy,
    createdAt: new Date().toISOString(),
    body,
  }
  append(entry)
  return entry
}

export const addEmail = (
  poNumber: string,
  email: AttachedEmailRef,
  createdBy: string,
): TimelineEntry => {
  const entry: TimelineEntry = {
    id: newId(),
    poNumber: poNumber.trim(),
    kind: 'email',
    createdBy,
    createdAt: new Date().toISOString(),
    email,
  }
  append(entry)
  return entry
}

export const addImage = (
  poNumber: string,
  image: AttachedImage,
  createdBy: string,
): TimelineEntry => {
  const entry: TimelineEntry = {
    id: newId(),
    poNumber: poNumber.trim(),
    kind: 'image',
    createdBy,
    createdAt: new Date().toISOString(),
    image,
  }
  append(entry)
  return entry
}

export const addTeams = (
  poNumber: string,
  teams: AttachedTeamsChat,
  createdBy: string,
): TimelineEntry => {
  const entry: TimelineEntry = {
    id: newId(),
    poNumber: poNumber.trim(),
    kind: 'teams',
    createdBy,
    createdAt: new Date().toISOString(),
    teams,
  }
  append(entry)
  return entry
}

export const removeEntry = (poNumber: string, entryId: string): void => {
  const all = readAll()
  const key = poNumber.trim()
  all[key] = (all[key] || []).filter((e) => e.id !== entryId)
  writeAll(all)
}

// Cap on a single image attachment to keep localStorage healthy. ~5MB
// total budget across all keys is the conservative browser default; we
// allow up to ~1MB per image so a PO can hold a handful before pressure.
export const MAX_IMAGE_BYTES = 1_000_000

export async function fileToImageAttachment(file: File): Promise<AttachedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${Math.round(file.size / 1024)}KB > ${MAX_IMAGE_BYTES / 1024}KB cap)`)
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
  return {
    dataUrl,
    mimeType: file.type,
    sizeBytes: file.size,
    name: file.name,
  }
}

// ---- Teams Graph integration ------------------------------------------------

interface GraphChat {
  id: string
  topic: string | null
  chatType: 'oneOnOne' | 'group' | 'meeting'
  webUrl?: string
  lastUpdatedDateTime?: string
  members?: { displayName?: string; email?: string }[]
}

interface GraphChatLastMessagePreview {
  body?: { content?: string; contentType?: string }
  from?: { user?: { displayName?: string } }
  createdDateTime?: string
}

async function acquireChatToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const r = await instance.acquireTokenSilent({ ...graphChatReadRequest, account })
    return r.accessToken
  } catch {
    const r = await instance.acquireTokenPopup(graphChatReadRequest)
    return r.accessToken
  }
}

// Strip basic HTML so the snippet shown in the picker isn't a wall of <p> tags.
const stripHtml = (s: string): string =>
  s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function listGraphChats(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<AttachedTeamsChat[]> {
  const token = await acquireChatToken(instance, account)
  // $expand=members so the picker can show participants without a per-chat
  // round trip. lastMessagePreview gives a snippet for context. Cap the
  // page size — most users have <200 chats, more than enough.
  const url = new URL('https://graph.microsoft.com/v1.0/me/chats')
  url.searchParams.set('$expand', 'members,lastMessagePreview')
  url.searchParams.set('$top', '50')
  url.searchParams.set('$orderby', 'lastUpdatedDateTime desc')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph chats fetch failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { value: (GraphChat & { lastMessagePreview?: GraphChatLastMessagePreview })[] }
  return (data.value || []).map((c) => {
    const participants = (c.members || [])
      .map((m) => m.displayName || m.email || '')
      .filter(Boolean)
    const lastMsg = c.lastMessagePreview
    const lastBody = lastMsg?.body?.content || ''
    const preview = lastMsg?.body?.contentType === 'html' ? stripHtml(lastBody) : lastBody
    return {
      chatId: c.id,
      topic: c.topic || (participants.length > 0 ? participants.slice(0, 3).join(', ') : '(unnamed chat)'),
      participants,
      lastDate: lastMsg?.createdDateTime || c.lastUpdatedDateTime || '',
      bodyPreview: preview ? preview.slice(0, 220) : undefined,
      webUrl: c.webUrl,
    }
  })
}
