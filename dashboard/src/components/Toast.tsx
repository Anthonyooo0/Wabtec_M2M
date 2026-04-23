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

  const bg =
    type === 'success' ? 'bg-green-600' : type === 'warning' ? 'bg-yellow-500' : 'bg-red-600'

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] ${bg} text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-sm`}
    >
      {message}
    </div>
  )
}
