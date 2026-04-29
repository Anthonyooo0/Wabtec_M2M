import React from 'react'
import type { ViewMode } from '../types'
import {
  DashboardIcon,
  CompareIcon,
  AlertIcon,
  HistoryIcon,
  SearchIcon,
  HourglassIcon,
  LogoutIcon,
  ChevronLeftIcon,
} from './Icons'

interface SidebarProps {
  currentUser: string
  currentView: ViewMode
  onViewChange: (view: ViewMode) => void
  onLogout: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const navItems: { id: ViewMode; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'comparison', label: 'Wabtec vs M2M', Icon: CompareIcon },
  { id: 'discrepancies', label: 'Discrepancies', Icon: AlertIcon },
  { id: 'awaiting-acceptance', label: 'PO Awaiting Acceptance', Icon: HourglassIcon },
  { id: 'po-history', label: 'PO History', Icon: SearchIcon },
  { id: 'm2m-orphans', label: 'M2M Orphans', Icon: AlertIcon },
  { id: 'changelog', label: 'Audit Log', Icon: HistoryIcon },
]

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  currentView,
  onViewChange,
  onLogout,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <aside
      className={`sidebar flex flex-col transition-[width] duration-200 flex-shrink-0 text-mauve-7 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand block */}
      <div className="px-4 py-4 border-b border-mauve-12">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 bg-white rounded-md p-1">
            <img src="/mac_logo.png" alt="MAC" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-semibold text-[13px] truncate text-white tracking-tight">Wabtec SCC</h1>
              <p className="text-mauve-11 text-[11px] truncate">{currentUser}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ id, label, Icon }) => {
          const isActive = currentView === id
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center gap-3 px-4 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'nav-active text-white bg-mac-navy'
                  : 'text-mauve-9 hover:text-white hover:bg-mauve-11/60'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="font-medium tracking-tight">{label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-mauve-12 space-y-1">
        <button
          onClick={onLogout}
          title={collapsed ? 'Sign out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-mauve-9 hover:text-white hover:bg-mauve-11/60 rounded-md transition-colors"
        >
          <LogoutIcon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Sign out</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] text-mauve-11 hover:text-mauve-7 transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeftIcon className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
