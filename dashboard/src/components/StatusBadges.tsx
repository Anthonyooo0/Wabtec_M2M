import React from 'react'
import type { M2MPO } from '../services/m2mData'

export const SCCStatusBadge: React.FC<{ action: string; size?: 'sm' | 'lg' }> = ({
  action,
  size = 'sm',
}) => {
  const raw = (action || '').trim()
  if (!raw) return <span className="text-slate-400 text-xs">—</span>

  const lower = raw.toLowerCase()
  let bg = 'bg-slate-100', text = 'text-slate-600', border = 'border-slate-200'

  if (/cancel/.test(lower)) {
    bg = 'bg-red-50'; text = 'text-red-600'; border = 'border-red-200'
  } else if (/reject/.test(lower)) {
    bg = 'bg-red-50'; text = 'text-red-600'; border = 'border-red-200'
  } else if (/closed/.test(lower)) {
    bg = 'bg-slate-100'; text = 'text-slate-600'; border = 'border-slate-200'
  } else if (/accept|approv/.test(lower)) {
    bg = 'bg-green-50'; text = 'text-green-600'; border = 'border-green-200'
  } else if (/pend|await/.test(lower)) {
    bg = 'bg-blue-50'; text = 'text-blue-600'; border = 'border-blue-200'
  } else if (/late|bad/.test(lower)) {
    bg = 'bg-orange-50'; text = 'text-orange-600'; border = 'border-orange-200'
  }

  const sizeClasses =
    size === 'lg'
      ? 'px-4 py-1.5 text-sm'
      : 'px-2 py-0.5 text-[10px]'

  return (
    <span
      className={`${sizeClasses} rounded font-bold uppercase border ${bg} ${text} ${border}`}
    >
      {raw}
    </span>
  )
}

export const M2MStateBadge: React.FC<{ row: M2MPO; size?: 'sm' | 'lg' }> = ({
  row,
  size = 'sm',
}) => {
  const sizeClasses =
    size === 'lg'
      ? 'px-4 py-1.5 text-sm'
      : 'px-2 py-0.5 text-[10px]'

  if (row.cancelledDate) {
    return (
      <span
        className={`${sizeClasses} rounded font-bold uppercase border bg-red-50 text-red-600 border-red-200`}
      >
        Cancelled
      </span>
    )
  }
  if (row.closedDate) {
    return (
      <span
        className={`${sizeClasses} rounded font-bold uppercase border bg-slate-100 text-slate-600 border-slate-200`}
      >
        Closed
      </span>
    )
  }
  return (
    <span
      className={`${sizeClasses} rounded font-bold uppercase border bg-blue-50 text-blue-600 border-blue-200`}
    >
      Active
    </span>
  )
}

export const fmtIsoDate = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${m}-${d}-${y}`
}
