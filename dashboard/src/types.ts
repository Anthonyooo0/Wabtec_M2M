export type ViewMode = 'dashboard' | 'comparison' | 'discrepancies' | 'awaiting-acceptance' | 'po-history' | 'm2m-orphans' | 'changelog';

export interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.ReactNode;
}

export interface DashboardStats {
  totalPOs: number;
  discrepancies: number;
  lateShipments: number;
  lastSync: string | null;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  details: string;
}
