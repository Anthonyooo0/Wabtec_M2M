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
    <div className="min-h-screen flex items-center justify-center bg-mac-light px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <img src="/mac_logo.png" alt="MAC Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800">Wabtec SCC Portal</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in with your MAC Products account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
            {error}
          </div>
        )}

        <button
          onClick={handleSignIn}
          className="w-full bg-[#2F2F2F] hover:bg-[#1F1F1F] text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
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
            className="mt-3 w-full text-xs text-slate-400 hover:text-mac-accent py-2 border border-dashed border-slate-200 rounded-lg"
          >
            Dev bypass → continue as dev@macproducts.net
          </button>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            MAC PRODUCTS INTERNAL SYSTEM
          </p>
        </div>
      </div>
    </div>
  )
}
