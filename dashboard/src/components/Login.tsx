import React, { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { loginRequest, ALLOWED_DOMAINS } from '../authConfig'

interface LoginProps {
  onLogin: (email: string) => void
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const { instance, accounts, inProgress } = useMsal()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (inProgress === 'none' && accounts.length > 0) {
      const email = accounts[0].username?.toLowerCase() || ''
      const domain = email.split('@')[1]
      if (ALLOWED_DOMAINS.includes(domain)) {
        onLogin(email)
      } else {
        setError(`Access restricted to ${ALLOWED_DOMAINS.join(' / ')} accounts.`)
        instance.logoutRedirect()
      }
    }
  }, [accounts, inProgress, instance, onLogin])

  const handleSignIn = () => {
    setError(null)
    instance.loginRedirect(loginRequest).catch((e) => setError(e.message))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="bg-white border border-zinc-200 rounded-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <img src="/mac_logo.png" alt="MAC" className="w-12 h-12 mx-auto mb-4 object-contain" />
          <h1 className="text-[18px] font-semibold text-zinc-900 tracking-tight">Wabtec SCC Portal</h1>
          <p className="text-[13px] text-zinc-500 mt-1">Sign in with your MAC Products account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-white border border-red-200 text-[12px] text-red-700 flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleSignIn}
          className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-[13px] py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>

        {import.meta.env.DEV && (
          <button
            onClick={() => onLogin('dev@macproducts.net')}
            className="mt-3 w-full text-[11px] text-zinc-500 hover:text-zinc-700 py-2 border border-dashed border-zinc-200 rounded-md transition-colors"
          >
            Dev bypass · dev@macproducts.net
          </button>
        )}

        <div className="mt-8 pt-5 border-t border-zinc-100 text-center">
          <p className="text-[10px] text-zinc-400 tracking-tight">
            MAC Products internal system
          </p>
        </div>
      </div>
    </div>
  )
}
