import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  Download,
  Calendar,
  Eye,
  CheckCircle2,
  X,
  FileSpreadsheet,
  ChevronRight,
  TrendingDown,
  Layers,
  FileText,
  Camera,
  Printer
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { arrearsService } from '../services/arrearsService';
import { excelService } from '../services/excelService';
import { StudentCrossYearArrears, StudentYearlyArrears } from '../types/database';
import { StudentArrearsCardModal } from '../components/StudentArrearsCardModal';

export const CrossYearArrearsPage: React.FC = () => {
  const { academicYears, selectedAcademicYearId, showToast, refreshKey } = useApp();

  const [arrearsData, setArrearsData] = useState<StudentCrossYearArrears[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [academicYearFilter, setAcademicYearFilter] = useState<string>('ALL'); // 'ALL' = Semua Tahun Ajaran!
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'TK IT' | 'SD IT'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'menunggak' | 'lunas'>('menunggak');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search so typing (e.g. "hilma") doesn't spam Supabase on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Modal Detail Rincian Tunggakan
  const [selectedStudentArrears, setSelectedStudentArrears] = useState<StudentCrossYearArrears | null>(null);

  const loadArrears = async () => {
    setIsLoading(true);
    try {
      const data = await arrearsService.getCrossYearArrears({
        academicYearId: academicYearFilter === 'ALL' ? 'ALL' : academicYearFilter,
        unit: unitFilter,
        grade: gradeFilter,
        search: debouncedSearch || undefined,
      });

      setArrearsData(data);
    } catch (err: any) {
      console.error('Error loading arrears:', err);
      showToast('Gagal memuat rekap tunggakan: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArrears();
  }, [academicYearFilter, unitFilter, gradeFilter, debouncedSearch, refreshKey]);

  // Filter by payment status (Menunggak vs Lunas)
  const filteredData = arrearsData.filter((item) => {
    if (statusFilter === 'menunggak') return item.grand_total_arrears > 0;
    if (statusFilter === 'lunas') return item.grand_total_arrears === 0;
    return true;
  });

  // Calculate summary metrics
  const totalArrearsSum = filteredData.reduce((sum, item) => sum + item.grand_total_arrears, 0);
  const totalStudentsWithArrears = filteredData.filter((i) => i.grand_total_arrears > 0).length;

  const handleExport = () => {
    if (filteredData.length === 0) {
      showToast('Tidak ada data tunggakan untuk diexport', 'error');
      return;
    }

    const exportRows = filteredData.map((item) => {
      const yearNames = item.years.map((y) => `${y.academic_year_name} (Rp${y.remaining_arrears.toLocaleString('id-ID')})`).join('; ');
      return {
        nis: item.student.nis,
        student_name: item.student.full_name,
        unit: item.current_unit || '-',
        grade: item.current_grade || '-',
        academic_years: yearNames || 'T.A. Aktif',
        total_bills: item.grand_total_bills,
        total_paid: item.grand_total_paid,
        total_arrears: item.grand_total_arrears,
        details: item.years.map((y) => `${y.academic_year_name}: ${y.unpaid_bills_count} tagihan tertunggak`).join(', ')
      };
    });

    excelService.exportRekapTunggakan(exportRows, `Rekap_Tunggakan_${academicYearFilter === 'ALL' ? 'Semua_Tahun' : 'Tahun_Tertentu'}`);
    showToast('Rekap tunggakan berhasil diexport ke Excel', 'success');
  };

  return (
    <div className="space-y-3 pb-8">
      {/* Dense Desktop-Style Toolbar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                Lintas Tahun
              </span>
              <h3 className="text-sm font-bold text-slate-800 leading-tight">
                Rekap Tunggakan Siswa
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Perhitungan akurat sisa tagihan lintas tahun ajaran
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-gold-400" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Compact Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari siswa atau NIS..."
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="w-full py-1.5 px-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-emerald-50 text-emerald-950"
            >
              <option value="ALL">★ Semua Tahun Ajaran</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  T.A. {y.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value as any)}
              className="w-full py-1.5 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Jenjang</option>
              <option value="TK IT">TK IT</option>
              <option value="SD IT">SD IT</option>
            </select>
          </div>

          <div>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full py-1.5 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Kelas</option>
              <optgroup label="TK IT">
                <option value="A">TK A</option>
                <option value="B">TK B</option>
              </optgroup>
              <optgroup label="SD IT">
                <option value="I">Kelas I</option>
                <option value="II">Kelas II</option>
                <option value="III">Kelas III</option>
                <option value="IV">Kelas IV</option>
                <option value="V">Kelas V</option>
                <option value="VI">Kelas VI</option>
              </optgroup>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full py-1.5 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-white"
            >
              <option value="menunggak">Hanya Menunggak</option>
              <option value="ALL">Semua (Termasuk Lunas)</option>
              <option value="lunas">Hanya Lunas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards - Compact 2x2 grid on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Nilai Tunggakan</p>
          <h4 className="text-base sm:text-xl font-black text-rose-600 mt-0.5 truncate">
            Rp{totalArrearsSum.toLocaleString('id-ID')}
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">{filteredData.length} siswa terfilter</p>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Siswa Menunggak</p>
          <h4 className="text-base sm:text-xl font-black text-slate-800 mt-0.5">
            {totalStudentsWithArrears} <span className="text-xs font-normal text-slate-500">siswa</span>
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">Sisa tagihan &gt; Rp0</p>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mode Periode</p>
          <h4 className="text-xs sm:text-sm font-bold text-emerald-800 mt-1 flex items-center gap-1.5 truncate">
            <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{academicYearFilter === 'ALL' ? 'Semua Tahun Ajaran' : 'Tahun Ajaran Aktif'}</span>
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">Riwayat otomatis terhubung</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
              <tr className="text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-20">No</th>
                <th className="py-2.5 px-3 min-w-[150px] sticky left-10 bg-slate-100 z-20">Nama Siswa</th>
                <th className="py-2.5 px-3 min-w-[80px]">NIS</th>
                <th className="py-2.5 px-3 min-w-[110px]">Jenjang/Kelas</th>
                <th className="py-2.5 px-3 min-w-[200px]">Rincian Per T.A.</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Total Tagihan</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Total Dibayar</th>
                <th className="py-2.5 px-3 text-right min-w-[110px]">Total Tunggakan</th>
                <th className="py-2.5 px-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    Memuat data tunggakan lintas tahun...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    Tidak ditemukan data siswa dengan kriteria filter tersebut.
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => (
                  <tr key={item.student.id} className="hover:bg-slate-50/80 transition group">
                    <td className="py-2 px-3 text-center text-slate-400 font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">{idx + 1}</td>
                    <td className="py-2 px-3 font-bold text-slate-800 sticky left-10 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap">
                      {item.student.full_name}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {item.student.nis || '-'}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      {item.current_unit || 'SD IT'} · Kelas {item.current_grade || '-'}
                    </td>
                    <td className="py-2 px-3">
                      {/* Breakdown pills per academic year */}
                      <div className="flex flex-wrap gap-1">
                        {item.years.map((y) => (
                          <span
                            key={y.academic_year_id}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              y.remaining_arrears > 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            <span>{y.academic_year_name}:</span>
                            <span>Rp{y.remaining_arrears.toLocaleString('id-ID')}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                      Rp{item.grand_total_bills.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      Rp{item.grand_total_paid.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-rose-600 text-xs whitespace-nowrap">
                      Rp{item.grand_total_arrears.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => setSelectedStudentArrears(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold transition shadow-2xs"
                        title="Buka Kartu Rincian Tunggakan Resmi (Siap Screenshot & Cetak PDF)"
                      >
                        <FileText className="w-3 h-3 text-gold-300" />
                        <span>Kartu &amp; PDF</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Kartu Rincian Tunggakan Resmi (Siap Screenshot & Cetak PDF) */}
      {selectedStudentArrears && (
        <StudentArrearsCardModal
          studentArrears={selectedStudentArrears}
          onClose={() => setSelectedStudentArrears(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
