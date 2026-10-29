import React, { createContext, useContext, useEffect, useState } from 'react';
import { AcademicYear } from '../types/database';
import { academicYearService } from '../services/academicYearService';
import { isSupabaseConfigured } from '../lib/supabase';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  academicYears: AcademicYear[];
  selectedAcademicYearId: string;
  selectedAcademicYear: AcademicYear | null;
  setSelectedAcademicYearId: (id: string) => void;
  refreshAcademicYears: () => Promise<void>;
  refreshKey: number;
  triggerRefresh: () => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  isLoadingYears: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const triggerRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchYears = async () => {
    setIsLoadingYears(true);
    try {
      if (isSupabaseConfigured) {
        let years = await academicYearService.getAll();
        if (!years || years.length === 0) {
          try {
            const created = await academicYearService.create({
              name: '2026/2027',
              start_date: '2026-07-01',
              end_date: '2027-06-30',
              status: 'active'
            });
            years = [created];
          } catch (e) {
            console.warn('Auto create year error:', e);
          }
        }

        if (!years || years.length === 0) {
          years = [{
            id: '9a798c1f-7deb-4b6d-b94e-56a83a9fe6f7',
            name: '2026/2027',
            start_date: '2026-07-01',
            end_date: '2027-06-30',
            status: 'active'
          }];
        }

        setAcademicYears(years);
        const active = years.find((y) => y.status === 'active') || years[0];
        setSelectedAcademicYearId((prev) => (prev && years.some((y) => y.id === prev) ? prev : active.id));
      } else {
        // Fallback default academic year
        const defaultYear: AcademicYear = {
          id: 'year-2026-2027',
          name: '2026/2027',
          start_date: '2026-07-01',
          end_date: '2027-06-30',
          status: 'active',
        };
        setAcademicYears([defaultYear]);
        setSelectedAcademicYearId(defaultYear.id);
      }
    } catch (err: any) {
      console.warn('Gagal memuat tahun ajaran dari Supabase:', err);
    } finally {
      setIsLoadingYears(false);
    }
  };

  useEffect(() => {
    fetchYears();
  }, [refreshKey]);

  const selectedAcademicYear = academicYears.find((y) => y.id === selectedAcademicYearId) || null;

  return (
    <AppContext.Provider
      value={{
        academicYears,
        selectedAcademicYearId,
        selectedAcademicYear,
        setSelectedAcademicYearId,
        refreshAcademicYears: fetchYears,
        refreshKey,
        triggerRefresh,
        toasts,
        showToast,
        removeToast,
        isLoadingYears,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
