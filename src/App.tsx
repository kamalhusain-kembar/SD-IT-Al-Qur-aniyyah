import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { Sidebar, MenuItemId } from './components/Sidebar';
import { Header } from './components/Header';
import { ToastContainer } from './components/ToastContainer';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { AcademicYearsPage } from './pages/AcademicYearsPage';
import { BillsPage } from './pages/BillsPage';
import { ImportPaymentsPage } from './pages/ImportPaymentsPage';
import { PaymentRecapPage } from './pages/PaymentRecapPage';
import { CrossYearArrearsPage } from './pages/CrossYearArrearsPage';
import { FinancialReportPage } from './pages/FinancialReportPage';
import { SettingsPage } from './pages/SettingsPage';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MenuItemId>('recap-payments'); // default directly to the requested Rekap Pembayaran page!
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDesktopMode, setIsDesktopMode] = useState<boolean>(() => {
    return localStorage.getItem('simka_view_mode') === 'desktop';
  });

  useEffect(() => {
    const meta = document.getElementById('viewport-meta') || document.querySelector('meta[name="viewport"]');
    if (meta) {
      if (isDesktopMode) {
        meta.setAttribute('content', 'width=1200, initial-scale=0.32, maximum-scale=3.0, user-scalable=yes');
      } else {
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
      }
    }
    localStorage.setItem('simka_view_mode', isDesktopMode ? 'desktop' : 'mobile');
  }, [isDesktopMode]);

  const handleToggleDesktopMode = () => {
    setIsDesktopMode((prev) => !prev);
  };

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setIsOpenMobile((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => !prev);
    }
  };

  const getPageTitle = (tab: MenuItemId) => {
    switch (tab) {
      case 'dashboard':
        return { title: 'Dashboard Keuangan', subtitle: 'Ikhtisar tagihan, pembayaran, dan realisasi dana' };
      case 'students':
        return { title: 'Data Master Siswa', subtitle: 'Pengelolaan data induk santri SMP IT & SMA IT' };
      case 'academic-years':
        return { title: 'Tahun Ajaran', subtitle: 'Pengaturan periode tahun ajaran aktif dan arsip' };
      case 'bills':
        return { title: 'Tagihan Siswa', subtitle: 'Struktur tagihan bulanan SPP dan biaya satu kali' };
      case 'payments':
        return { title: 'Layanan Import Pembayaran Excel', subtitle: 'Import data setoran, tanggal bayar, dan item pembiayaan dari Excel' };
      case 'recap-payments':
        return { title: 'Rekap Pembayaran Siswa (Juli - Juni)', subtitle: 'Klik sel mana saja untuk edit tanggal bayar atau nominal langsung di tabel' };
      case 'cross-year-arrears':
        return { title: 'Rekap Tunggakan Lintas Tahun', subtitle: 'Perhitungan sisa tagihan antar tahun ajaran' };
      case 'reports':
        return { title: 'Laporan Keuangan Yayasan', subtitle: 'Rekapitulasi pemasukan bulanan, item, dan jenjang' };
      case 'settings':
        return { title: 'Pengaturan & Import Excel', subtitle: 'Import data dari file acuan dan konfigurasi sistem' };
      default:
        return { title: 'Sistem Keuangan Siswa', subtitle: 'Yayasan Al-Qur’aniyyah' };
    }
  };

  const { title, subtitle } = getPageTitle(activeTab);

  return (
    <div className={`min-h-screen bg-slate-50 flex ${isDesktopMode ? 'min-w-[1200px]' : ''}`}>
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isOpenMobile}
        setIsOpenMobile={setIsOpenMobile}
        isCollapsedDesktop={isSidebarCollapsed}
        onToggleCollapseDesktop={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 min-w-0 ${isSidebarCollapsed ? 'lg:pl-0' : 'lg:pl-72'}`}>
        <Header
          title={title}
          subtitle={subtitle}
          onToggleSidebar={handleToggleSidebar}
          isSidebarCollapsed={isSidebarCollapsed}
          isDesktopMode={isDesktopMode}
          onToggleDesktopMode={handleToggleDesktopMode}
        />

        <main className={`flex-1 p-2 sm:p-4 lg:p-6 w-full mx-auto ${isDesktopMode ? 'max-w-none' : 'max-w-[1600px]'}`}>
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'students' && <StudentsPage />}
          {activeTab === 'academic-years' && <AcademicYearsPage />}
          {activeTab === 'bills' && <BillsPage />}
          {activeTab === 'payments' && <ImportPaymentsPage />}
          {activeTab === 'recap-payments' && <PaymentRecapPage />}
          {activeTab === 'cross-year-arrears' && <CrossYearArrearsPage />}
          {activeTab === 'reports' && <FinancialReportPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Notifications */}
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
