import React from 'react'
import type { DashboardStats } from '../types'
import { RefreshIcon } from '../components/Icons'

interface DashboardProps {
  stats: DashboardStats
  onRefresh: () => void
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, onRefresh }) => {
  return (
    <div className="view-transition space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL OPEN POs" value={stats.totalPOs} accent="border-l-mac-accent" />
        <StatCard label="DISCREPANCIES" value={stats.discrepancies} accent="border-l-red-500" />
        <StatCard label="LATE SHIPMENTS" value={stats.lateShipments} accent="border-l-orange-500" />
        <StatCard
          label="LAST SYNC"
          value={stats.lastSync ?? '—'}
          accent="border-l-slate-300"
          valueClassName="text-sm font-mono"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 text-sm">Recent Activity</h3>
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-mac-accent hover:bg-blue-50 rounded-lg transition-colors"
            >
              <RefreshIcon className="w-4 h-4" />
              REFRESH
            </button>
          </div>
          <div className="p-8 text-center text-slate-400 text-sm">
            <p className="mb-1">No sync runs yet.</p>
            <p className="text-xs text-slate-300">
              Kick off the Wabtec SCC scraper to populate this view.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm">Data Sources</h3>
          </div>
          <div className="p-5 space-y-4 text-sm">
            <SourceRow name="Wabtec SCC" status="ready" />
            <SourceRow name="Made2Manage (M2M)" status="ready" />
            <SourceRow name="UniPoint" status="ready" />
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  accent: string
  valueClassName?: string
}

const StatCard: React.FC<StatCardProps> = ({ label, value, accent, valueClassName }) => (
  <div className={`bg-white p-5 rounded-xl border-l-4 ${accent} shadow-sm`}>
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
    <div className={valueClassName || 'text-3xl font-bold text-slate-800 mt-1'}>{value}</div>
  </div>
)

interface SourceRowProps {
  name: string
  status: 'ready' | 'syncing' | 'error'
}

const SourceRow: React.FC<SourceRowProps> = ({ name, status }) => {
  const dotColor =
    status === 'ready' ? 'bg-green-500' : status === 'syncing' ? 'bg-blue-500' : 'bg-red-500'
  const label = status === 'ready' ? 'Ready' : status === 'syncing' ? 'Syncing' : 'Error'
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-700 font-medium">{name}</span>
      <span className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs text-slate-500 uppercase tracking-wide font-bold">{label}</span>
      </span>
    </div>
  )
}
