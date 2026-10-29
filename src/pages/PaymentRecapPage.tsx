import React, { useState, useEffect } from 'react';
import {
  TableProperties,
  Search,
  Filter,
  Download,
  Calendar,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Edit3,
  X,
  Save,
  Check,
  HelpCircle,
  Pin,
  PinOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentService } from '../services/studentService';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { paymentService } from '../services/paymentService';
import { excelService } from '../services/excelService';
import { localStore } from '../services/dataStore';
import { Student, Bill, UnitType, BillStatus } from '../types/database';

interface SppCellData {
  status: 'Lunas' | 'Belum Lunas' | 'Belum Dibayar' | 'Bebas' | 'Akan Berlangsung';
  displayValue: string;
  paidDate?: string | null;
  paidAmount?: number;
  remaining?: number;
  billId?: string;
  amount?: number;
}

interface RecapRow {
  student_id: string;
  student_name: string;
  nis: string | null;
  unit: UnitType;
  grade: string;
  administrative_status: string;
  spp_nominal: number;
  sppMonths: Record<string, SppCellData>;
  paid_perlengkapan: number;
  paid_peralatan: number;
  paid_kegiatan: number;
  paid_pembangunan: number;
  paid_ujian: number;
  paid_lainnya: number;
  phone: string | null;
  student_status: string;
}

export const PaymentRecapPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey, triggerRefresh } = useApp();

  const [recapData, setRecapData] = useState<RecapRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active month setting (default to Oktober as in T.A. 2026/2027)
  const [activeMonthLimit, setActiveMonthLimit] = useState<string>('Oktober');

  // Filters
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'TK IT' | 'SD IT'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'aktif' | 'nonaktif'>('aktif');
  const [unpaidMonthFilter, setUnpaidMonthFilter] = useState<string>('ALL');

  // Freeze / Unfreeze student name column for mobile full-width scrolling
  const [isNameFrozen, setIsNameFrozen] = useState<boolean>(false);
  // Toggle filter visibility to maximize vertical space on phone screens
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Export Unpaid SPP Modal State
  const [showUnpaidExportModal, setShowUnpaidExportModal] = useState<boolean>(false);
  const [modalMonthTarget, setModalMonthTarget] = useState<string>('Oktober');
  const [modalUnitTarget, setModalUnitTarget] = useState<'ALL' | 'TK IT' | 'SD IT'>('ALL');
  const [modalGradeTarget, setModalGradeTarget] = useState<string>('ALL');
  const [modalAccumulatePrevious, setModalAccumulatePrevious] = useState<boolean>(true);

  // Modal In-Cell Edit for SPP Month
  const [editingSpp, setEditingSpp] = useState<{
    student_id: string;
    student_name: string;
    month: string;
    spp_nominal: number;
    current_status: string;
    current_date: string;
    paid_amount: string;
    notes?: string;
  } | null>(null);

  // Modal In-Cell Edit for Non-SPP Category
  const [editingNonSpp, setEditingNonSpp] = useState<{
    student_id: string;
    student_name: string;
    category_name: string;
    current_paid: number;
    input_amount: string;
    payment_date: string;
  } | null>(null);

  const loadRecap = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      const students = await studentService.getAllWithEnrollment({
        academicYearId: selectedAcademicYearId
      });

      const bills = await billingService.getBillsForAcademicYear(selectedAcademicYearId);

      const billsByStudent: Record<string, Bill[]> = {};
      bills.forEach((b) => {
        if (!billsByStudent[b.student_id]) billsByStudent[b.student_id] = [];
        billsByStudent[b.student_id].push(b);
      });

      const isAcademicYearActive = selectedAcademicYear?.status === 'active';
      const activeMonthIndex = SPP_MONTHS.indexOf(activeMonthLimit);

      const rows: RecapRow[] = students.map((s) => {
        const enr = s.current_enrollment;
        const sBills = billsByStudent[s.id] || [];

        const sppBills = sBills.filter((b) => b.category?.name.toLowerCase().includes('spp'));
        const sppNominal = sppBills.length > 0 ? sppBills[0].amount : 1335000;

        const sppMonthsMap: RecapRow['sppMonths'] = {};

        SPP_MONTHS.forEach((month, mIdx) => {
          const mBill = sppBills.find((b) => b.billing_period?.toLowerCase() === month.toLowerCase());
          const isUpcoming = isAcademicYearActive ? (mIdx > activeMonthIndex) : false;

          if (!mBill) {
            sppMonthsMap[month] = {
              status: isUpcoming ? 'Akan Berlangsung' : 'Belum Dibayar',
              displayValue: isUpcoming ? 'Akan Berlangsung' : 'Belum Bayar',
              amount: sppNominal,
            };
          } else if (mBill.calculated_status === 'Bebas') {
            sppMonthsMap[month] = {
              status: 'Bebas',
              displayValue: 'Free',
              billId: mBill.id,
              amount: mBill.amount,
            };
          } else if (mBill.calculated_status === 'Lunas') {
            let dateStr = 'Lunas';
            if (mBill.last_payment_date) {
              const d = new Date(mBill.last_payment_date);
              dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
            }
            sppMonthsMap[month] = {
              status: 'Lunas',
              displayValue: dateStr,
              paidDate: mBill.last_payment_date,
              billId: mBill.id,
              amount: mBill.amount,
            };
          } else if (mBill.calculated_status === 'Belum Lunas') {
            const paid = Number(mBill.total_paid || 0);
            const rem = Number(mBill.remaining_amount || 0);
            sppMonthsMap[month] = {
              status: 'Belum Lunas',
              displayValue: `Rp${(paid / 1000).toLocaleString('id-ID')}k`,
              remaining: rem,
              paidAmount: paid,
              paidDate: mBill.last_payment_date,
              billId: mBill.id,
              amount: mBill.amount,
            };
          } else {
            // Unpaid
            sppMonthsMap[month] = {
              status: isUpcoming ? 'Akan Berlangsung' : 'Belum Dibayar',
              displayValue: isUpcoming ? 'Akan Berlangsung' : 'Belum Bayar',
              billId: mBill.id,
              amount: mBill.amount,
            };
          }
        });

        const getPaidForCat = (catPattern: string) => {
          const matchBills = sBills.filter((b) => b.category?.name.toLowerCase().includes(catPattern.toLowerCase()));
          return matchBills.reduce((sum, b) => sum + Number(b.total_paid || 0), 0);
        };

        return {
          student_id: s.id,
          student_name: s.full_name,
          nis: s.nis,
          unit: enr?.unit || 'SD IT',
          grade: enr?.grade || '-',
          administrative_status: enr?.administrative_status || 'Mampu',
          spp_nominal: sppNominal,
          sppMonths: sppMonthsMap,
          paid_perlengkapan: getPaidForCat('Perlengkapan'),
          paid_peralatan: getPaidForCat('Peralatan'),
          paid_kegiatan: getPaidForCat('Kegiatan'),
          paid_pembangunan: getPaidForCat('Pembangunan'),
          paid_ujian: getPaidForCat('Ujian'),
          paid_lainnya: getPaidForCat('Lainnya'),
          phone: s.phone || null,
          student_status: s.student_status || 'aktif',
        };
      });

      setRecapData(rows);
    } catch (err: any) {
      console.error('Error loading recap:', err);
      showToast('Gagal memuat rekap pembayaran: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecap();
  }, [selectedAcademicYearId, activeMonthLimit, refreshKey]);

  // Handle cell click on SPP Month
  const handleCellClickSpp = (row: RecapRow, month: string) => {
    const cell = row.sppMonths[month];
    const todayStr = new Date().toISOString().split('T')[0];

    // If cell already has partial payment (Belum Lunas / ACC), prefill with currently paid amount
    const defaultPaidAmount = (cell?.status === 'Belum Lunas' && cell?.paidAmount !== undefined)
      ? String(cell.paidAmount)
      : String(cell?.amount || row.spp_nominal);

    setEditingSpp({
      student_id: row.student_id,
      student_name: row.student_name,
      month: month,
      spp_nominal: cell?.amount || row.spp_nominal,
      current_status: cell?.status || 'Belum Dibayar',
      current_date: cell?.paidDate || todayStr,
      paid_amount: defaultPaidAmount,
      notes: cell?.status === 'Belum Lunas' ? 'ACC Sebagian (Dispensasi)' : '',
    });
  };

  // Save SPP In-Cell Edit
  const handleSaveSppEdit = async (status: BillStatus) => {
    if (!editingSpp || !selectedAcademicYearId) return;

    try {
      const enteredAmount = Number(editingSpp.paid_amount || 0);
      const isPartial = enteredAmount > 0 && enteredAmount < editingSpp.spp_nominal;
      const targetStatus: BillStatus = status === 'Lunas'
        ? (isPartial ? 'Belum Lunas' : 'Lunas')
        : status;

      await paymentService.updateSppCell(editingSpp.student_id, selectedAcademicYearId, editingSpp.month, {
        status: targetStatus,
        paymentDate: editingSpp.current_date,
        amount: targetStatus === 'Belum Dibayar' || targetStatus === 'Bebas' ? 0 : enteredAmount,
        notes: editingSpp.notes?.trim() || undefined,
      });

      const msg = targetStatus === 'Belum Lunas'
        ? `ACC Sebagian SPP ${editingSpp.month} untuk ${editingSpp.student_name} berhasil disimpan! (Dibayar: Rp${enteredAmount.toLocaleString('id-ID')}, Sisa: Rp${(editingSpp.spp_nominal - enteredAmount).toLocaleString('id-ID')})`
        : `SPP ${editingSpp.month} untuk ${editingSpp.student_name} berhasil diperbarui!`;

      showToast(msg, 'success');
      setEditingSpp(null);
      await loadRecap();
      triggerRefresh();
    } catch (err: any) {
      showToast('Gagal mengupdate cell: ' + err.message, 'error');
    }
  };

  // Handle cell click on Non-SPP (Perlengkapan, Peralatan, Kegiatan, etc.)
  const handleCellClickNonSpp = (row: RecapRow, categoryName: string, currentVal: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    setEditingNonSpp({
      student_id: row.student_id,
      student_name: row.student_name,
      category_name: categoryName,
      current_paid: currentVal,
      input_amount: String(currentVal || ''),
      payment_date: todayStr,
    });
  };

  // Save Non-SPP In-Cell Edit
  const handleSaveNonSppEdit = async () => {
    if (!editingNonSpp || !selectedAcademicYearId) return;

    try {
      const nominal = Number(editingNonSpp.input_amount || 0);
      await paymentService.updateNonSppCell(
        editingNonSpp.student_id,
        selectedAcademicYearId,
        editingNonSpp.category_name,
        nominal,
        editingNonSpp.payment_date
      );

      showToast(`Pembayaran ${editingNonSpp.category_name} untuk ${editingNonSpp.student_name} berhasil diupdate!`, 'success');
      setEditingNonSpp(null);
      await loadRecap();
      triggerRefresh();
    } catch (err: any) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    }
  };

  // Filter rows
  const filteredRows = recapData.filter((row) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      row.student_name.toLowerCase().includes(q) ||
      (row.nis && row.nis.toLowerCase().includes(q)) ||
      (row.phone && row.phone.includes(q));

    const matchesUnit = unitFilter === 'ALL' || row.unit === unitFilter;
    const matchesGrade = gradeFilter === 'ALL' || row.grade === gradeFilter;
    const matchesStatus = statusFilter === 'ALL' || row.administrative_status === statusFilter;
    const matchesStudentStatus = studentStatusFilter === 'ALL' || row.student_status === studentStatusFilter;

    // Filter by unpaid SPP month
    let matchesUnpaidMonth = true;
    if (unpaidMonthFilter !== 'ALL') {
      const cell = row.sppMonths[unpaidMonthFilter];
      matchesUnpaidMonth = cell?.status === 'Belum Dibayar' || cell?.status === 'Belum Lunas';
    }

    return matchesSearch && matchesUnit && matchesGrade && matchesStatus && matchesStudentStatus && matchesUnpaidMonth;
  });

  const handleExportUnpaid = (
    targetMonth: string,
    targetUnit: string = 'ALL',
    targetGrade: string = 'ALL',
    accumulatePrevious: boolean = true
  ) => {
    const targetIdx = SPP_MONTHS.indexOf(targetMonth);
    const monthsToCheck = (accumulatePrevious && targetIdx !== -1)
      ? SPP_MONTHS.slice(0, targetIdx + 1)
      : [targetMonth];

    const listWithUnpaidDetails = recapData
      .map((r) => {
        // Jangan sertakan siswa yang sudah nonaktif pada penagihan aktif
        if (r.student_status && r.student_status !== 'aktif') return null;

        const mUnit = targetUnit === 'ALL' || r.unit === targetUnit;
        const mGrade = targetGrade === 'ALL' || r.grade === targetGrade;
        if (!mUnit || !mGrade) return null;

        const unpaidMonths = monthsToCheck.filter((m) => {
          const cell = r.sppMonths[m];
          return cell?.status === 'Belum Dibayar' || cell?.status === 'Belum Lunas';
        });

        if (unpaidMonths.length === 0) return null;

        const totalArrears = unpaidMonths.reduce((sum, m) => {
          const cell = r.sppMonths[m];
          return sum + (cell?.amount || r.spp_nominal);
        }, 0);

        return {
          name: r.student_name,
          nis: r.nis,
          unit: r.unit,
          grade: r.grade,
          phone: r.phone,
          spp_nominal: r.spp_nominal,
          unpaid_months: unpaidMonths,
          unpaid_count: unpaidMonths.length,
          total_arrears: totalArrears,
          target_month: targetMonth,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (listWithUnpaidDetails.length === 0) {
      showToast(`Tidak ditemukan siswa yang menunggak SPP s.d. bulan ${targetMonth} untuk filter ini`, 'info');
      return;
    }

    excelService.exportUnpaidSppExcel(
      listWithUnpaidDetails,
      targetMonth,
      selectedAcademicYear?.name || '2026/2027'
    );
    showToast(`Berhasil mendownload Excel tagihan ${listWithUnpaidDetails.length} siswa menunggak s.d. bulan ${targetMonth}`, 'success');
  };

  const handleExport = () => {
    if (filteredRows.length === 0) {
      showToast('Tidak ada data rekap untuk diexport', 'error');
      return;
    }

    const exportPrepared = filteredRows.map((r) => ({
      student_name: r.student_name,
      unit: r.unit,
      grade: r.grade,
      administrative_status: r.administrative_status,
      spp_nominal: r.spp_nominal,
      spp_juli: r.sppMonths['Juli']?.displayValue,
      spp_agustus: r.sppMonths['Agustus']?.displayValue,
      spp_september: r.sppMonths['September']?.displayValue,
      spp_oktober: r.sppMonths['Oktober']?.displayValue,
      spp_november: r.sppMonths['November']?.displayValue,
      spp_desember: r.sppMonths['Desember']?.displayValue,
      spp_januari: r.sppMonths['Januari']?.displayValue,
      spp_februari: r.sppMonths['Februari']?.displayValue,
      spp_maret: r.sppMonths['Maret']?.displayValue,
      spp_april: r.sppMonths['April']?.displayValue,
      spp_mei: r.sppMonths['Mei']?.displayValue,
      spp_juni: r.sppMonths['Juni']?.displayValue,
      paid_perlengkapan: r.paid_perlengkapan,
      paid_peralatan: r.paid_peralatan,
      paid_kegiatan: r.paid_kegiatan,
      paid_pembangunan: r.paid_pembangunan,
      paid_ujian: r.paid_ujian,
      paid_lainnya: r.paid_lainnya,
      phone: r.phone,
    }));

    excelService.exportRekapPembayaran(exportPrepared, selectedAcademicYear?.name || '2026-2027');
    showToast('Rekap pembayaran berhasil diexport ke format Excel acuan', 'success');
  };

  return (
    <div className="space-y-2.5 sm:space-y-3.5 pb-8">
      {/* Unified Compact Control Panel (Desktop & Mobile Optimized) */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs space-y-2.5">
        {/* Row 1: Title Badge & Action Buttons in a single responsive row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5 sm:gap-2">
              <TableProperties className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>Rekap Pembayaran (Juli – Juni)</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wide whitespace-nowrap">
              ⚡ Edit Langsung
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Active Month Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg sm:rounded-xl px-2 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="text-slate-500 font-semibold text-[11px] sm:text-xs">Bulan:</span>
              <select
                value={activeMonthLimit}
                onChange={(e) => setActiveMonthLimit(e.target.value)}
                className="bg-transparent font-bold text-emerald-900 focus:outline-none cursor-pointer text-xs"
                title="Bulan setelahnya akan berstatus 'Akan Berlangsung' dan tidak dihitung tunggakan"
              >
                {SPP_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadRecap}
              disabled={isLoading}
              className="p-1.5 rounded-lg sm:rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition shrink-0"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Export Belum Bayar SPP Button */}
            <button
              onClick={() => setShowUnpaidExportModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs"
              title="Export Excel Siswa yang belum bayar SPP per bulan tertentu"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              <span className="hidden sm:inline">Export Belum Bayar SPP</span>
              <span className="sm:hidden">Export SPP</span>
            </button>

            {/* Export Matriks Lengkap Button */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg sm:rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
              title="Export Matriks Lengkap ke format Excel"
            >
              <Download className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="hidden sm:inline">Export Matriks Lengkap</span>
              <span className="sm:hidden">Matriks</span>
            </button>

            {/* Toggle Filters on Mobile */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg sm:rounded-xl border text-xs font-bold transition shadow-xs sm:hidden ${
                showFilters ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Tampilkan / Sembunyikan Filter Sortir"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>{showFilters ? 'Tutup' : 'Filter'}</span>
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Row 2: Compact Responsive Filters (Desktop Toolbar Style) */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2">
          {/* Search Input - Always visible */}
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / NIS..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-slate-50/50"
            />
          </div>

          {/* Jenjang Filter */}
          <div className={`${showFilters ? 'block' : 'hidden sm:block'}`}>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value as any)}
              className="w-full py-1.5 px-2.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Jenjang</option>
              <option value="TK IT">TK IT</option>
              <option value="SD IT">SD IT</option>
            </select>
          </div>

          {/* Kelas Filter */}
          <div className={`${showFilters ? 'block' : 'hidden sm:block'}`}>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Kelas</option>
              <optgroup label="TK IT">
                <option value="A">Kelas A</option>
                <option value="B">Kelas B</option>
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

          {/* Kategori Filter */}
          <div className={`${showFilters ? 'block' : 'hidden sm:block'}`}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="Mampu">Mampu</option>
              <option value="Yatim">Yatim</option>
              <option value="Dhuafa">Dhuafa</option>
              <option value="Beasiswa">Beasiswa</option>
              <option value="Rekomendasi">Rekomendasi</option>
            </select>
          </div>

          {/* Status Siswa Filter */}
          <div className={`${showFilters ? 'block' : 'hidden sm:block'}`}>
            <select
              value={studentStatusFilter}
              onChange={(e) => setStudentStatusFilter(e.target.value as any)}
              className="w-full py-1.5 px-2.5 text-xs font-semibold rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="aktif">🟢 Siswa Aktif</option>
              <option value="nonaktif">🔴 Siswa Nonaktif</option>
              <option value="ALL">Semua Status</option>
            </select>
          </div>

          {/* Status SPP Filter */}
          <div className={`col-span-2 sm:col-span-1 ${showFilters ? 'block' : 'hidden sm:block'}`}>
            <select
              value={unpaidMonthFilter}
              onChange={(e) => setUnpaidMonthFilter(e.target.value)}
              className={`w-full py-1.5 px-2.5 text-xs font-bold rounded-lg sm:rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                unpaidMonthFilter !== 'ALL'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-300'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <option value="ALL">Semua Status SPP</option>
              {SPP_MONTHS.map((m) => (
                <option key={m} value={m}>
                  ⚠️ Belum Bayar {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Indicator Banner when filtering by unpaid month */}
      {unpaidMonthFilter !== 'ALL' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded">
                  Filter Aktif
                </span>
                <p className="text-xs sm:text-sm font-bold text-amber-950">
                  Siswa Belum Bayar SPP {unpaidMonthFilter}
                </p>
              </div>
              <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5">
                Ditemukan <strong className="text-amber-950 underline">{filteredRows.length} siswa</strong> belum bayar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleExportUnpaid(unpaidMonthFilter, unitFilter, gradeFilter, true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-lg sm:rounded-xl shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5 text-amber-200" />
              <span>Download Excel ({filteredRows.length} Siswa)</span>
            </button>
            <button
              onClick={() => setUnpaidMonthFilter('ALL')}
              className="px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200/50 rounded-lg transition"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Legend & Controls in a Single Compact Horizontal Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] sm:text-[11px] font-semibold text-slate-500">
        <div className="flex items-center gap-2.5 overflow-x-auto whitespace-nowrap scrollbar-none py-0.5">
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Lunas</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-amber-800 font-bold">ACC Sebagian (Cicilan)</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Belum Bayar</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
            <span>Akan Berlangsung</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>Free</span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-emerald-800 font-bold hidden lg:inline">
            💡 Klik sel untuk edit
          </span>

          {/* Toggle Freeze / Unfreeze Nama Siswa */}
          <button
            type="button"
            onClick={() => setIsNameFrozen(!isNameFrozen)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border shadow-2xs ${
              isNameFrozen
                ? 'bg-emerald-800 text-white border-emerald-900 ring-1 ring-emerald-500'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Klik untuk beralih antara Kunci Nama vs Geser Bebas Full Layar"
          >
            {isNameFrozen ? (
              <>
                <Pin className="w-3 h-3 text-gold-300 shrink-0" />
                <span>Kunci Nama (Ramping)</span>
              </>
            ) : (
              <>
                <PinOff className="w-3 h-3 text-slate-400 shrink-0" />
                <span>Geser Bebas (Full Layar)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Matrix Table with Maximized Height & Pinned Headers */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-210px)] sm:max-h-[calc(100vh-230px)] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-30 shadow-xs">
              <tr className="bg-emerald-950 text-white font-bold uppercase tracking-wider text-[11px]">
                <th
                  className={`py-2 px-1 text-center border-r border-emerald-900 ${
                    isNameFrozen
                      ? 'sticky left-0 z-40 bg-emerald-950 w-7 sm:w-10'
                      : 'w-7 sm:w-10'
                  }`}
                >
                  No
                </th>
                <th
                  className={`py-2 px-2 sm:px-3.5 border-r border-emerald-900 ${
                    isNameFrozen
                      ? 'sticky left-7 sm:left-10 z-40 bg-emerald-950 max-w-[115px] sm:max-w-none truncate shadow-[2px_0_5px_-2px_rgba(0,0,0,0.4)]'
                      : 'min-w-[140px] sm:min-w-[170px]'
                  }`}
                >
                  Nama Siswa
                </th>
                <th className="py-2.5 px-2.5 text-center">Jenjang</th>
                <th className="py-2.5 px-2.5 text-center">Kelas</th>
                <th className="py-2.5 px-2.5">Status</th>
                <th className="py-2.5 px-2.5 text-right">SPP/Bulan</th>

                {/* 12 Months SPP Columns */}
                {SPP_MONTHS.map((m) => (
                  <th key={m} className="py-2.5 px-2 text-center min-w-[90px] bg-emerald-900/90 border-l border-emerald-800/80">
                    {m}
                  </th>
                ))}

                {/* Non SPP Categories */}
                <th className="py-2.5 px-3 text-right bg-emerald-850/90 border-l border-emerald-800/80 min-w-[105px]">
                  Perlengkapan
                </th>
                <th className="py-2.5 px-3 text-right bg-emerald-850/90 min-w-[105px]">Peralatan</th>
                <th className="py-2.5 px-3 text-right bg-emerald-850/90 min-w-[105px]">Kegiatan</th>
                <th className="py-2.5 px-3 text-right bg-emerald-850/90 min-w-[105px]">Pembangunan</th>
                <th className="py-2.5 px-3 text-right bg-emerald-850/90 min-w-[85px]">Ujian</th>
                <th className="py-2.5 px-3 text-right bg-emerald-850/90 min-w-[85px]">Lainnya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={24} className="py-16 text-center text-slate-400">
                    Memuat matriks rekap pembayaran...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={24} className="py-16 text-center text-slate-400">
                    Tidak ada siswa ditemukan yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={row.student_id} className="hover:bg-slate-50/80 transition">
                    <td
                      className={`py-2 px-1 sm:px-2.5 text-center text-slate-400 font-bold border-r border-slate-100 ${
                        isNameFrozen
                          ? 'sticky left-0 z-10 bg-white'
                          : ''
                      }`}
                    >
                      {idx + 1}
                    </td>
                    <td
                      className={`py-2 px-2 sm:px-3.5 font-bold text-slate-800 border-r border-slate-100 ${
                        isNameFrozen
                          ? 'sticky left-7 sm:left-10 z-10 bg-white max-w-[115px] sm:max-w-none truncate shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]'
                          : 'whitespace-nowrap'
                      }`}
                      title={row.student_name}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{row.student_name}</span>
                        {row.student_status === 'nonaktif' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                            Nonaktif
                          </span>
                        )}
                        {row.student_status === 'pindah' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                            Pindah
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2.5 text-center text-slate-600 font-semibold">{row.unit}</td>
                    <td className="py-2 px-2.5 text-center text-slate-700 font-semibold">{row.grade}</td>
                    <td className="py-2 px-2.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 whitespace-nowrap">
                        {row.administrative_status}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                      Rp{Number(row.spp_nominal).toLocaleString('id-ID')}
                    </td>

                    {/* 12 Months Cells - CLICK TO EDIT DIRECTLY */}
                    {SPP_MONTHS.map((month) => {
                      const cell = row.sppMonths[month];
                      let cellClass = 'bg-rose-50/70 text-rose-700 font-normal hover:bg-rose-100 hover:ring-2 hover:ring-rose-400';
                      if (cell.status === 'Lunas') {
                        cellClass = 'bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100 hover:ring-2 hover:ring-emerald-400';
                      } else if (cell.status === 'Belum Lunas') {
                        cellClass = 'bg-amber-100 text-amber-950 font-black border border-amber-300 hover:bg-amber-200 hover:ring-2 hover:ring-amber-500 shadow-2xs';
                      } else if (cell.status === 'Bebas') {
                        cellClass = 'bg-purple-50 text-purple-800 font-bold hover:bg-purple-100 hover:ring-2 hover:ring-purple-400';
                      } else if (cell.status === 'Akan Berlangsung') {
                        cellClass = 'bg-slate-50/80 text-slate-400 font-normal italic hover:bg-slate-100 hover:ring-2 hover:ring-slate-300';
                      }

                      return (
                        <td
                          key={month}
                          onClick={() => handleCellClickSpp(row, month)}
                          title={`Klik untuk edit pembayaran SPP ${month} - ${row.student_name} (${cell.status}: ${cell.status === 'Belum Lunas' ? `Dibayar Rp${(cell.paidAmount || 0).toLocaleString('id-ID')}, Sisa Rp${(cell.remaining || 0).toLocaleString('id-ID')}` : cell.displayValue})`}
                          className={`py-1.5 px-1.5 text-center text-[11px] border-l border-slate-100 cursor-pointer transition select-none ${cellClass}`}
                        >
                          {cell.status === 'Belum Lunas' ? (
                            <div className="flex flex-col items-center justify-center leading-tight py-0.5">
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[8.5px] font-black uppercase bg-amber-200 text-amber-950 border border-amber-300 tracking-tight">
                                ACC
                              </span>
                              <span className="text-[10px] font-black text-amber-950 mt-0.5">
                                {cell.displayValue}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span>{cell.displayValue}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Non-SPP Columns - CLICK TO EDIT DIRECTLY */}
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Perlengkapan', row.paid_perlengkapan)}
                      title={`Klik untuk ubah pembayaran Perlengkapan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 border-l border-slate-100 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_perlengkapan > 0 ? `Rp${row.paid_perlengkapan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Peralatan', row.paid_peralatan)}
                      title={`Klik untuk ubah pembayaran Peralatan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_peralatan > 0 ? `Rp${row.paid_peralatan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Kegiatan', row.paid_kegiatan)}
                      title={`Klik untuk ubah pembayaran Kegiatan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_kegiatan > 0 ? `Rp${row.paid_kegiatan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Pembangunan', row.paid_pembangunan)}
                      title={`Klik untuk ubah pembayaran Pembangunan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_pembangunan > 0 ? `Rp${row.paid_pembangunan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Ujian', row.paid_ujian)}
                      title={`Klik untuk ubah pembayaran Ujian`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_ujian > 0 ? `Rp${row.paid_ujian.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Lainnya', row.paid_lainnya)}
                      title={`Klik untuk ubah pembayaran Lainnya`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_lainnya > 0 ? `Rp${row.paid_lainnya.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL IN-CELL EDIT: SPP MONTH */}
      {editingSpp && (() => {
        const enteredAmount = Number(editingSpp.paid_amount || 0);
        const tariff = editingSpp.spp_nominal;
        const isPartial = enteredAmount > 0 && enteredAmount < tariff;
        const isFull = enteredAmount >= tariff;
        const remaining = Math.max(0, tariff - enteredAmount);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Edit Pembayaran Sel
                  </span>
                  <h4 className="text-base font-bold text-slate-800 mt-1">
                    {editingSpp.student_name}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Tagihan: <strong>SPP Bulan {editingSpp.month}</strong> (Tarif: Rp{tariff.toLocaleString('id-ID')})
                  </p>
                </div>
                <button
                  onClick={() => setEditingSpp(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-3.5 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Pembayaran (Muncul Pada Sel) *
                  </label>
                  <input
                    type="date"
                    value={editingSpp.current_date}
                    onChange={(e) => setEditingSpp({ ...editingSpp, current_date: e.target.value })}
                    className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Nominal Dibayar (Rp) *
                    </label>
                    <span className="text-[11px] font-semibold text-slate-400">
                      Tarif Penuh: Rp{tariff.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <input
                    type="number"
                    value={editingSpp.paid_amount}
                    onChange={(e) => setEditingSpp({ ...editingSpp, paid_amount: e.target.value })}
                    placeholder={String(tariff)}
                    className="w-full text-sm font-black px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                  />

                  {/* Tombol Cepat / Quick Presets */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setEditingSpp({ ...editingSpp, paid_amount: String(tariff) })}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition"
                    >
                      Bayar Penuh (Lunas)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSpp({ ...editingSpp, paid_amount: String(Math.round(tariff / 2)) })}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 transition"
                    >
                      50% (Rp{Math.round(tariff / 2).toLocaleString('id-ID')})
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSpp({ ...editingSpp, paid_amount: '500000' })}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                      Rp500rb
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSpp({ ...editingSpp, paid_amount: '1000000' })}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                      Rp1 Jt
                    </button>
                  </div>
                </div>

                {/* Box Status & Kalkulator ACC Bayar Sebagian */}
                {isPartial ? (
                  <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-xl space-y-2 text-xs animate-fade-in">
                    <div className="flex items-center justify-between font-bold text-amber-950">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>Kriteria ACC Bayar Sebagian (Cicilan):</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-black uppercase tracking-wide">
                        Status ACC
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/80 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Dibayar Saat Ini:</span>
                        <span className="font-black text-emerald-800 text-xs">
                          Rp{enteredAmount.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Sisa Tunggakan:</span>
                        <span className="font-black text-rose-600 text-xs">
                          Rp{remaining.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-amber-900 leading-tight">
                      💡 <em>Siswa ditandai badge <strong>ACC</strong> di tabel rekap. Sisa tunggakan tetap tercatat akurat dan diakumulasikan.</em>
                    </p>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Catatan ACC / Perjanjian (Opsional):
                      </label>
                      <input
                        type="text"
                        value={editingSpp.notes || ''}
                        onChange={(e) => setEditingSpp({ ...editingSpp, notes: e.target.value })}
                        placeholder="Contoh: ACC Ujian / Janji tgl 25 / Cicilan 1"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                ) : isFull ? (
                  <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs flex items-center justify-between text-emerald-900">
                    <span className="font-bold">Status: Lunas Penuh (100%)</span>
                    <span className="text-[11px] text-emerald-700 font-semibold">Tidak ada sisa tunggakan</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Masukkan nominal bayar, atau gunakan tombol di bawah untuk set Free / Reset.
                  </p>
                )}

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                  {isPartial ? (
                    <button
                      type="button"
                      onClick={() => handleSaveSppEdit('Belum Lunas')}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition shadow-sm shadow-amber-900/10"
                    >
                      <Check className="w-4 h-4 text-amber-200" />
                      <span>Simpan ACC Sebagian (Dibayar Rp{enteredAmount.toLocaleString('id-ID')})</span>
                    </button>
                  ) : isFull ? (
                    <button
                      type="button"
                      onClick={() => handleSaveSppEdit('Lunas')}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs"
                    >
                      <Check className="w-4 h-4 text-gold-400" />
                      <span>Simpan Lunas Penuh (Tampilkan Tanggal)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSaveSppEdit('Belum Dibayar')}
                      className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition"
                    >
                      Tandai Belum Bayar
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveSppEdit('Bebas')}
                      className="py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs rounded-xl border border-purple-200 transition"
                    >
                      Tandai Free / Bebas
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingSpp({ ...editingSpp, paid_amount: '0' });
                        handleSaveSppEdit('Belum Dibayar');
                      }}
                      className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition"
                    >
                      Reset Belum Bayar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL IN-CELL EDIT: NON-SPP CATEGORY */}
      {editingNonSpp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Edit Pembayaran Langsung
                </span>
                <h4 className="text-base font-bold text-slate-800 mt-1">
                  {editingNonSpp.student_name}
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  Item: <strong>{editingNonSpp.category_name}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingNonSpp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Pembayaran Diterima (Rp) *
                </label>
                <input
                  type="number"
                  value={editingNonSpp.input_amount}
                  onChange={(e) => setEditingNonSpp({ ...editingNonSpp, input_amount: e.target.value })}
                  placeholder="Contoh: 2900000"
                  className="w-full text-sm font-black px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tanggal Pembayaran
                </label>
                <input
                  type="date"
                  value={editingNonSpp.payment_date}
                  onChange={(e) => setEditingNonSpp({ ...editingNonSpp, payment_date: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setEditingNonSpp({ ...editingNonSpp, input_amount: '0' })}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-xl transition"
                >
                  Reset Rp0
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingNonSpp(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNonSppEdit}
                    className="px-5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                  >
                    Simpan Nilai
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPORT SISWA BELUM BAYAR SPP */}
      {showUnpaidExportModal && (() => {
        const targetIdx = SPP_MONTHS.indexOf(modalMonthTarget);
        const monthsToCheck = (modalAccumulatePrevious && targetIdx !== -1)
          ? SPP_MONTHS.slice(0, targetIdx + 1)
          : [modalMonthTarget];

        const matchingStudents = recapData
          .map((r) => {
            const mUnit = modalUnitTarget === 'ALL' || r.unit === modalUnitTarget;
            const mGrade = modalGradeTarget === 'ALL' || r.grade === modalGradeTarget;
            if (!mUnit || !mGrade) return null;

            const unpaidMonths = monthsToCheck.filter((m) => {
              const cell = r.sppMonths[m];
              return cell?.status === 'Belum Dibayar' || cell?.status === 'Belum Lunas';
            });

            if (unpaidMonths.length === 0) return null;

            const totalArrears = unpaidMonths.reduce((sum, m) => {
              const cell = r.sppMonths[m];
              return sum + (cell?.amount || r.spp_nominal);
            }, 0);

            return {
              name: r.student_name,
              nis: r.nis,
              unit: r.unit,
              grade: r.grade,
              phone: r.phone,
              spp_nominal: r.spp_nominal,
              unpaid_months: unpaidMonths,
              unpaid_count: unpaidMonths.length,
              total_arrears: totalArrears,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const modalMatchingCount = matchingStudents.length;
        const totalUnpaidMonthsCount = matchingStudents.reduce((sum, s) => sum + s.unpaid_count, 0);
        const totalUnpaidNominalSum = matchingStudents.reduce((sum, s) => sum + s.total_arrears, 0);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-800">
                      Export Tagihan Tunggakan SPP
                    </h4>
                    <p className="text-xs text-slate-500">
                      Download file Excel daftar tagihan siswa beserta akumulasi bulan tertunggak
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUnpaidExportModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-4">
                {/* Target Bulan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Pilih Posisi Bulan SPP Yang Ditagihkan *
                  </label>
                  <select
                    value={modalMonthTarget}
                    onChange={(e) => setModalMonthTarget(e.target.value)}
                    className="w-full text-sm font-bold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    {SPP_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        Bulan SPP: {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Jenjang & Kelas */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Jenjang
                    </label>
                    <select
                      value={modalUnitTarget}
                      onChange={(e) => setModalUnitTarget(e.target.value as any)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      <option value="ALL">Semua Jenjang</option>
                      <option value="TK IT">TK IT</option>
                      <option value="SD IT">SD IT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Kelas
                    </label>
                    <select
                      value={modalGradeTarget}
                      onChange={(e) => setModalGradeTarget(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      <option value="ALL">Semua Kelas</option>
                      <optgroup label="TK IT">
                        <option value="A">Kelas A</option>
                        <option value="B">Kelas B</option>
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
                </div>

                {/* Akumulasi Bulan Sebelumnya Toggle */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="accumulatePrev"
                    checked={modalAccumulatePrevious}
                    onChange={(e) => setModalAccumulatePrevious(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-800 rounded focus:ring-emerald-700 cursor-pointer"
                  />
                  <label htmlFor="accumulatePrev" className="text-xs text-amber-950 font-medium cursor-pointer">
                    <span className="font-bold block text-slate-800">
                      Akumulasikan dengan tunggakan bulan-bulan sebelumnya (Rekomendasi)
                    </span>
                    <span className="text-[11px] text-slate-600 block mt-0.5">
                      Siswa yang menunggak di bulan {modalMonthTarget} maupun bulan sebelumnya ({monthsToCheck.join(', ')}) akan dihitung total akumulasi tagihannya di Excel.
                    </span>
                  </label>
                </div>

                {/* Real-time Statistics Summary */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Siswa Menunggak</span>
                    <span className="text-base font-black text-rose-600">{modalMatchingCount} Siswa</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Bulan Tertunggak</span>
                    <span className="text-base font-black text-slate-800">{totalUnpaidMonthsCount} Bulan</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Tagihan SPP</span>
                    <span className="text-sm font-black text-emerald-800">
                      Rp{totalUnpaidNominalSum.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Preview sample students */}
                {matchingStudents.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      Contoh Siswa Terfilter ({matchingStudents.length} siswa siap diexport):
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-xs">
                      {matchingStudents.slice(0, 4).map((s, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-800">{s.name}</span>
                            <span className="text-[10px] text-slate-500 ml-1.5">({s.unit} · Kelas {s.grade})</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold mr-1.5">
                              {s.unpaid_months.join(', ')}
                            </span>
                            <span className="font-black text-slate-700">
                              Rp{s.total_arrears.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnpaidExportModal(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={modalMatchingCount === 0}
                  onClick={() => {
                    handleExportUnpaid(modalMonthTarget, modalUnitTarget, modalGradeTarget, modalAccumulatePrevious);
                    setShowUnpaidExportModal(false);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 text-white font-bold text-xs rounded-xl shadow-xs transition ${
                    modalMatchingCount > 0
                      ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer'
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Download Excel Tagihan SPP ({modalMatchingCount} Siswa)</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
