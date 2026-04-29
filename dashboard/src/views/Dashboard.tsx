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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open POs" value={stats.totalPOs} tone="default" />
        <StatCard label="Discrepancies" value={stats.discrepancies} tone="critical" />
        <StatCard label="Late shipments" value={stats.lateShipments} tone="warning" />
        <StatCard label="Last sync" value={stats.lastSync ?? '—'} tone="muted" smallValue />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-mauve-6 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-mauve-6 flex justify-between items-center">
            <h3 className="text-[13px] font-semibold text-mauve-12 tracking-tight">Recent activity</h3>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-mauve-12 hover:text-mauve-12 hover:bg-mauve-3 rounded-md transition-colors"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
          <div className="p-10 text-center">
            <p className="text-[13px] text-mauve-11">No sync runs yet.</p>
            <p className="text-[12px] text-mauve-9 mt-1">
              Kick off the Wabtec SCC scraper to populate this view.
            </p>
          </div>
        </div>

        <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-mauve-6">
            <h3 className="text-[13px] font-semibold text-mauve-12 tracking-tight">Data sources</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
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
  tone: 'default' | 'critical' | 'warning' | 'success' | 'muted'
  smallValue?: boolean
}

const StatCard: React.FC<StatCardProps> = ({ label, value, tone, smallValue }) => {
  const dot =
    tone === 'critical' ? 'bg-red-500'
    : tone === 'warning' ? 'bg-amber-500'
    : tone === 'success' ? 'bg-green-500'
    : tone === 'muted' ? 'bg-mauve-7'
    : 'bg-mauve-9'
  return (
    <div className="bg-white border border-mauve-6 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-[11px] font-medium text-mauve-11 tracking-tight">{label}</span>
      </div>
      <div
        className={
          smallValue
            ? 'text-[13px] text-mauve-12 font-mono'
            : 'text-[28px] font-semibold text-mauve-12 tabular-nums tracking-tight leading-none'
        }
      >
        {value}
      </div>
    </div>
  )
}

interface SourceRowProps {
  name: string
  status: 'ready' | 'syncing' | 'error'
}

const SourceRow: React.FC<SourceRowProps> = ({ name, status }) => {
  const dotColor =
    status === 'ready' ? 'bg-green-500'
    : status === 'syncing' ? 'bg-blue-500'
    : 'bg-red-500'
  const label = status === 'ready' ? 'Ready' : status === 'syncing' ? 'Syncing' : 'Error'
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-mauve-12">{name}</span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-[11px] text-mauve-11 font-medium">{label}</span>
      </span>
    </div>
  )
}
