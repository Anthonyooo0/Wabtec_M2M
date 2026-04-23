import React from 'react'
import { usePoCollaboration } from '../contexts/PoCollaborationContext'

// Renders a PO number as a clickable chip that opens the collaboration
// drawer for that PO. Use this anywhere a PO number appears so the
// "click PO → open thread" interaction is consistent across the app.
//
// Visually subtle by default (just the underline-on-hover) so it doesn't
// turn every table into a sea of links — pass `chip` to get the pill style
// when you want it to read more like a button (e.g. card headers).
export const PoLink: React.FC<{
  poNumber: string
  chip?: boolean
  className?: string
}> = ({ poNumber, chip, className }) => {
  const { openPo } = usePoCollaboration()
  if (!poNumber) return <span className="text-slate-400">—</span>

  const base = chip
    ? 'inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold border border-slate-200 bg-slate-50 text-mac-accent hover:bg-mac-accent hover:text-white transition-colors'
    : 'font-mono text-mac-accent hover:underline cursor-pointer'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openPo(poNumber)
      }}
      className={`${base} ${className || ''}`}
      title={`Open collaboration thread for PO ${poNumber}`}
    >
      {poNumber}
    </button>
  )
}
