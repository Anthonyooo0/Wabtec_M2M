import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser'
import { graphMailReadRequest } from '../authConfig'

// One Graph message as returned by /me/messages. We only $select the fields
// we actually render — keeps the payload small and avoids burning quota.
export interface GraphMessage {
  id: string
  conversationId: string
  subject: string
  bodyPreview: string
  receivedDateTime: string
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[]
}

// A thread = the newest message per conversationId. We show one row per
// thread in the picker — picking it attaches the conversation as a whole.
export interface EmailThread {
  conversationId: string
  subject: string
  latestMessageId: string
  latestDate: string
  fromName: string
  fromAddress: string
  participants: string[]
  bodyPreview: string
}

// What we actually persist per PO attachment. We store the full body so
// the drawer can show the actual email inline — Graph returns it as
// either plain text or HTML; we keep the contentType so the renderer
// knows how to handle it.
export interface AttachedEmail {
  conversationId: string
  latestMessageId: string
  subject: string
  fromName: string
  fromAddress: string
  latestDate: string
  bodyPreview: string
  bodyContent?: string
  bodyContentType?: 'text' | 'html'
  webLink?: string
  attachedBy: string
  attachedAt: string
}

// LocalStorage key namespace — bumping the suffix is a cheap migration path
// if the shape ever changes.
const STORAGE_KEY = 'wabtec-po-email-attachments-v1'

type StorageShape = Record<string, AttachedEmail[]>

const readAll = (): StorageShape => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StorageShape) : {}
  } catch {
    return {}
  }
}

const writeAll = (data: StorageShape): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export const getAttachedEmails = (poNumber: string): AttachedEmail[] => {
  const key = (poNumber || '').trim()
  if (!key) return []
  return readAll()[key] || []
}

export const attachEmail = (poNumber: string, email: AttachedEmail): void => {
  const key = (poNumber || '').trim()
  if (!key) return
  const all = readAll()
  const existing = all[key] || []
  // Dedupe by conversationId so re-attaching the same thread is a no-op.
  const filtered = existing.filter((e) => e.conversationId !== email.conversationId)
  all[key] = [email, ...filtered]
  writeAll(all)
}

export const detachEmail = (poNumber: string, conversationId: string): void => {
  const key = (poNumber || '').trim()
  if (!key) return
  const all = readAll()
  const existing = all[key] || []
  all[key] = existing.filter((e) => e.conversationId !== conversationId)
  writeAll(all)
}

// Acquire a Graph token via the currently-signed-in MSAL session. Tries
// silent first (cache hit = zero UI), falls back to popup if the cache is
// cold or the Mail.Read scope hasn't been consented yet on this device.
async function acquireGraphToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const result = await instance.acquireTokenSilent({
      ...graphMailReadRequest,
      account,
    })
    return result.accessToken
  } catch {
    const result = await instance.acquireTokenPopup(graphMailReadRequest)
    return result.accessToken
  }
}

// Call Graph's /me/messages search. Grouping by conversationId happens in
// the component — this service just returns the raw messages so a caller
// who needs individual messages can get them.
export async function searchGraphMessages(
  instance: IPublicClientApplication,
  account: AccountInfo,
  query: string,
): Promise<GraphMessage[]> {
  const token = await acquireGraphToken(instance, account)

  // Graph $search requires the string to be quoted and the ConsistencyLevel
  // header set to eventual. $top is capped at 25 to keep the modal lively —
  // if a user's inbox has hundreds of hits we don't need them all.
  const url = new URL('https://graph.microsoft.com/v1.0/me/messages')
  url.searchParams.set('$search', `"${query.replace(/"/g, '\\"')}"`)
  url.searchParams.set(
    '$select',
    'id,conversationId,subject,bodyPreview,receivedDateTime,from,toRecipients',
  )
  url.searchParams.set('$top', '25')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: 'eventual',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph search failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { value: GraphMessage[] }
  return data.value || []
}

// Fetch the full body of one message. Used at attach-time so the drawer
// can render the actual email content instead of just the 255-char preview.
// Returns body content + contentType ('text' | 'html') and the webLink so
// users can pop the message open in Outlook from the drawer.
export async function fetchGraphMessageBody(
  instance: IPublicClientApplication,
  account: AccountInfo,
  messageId: string,
): Promise<{ content: string; contentType: 'text' | 'html'; webLink?: string }> {
  const token = await acquireGraphToken(instance, account)
  const url = new URL(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`)
  url.searchParams.set('$select', 'body,webLink')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph message fetch failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as {
    body?: { content?: string; contentType?: string }
    webLink?: string
  }
  const contentType: 'text' | 'html' = data.body?.contentType === 'html' ? 'html' : 'text'
  return {
    content: data.body?.content || '',
    contentType,
    webLink: data.webLink,
  }
}

// Collapse raw messages into one entry per conversationId, keeping the most
// recent message's metadata as the representative row for display.
export function groupIntoThreads(messages: GraphMessage[]): EmailThread[] {
  const byConv = new Map<string, GraphMessage>()
  for (const m of messages) {
    const existing = byConv.get(m.conversationId)
    if (!existing || new Date(m.receivedDateTime) > new Date(existing.receivedDateTime)) {
      byConv.set(m.conversationId, m)
    }
  }
  return [...byConv.values()]
    .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
    .map((m) => {
      const fromName = m.from?.emailAddress?.name || ''
      const fromAddress = m.from?.emailAddress?.address || ''
      const participants = [
        fromAddress,
        ...(m.toRecipients || []).map((r) => r.emailAddress?.address || ''),
      ].filter(Boolean)
      return {
        conversationId: m.conversationId,
        subject: m.subject || '(no subject)',
        latestMessageId: m.id,
        latestDate: m.receivedDateTime,
        fromName,
        fromAddress,
        participants,
        bodyPreview: m.bodyPreview || '',
      }
    })
}
