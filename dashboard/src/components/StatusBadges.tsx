import React from 'react'
import type { M2MPO } from '../services/m2mData'

// Vercel-style pill: white bg, hairline border, tiny colored dot prefix.
// `lg` keeps the same dot but increases padding/font for hero placements.
const Pill: React.FC<{
  label: string
  dot: string
  size: 'sm' | 'lg'
}> = ({ label, dot, size }) => {
  const sizeClasses =
    size === 'lg'
      ? 'px-3 py-1 text-[12px]'
      : 'px-2 py-0.5 text-[10px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-mauve-6 bg-white text-mauve-12 font-medium ${sizeClasses}`}
    >
      <span className={`${size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export const SCCStatusBadge: React.FC<{ action: string; size?: 'sm' | 'lg' }> = ({
  action,
  size = 'sm',
}) => {
  const raw = (action || '').trim()
  if (!raw) return <span className="text-mauve-9 text-[12px]">—</span>

  const lower = raw.toLowerCase()
  let dot = 'bg-mauve-9'
  if (/cancel|reject/.test(lower)) dot = 'bg-red-500'
  else if (/closed/.test(lower)) dot = 'bg-mauve-9'
  else if (/accept|approv/.test(lower)) dot = 'bg-green-500'
  else if (/pend|await/.test(lower)) dot = 'bg-blue-500'
  else if (/late|bad/.test(lower)) dot = 'bg-amber-500'

  return <Pill label={raw} dot={dot} size={size} />
}

export const M2MStateBadge: React.FC<{ row: M2MPO; size?: 'sm' | 'lg' }> = ({
  row,
  size = 'sm',
}) => {
  if (row.cancelledDate) return <Pill label="Cancelled" dot="bg-red-500" size={size} />
  if (row.closedDate) return <Pill label="Closed" dot="bg-mauve-9" size={size} />
  return <Pill label="Active" dot="bg-blue-500" size={size} />
}

export const fmtIsoDate = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${m}-${d}-${y}`
}
