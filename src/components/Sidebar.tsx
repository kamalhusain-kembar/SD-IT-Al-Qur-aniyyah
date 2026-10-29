import React from 'react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Receipt,
  CreditCard,
  TableProperties,
  AlertTriangle,
  BarChart3,
  Settings,
  GraduationCap,
  FileSpreadsheet,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import logoImg from '../assets/logo.png';

export type MenuItemId =
  | 'dashboard'
  | 'students'
  | 'academic-years'
  | 'bills'
  | 'payments'
  | 'recap-payments'
  | 'cross-year-arrears'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: MenuItemId;
  setActiveTab: (tab: MenuItemId) => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
  isCollapsedDesktop?: boolean;
  onToggleCollapseDesktop?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  setIsOpenMobile,
  isCollapsedDesktop = false,
  onToggleCollapseDesktop,
}) => {
  const { academicYears, selectedAcademicYearId, setSelectedAcademicYearId } = useApp();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Data Siswa', icon: Users },
    { id: 'academic-years', label: 'Tahun Ajaran', icon: Calendar },
    { id: 'bills', label: 'Tagihan Siswa', icon: Receipt },
    { id: 'payments', label: 'Import Pembayaran', icon: FileSpreadsheet, highlight: true },
    { id: 'recap-payments', label: 'Rekap Pembayaran', icon: TableProperties },
    { id: 'cross-year-arrears', label: 'Rekap Tunggakan', icon: AlertTriangle, badge: 'Lintas Tahun' },
    { id: 'reports', label: 'Laporan Keuangan', icon: BarChart3 },
    { id: 'settings', label: 'Pengaturan & Import', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-emerald-950 text-slate-100 flex flex-col border-r border-emerald-900 shadow-xl transition-transform duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        } ${
          isCollapsedDesktop ? 'lg:-translate-x-full' : 'lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-emerald-900/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="Logo Al-Qur'aniyyah"
              className="w-10 h-10 object-contain rounded-full bg-white p-0.5 shadow-md shadow-emerald-950/50"
            />
            <div>
              <h1 className="font-bold text-base text-white tracking-wide leading-tight">
                TK &amp; SD IT Al-Qur’aniyyah
              </h1>
              <p className="text-xs text-emerald-300/80 font-medium">Administrasi Keuangan</p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsOpenMobile(false);
              if (onToggleCollapseDesktop) onToggleCollapseDesktop();
            }}
            className="text-emerald-300 hover:text-white p-1 rounded-lg transition"
            title="Sembunyikan Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Academic Year Quick Switch */}
        <div className="px-5 py-3.5 bg-emerald-900/40 border-b border-emerald-900/60">
          <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-300/70 mb-1.5 flex items-center justify-between">
            <span>Tahun Ajaran Aktif</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <select
            value={selectedAcademicYearId}
            onChange={(e) => setSelectedAcademicYearId(e.target.value)}
            className="w-full bg-emerald-900/90 text-white text-xs font-semibold rounded-lg px-3 py-2 border border-emerald-700/80 focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
          >
            {academicYears.map((year) => (
              <option key={year.id} value={year.id} className="bg-emerald-950 text-white">
                T.A. {year.name} {year.status === 'active' ? '(Aktif)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-emerald-800">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as MenuItemId);
                  setIsOpenMobile(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-md shadow-emerald-900/40 font-semibold'
                    : 'text-emerald-100/80 hover:bg-emerald-900/60 hover:text-white'
                } ${item.highlight && !isActive ? 'border border-gold-500/30 text-gold-200' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 transition-transform ${
                      isActive ? 'text-gold-400 scale-110' : 'text-emerald-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-emerald-900/80 bg-emerald-950/80 text-xs text-emerald-300/70 text-center">
          <p className="font-semibold text-emerald-200">TK IT &amp; SD IT</p>
          <p className="text-[11px] text-emerald-400/60 mt-0.5">Sistem Terintegrasi Online</p>
        </div>
      </aside>
    </>
  );
};
