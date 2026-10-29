import React from 'react';
import { Menu, Database, ShieldCheck, LogOut, User as UserIcon, Monitor, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onToggleSidebar: () => void;
  isSidebarCollapsed?: boolean;
  isDesktopMode?: boolean;
  onToggleDesktopMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onToggleSidebar,
  isSidebarCollapsed,
  isDesktopMode = false,
  onToggleDesktopMode,
}) => {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-2.5 sm:px-6 py-2 sm:py-3 flex items-center justify-between shadow-xs">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-emerald-900 transition flex items-center gap-1.5 shrink-0"
          aria-label="Toggle menu"
          title={isSidebarCollapsed ? "Tampilkan Menu Samping" : "Sembunyikan Menu Samping"}
        >
          <Menu className="w-5 h-5 text-emerald-900" />
          <span className="hidden sm:inline text-xs font-bold text-emerald-950">
            {isSidebarCollapsed ? "Buka Menu" : "Menu"}
          </span>
        </button>

        <div className="min-w-0">
          <h2 className="text-sm sm:text-lg font-bold text-slate-800 tracking-tight leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium hidden sm:block truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Toggle Mode Desktop (PC View) on HP / Tablet */}
        {onToggleDesktopMode && (
          <button
            onClick={onToggleDesktopMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border shadow-xs ${
              isDesktopMode
                ? 'bg-emerald-900 text-amber-300 border-emerald-950 hover:bg-emerald-850'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title={isDesktopMode ? "Kembali ke Tampilan HP" : "Beralih ke Tampilan Desktop/PC (Lebar & Padat)"}
          >
            {isDesktopMode ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[11px]">Mode PC (Aktif)</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-emerald-800" />
                <span className="text-[11px]">Mode PC</span>
              </>
            )}
          </button>
        )}

        {/* Supabase Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            isSupabaseConfigured
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
          title={isSupabaseConfigured ? 'Database Supabase Terhubung' : 'Konfigurasi Supabase Diperlukan'}
        >
          <Database className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isSupabaseConfigured ? 'Supabase Online' : 'Mode Offline/Setup'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="hidden md:block text-left">
              <p className="font-semibold text-slate-800 leading-tight">
                {user?.user_metadata?.full_name || 'Nasrulloh'}
              </p>
              <p className="text-[10px] text-emerald-800 font-bold">Bendahara Al-Qur'aniyyah</p>
            </div>
          </div>

          <button
            onClick={() => signOut()}
            title="Keluar"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
