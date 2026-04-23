import React from 'react'
import type { ViewMode } from '../types'
import {
  DashboardIcon,
  CompareIcon,
  AlertIcon,
  HistoryIcon,
  SearchIcon,
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
  { id: 'po-history', label: 'PO History', Icon: SearchIcon },
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
      className={`sidebar flex flex-col transition-all duration-300 flex-shrink-0 text-white ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            <img src="/mac_logo.png" alt="MAC Logo" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-sm truncate uppercase">WABTEC SCC PORTAL</h1>
              <p className="text-blue-200 text-[10px] truncate uppercase font-bold tracking-tighter">
                {currentUser}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map(({ id, label, Icon }) => {
          const isActive = currentView === id
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                isActive
                  ? 'nav-active text-white bg-white/10'
                  : 'text-blue-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon />
              {!collapsed && <span className="font-medium">{label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2">
        <button
          onClick={onLogout}
          title={collapsed ? 'Sign Out' : undefined}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-blue-200 hover:text-white hover:bg-white/5 rounded-lg transition-all"
        >
          <LogoutIcon />
          {!collapsed && <span className="font-medium">Sign Out</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-blue-200 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeftIcon className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
