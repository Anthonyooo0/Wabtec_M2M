import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Single source of truth for "which PO collaboration drawer is open and
// what's its context." Any view can call openPo(<poNumber>) to surface the
// drawer; the App-level <PoCollaborationDrawer> reads from here.
//
// version is bumped whenever the timeline changes so listeners can re-read
// localStorage without us lifting that state up to the context.

interface Ctx {
  openPo: (poNumber: string) => void
  closePo: () => void
  activePo: string | null
  bumpVersion: () => void
  version: number
}

const PoCollaborationCtx = createContext<Ctx | null>(null)

export const PoCollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePo, setActivePo] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const openPo = useCallback((poNumber: string) => {
    const trimmed = (poNumber || '').trim()
    if (!trimmed) return
    setActivePo(trimmed)
  }, [])

  const closePo = useCallback(() => setActivePo(null), [])

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  const value = useMemo<Ctx>(
    () => ({ openPo, closePo, activePo, bumpVersion, version }),
    [openPo, closePo, activePo, bumpVersion, version],
  )

  return <PoCollaborationCtx.Provider value={value}>{children}</PoCollaborationCtx.Provider>
}

export const usePoCollaboration = (): Ctx => {
  const v = useContext(PoCollaborationCtx)
  if (!v) throw new Error('usePoCollaboration must be used inside PoCollaborationProvider')
  return v
}
