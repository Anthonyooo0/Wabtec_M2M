import React, { useEffect } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'warning' | 'error'
  onClose: () => void
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const id = setTimeout(onClose, 4000)
    return () => clearTimeout(id)
  }, [onClose])

  const dot =
    type === 'success' ? 'bg-green-500'
    : type === 'warning' ? 'bg-amber-500'
    : 'bg-red-500'

  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-zinc-900 text-zinc-100 pl-3 pr-4 py-2.5 rounded-md shadow-lg text-[13px] font-medium max-w-sm flex items-center gap-2.5 border border-zinc-800">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
      <span className="leading-snug">{message}</span>
      <button
        onClick={onClose}
        className="ml-1 -mr-1 p-1 text-zinc-400 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
