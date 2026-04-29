import React, { useEffect, useState } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { Login } from './components/Login'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { Dashboard } from './views/Dashboard'
import { Comparison } from './views/Comparison'
import { Discrepancies } from './views/Discrepancies'
import { PoAwaitingAcceptance } from './views/PoAwaitingAcceptance'
import { PoHistory } from './views/PoHistory'
import { M2MOrphans } from './views/M2MOrphans'
import { loadWabtecPOs, type WabtecPO } from './services/wabtecData'
import { loadM2MPOs, loadM2MOrphans, diff, isDiscrepancy, type M2MPO, type M2MOrphan, type Discrepancy } from './services/m2mData'
import { loadPoHistory, buildAcceptedDateIndex } from './services/poHistoryData'
import { PoCollaborationProvider } from './contexts/PoCollaborationContext'
import { PoCollaborationDrawer } from './components/PoCollaborationDrawer'
import type { DashboardStats, ViewMode } from './types'

const VERSION = 'V0.1.0'

const App: React.FC = () => {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()

  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [wabtec, setWabtec] = useState<WabtecPO[]>([])
  const [m2m, setM2m] = useState<M2MPO[]>([])
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [acceptedDateByPo, setAcceptedDateByPo] = useState<Map<string, Date>>(new Map())
  const [orphans, setOrphans] = useState<M2MOrphan[]>([])
  const [orphanStats, setOrphanStats] = useState<{ totalM2MWabtec: number; matchedToScc: number }>({ totalM2MWabtec: 0, matchedToScc: 0 })
  const [orphansError, setOrphansError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'warning' | 'error'
  } | null>(null)

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0) {
      setCurrentUser(accounts[0].username?.toLowerCase() || null)
    } else {
      setCurrentUser(null)
    }
  }, [isAuthenticated, accounts])

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load SCC CSV and scraped PO history in parallel. History is a
      // non-fatal enrichment — failing to load it falls back to creation
      // date for the unbooked-days calculation.
      const [w, acceptedIdx] = await Promise.all([
        loadWabtecPOs(),
        loadPoHistory()
          .then(buildAcceptedDateIndex)
          .catch(() => new Map<string, Date>()),
      ])
      setWabtec(w)
      setAcceptedDateByPo(acceptedIdx)

      const uniquePos = [...new Set(w.map((row) => row.poNumber.trim()).filter(Boolean))]
      const m = await loadM2MPOs(uniquePos).catch((e) => {
        throw new Error(`M2M: ${e.message}`)
      })
      setM2m(m)
      setDiscrepancies(diff(w, m, acceptedIdx))
      setLastSync(new Date().toLocaleString())

      // Orphans — non-fatal: a failure here only disables the M2M Orphans tab,
      // doesn't break the main diff. Runs after the main load so we already
      // have the SCC PO list ready as input.
      setOrphansError(null)
      loadM2MOrphans(uniquePos)
        .then((res) => {
          setOrphans(res.orphans)
          setOrphanStats({ totalM2MWabtec: res.totalM2MWabtec, matchedToScc: res.matchedToScc })
        })
        .catch((e) => {
          setOrphansError(e instanceof Error ? e.message : String(e))
        })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setToast({ message: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentUser) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  const handleLogout = async () => {
    await instance.logoutRedirect()
    setCurrentUser(null)
  }

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />
  }

  const stats: DashboardStats = {
    totalPOs: wabtec.length,
    discrepancies: discrepancies.filter((d) => isDiscrepancy(d.kind)).length,
    lateShipments: 0,
    lastSync,
  }

  const viewTitle =
    currentView === 'dashboard'
      ? 'Dashboard'
      : currentView === 'comparison'
        ? 'Wabtec vs M2M Comparison'
        : currentView === 'discrepancies'
          ? 'Discrepancies'
          : currentView === 'awaiting-acceptance'
            ? 'POs Awaiting Acceptance'
            : currentView === 'po-history'
              ? 'PO History'
              : currentView === 'm2m-orphans'
                ? 'M2M Orphans (Not in SCC)'
                : 'Audit Log'

  return (
    <PoCollaborationProvider>
    <div className="flex h-screen overflow-hidden bg-mac-light">
      <Sidebar
        currentUser={currentUser}
        currentView={currentView}
        onViewChange={setCurrentView}
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{viewTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cross-reference Wabtec SCC with Made2Manage to surface data discrepancies.
            </p>
          </div>
          <span className="font-mono text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            {VERSION}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {currentView === 'dashboard' && (
            <Dashboard stats={stats} onRefresh={fetchAll} />
          )}
          {currentView === 'comparison' && (
            <Comparison
              wabtec={wabtec}
              m2m={m2m}
              discrepancies={discrepancies}
              loading={loading}
              error={error}
            />
          )}
          {currentView === 'discrepancies' && (
            <Discrepancies
              items={discrepancies}
              loading={loading}
              error={error}
              acceptedDateByPo={acceptedDateByPo}
            />
          )}
          {currentView === 'awaiting-acceptance' && (
            <PoAwaitingAcceptance items={discrepancies} loading={loading} error={error} />
          )}
          {currentView === 'po-history' && <PoHistory />}
          {currentView === 'm2m-orphans' && (
            <M2MOrphans
              orphans={orphans}
              totalM2MWabtec={orphanStats.totalM2MWabtec}
              matchedToScc={orphanStats.matchedToScc}
              loading={loading}
              error={orphansError}
            />
          )}
          {currentView === 'changelog' && (
            <Placeholder
              title="Audit Log"
              body="Every sync, override, and data change recorded here — Supabase-backed changelog table."
            />
          )}
        </div>
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <PoCollaborationDrawer />
    </div>
    </PoCollaborationProvider>
  )
}

const Placeholder: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="view-transition bg-white rounded-xl border border-slate-200 shadow-sm p-8">
    <h3 className="font-bold text-slate-700 text-lg">{title}</h3>
    <p className="mt-2 text-slate-500 text-sm max-w-2xl">{body}</p>
  </div>
)

export default App
