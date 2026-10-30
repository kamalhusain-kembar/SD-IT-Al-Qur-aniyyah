import React, { useState, useEffect } from 'react';
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Filter,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Calendar,
  GraduationCap,
  Download,
  Award,
  HeartHandshake
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SPP_MONTHS, isUpcomingSPPMonth } from '../services/billingService';
import { localStore } from '../services/dataStore';
import { isGradeMatch, formatGradeDisplay } from '../types/database';
import * as XLSX from 'xlsx';

interface CategorySummary {
  name: string;
  tagihanTK: number;
  bayarTK: number;
  sisaTK: number;
  tagihanSD: number;
  bayarSD: number;
  sisaSD: number;
  tagihanTotal: number;
  bayarTotal: number;
  sisaTotal: number;
}

export interface StudentClassRecap {
  unit: string;
  grade: string;
  lakiLaki: number;
  perempuan: number;
  mampu: number;
  yatim: number;
  lainnya: number;
  total: number;
}

export const DashboardPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, refreshKey } = useApp();

  const [unitFilter, setUnitFilter] = useState<'ALL' | 'TK IT' | 'SD IT'>('ALL');
  const [classRecapUnitFilter, setClassRecapUnitFilter] = useState<'ALL' | 'TK IT' | 'SD IT'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const [activeStudentsCount, setActiveStudentsCount] = useState(0);
  const [totalBills, setTotalBills] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [totalArrears, setTotalArrears] = useState(0);
  const [activeDueArrears, setActiveDueArrears] = useState(0);
  const [paidStudentsCount, setPaidStudentsCount] = useState(0);
  const [arrearsStudentsCount, setArrearsStudentsCount] = useState(0);

  // Student status & gender breakdown
  const [totalLaki, setTotalLaki] = useState(0);
  const [totalPerempuan, setTotalPerempuan] = useState(0);
  const [totalMampu, setTotalMampu] = useState(0);
  const [totalYatim, setTotalYatim] = useState(0);
  const [totalLainnya, setTotalLainnya] = useState(0);
  const [classRecapList, setClassRecapList] = useState<StudentClassRecap[]>([]);

  // Category breakdown identical to sheet DASHBOARD
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);

  // Monthly SPP performance (Juli - Juni)
  const [monthlySppStats, setMonthlySppStats] = useState<{
    month: string;
    totalTarget: number;
    totalCollected: number;
    totalRemaining: number;
    percentage: number;
  }[]>([]);

  // Recent transactions
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  // Top arrears
  const [topArrears, setTopArrears] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      let activeEnr: any[] = [];
      let recentPmts: any[] = [];
      let bills: any[] = [];
      const allocsByBillId = new Map<string, number>();

      if (!isSupabaseConfigured) {
        // Use local store
        const storeStudents = localStore.getStudents();
        const storeEnr = localStore.getEnrollments().filter((e) => e.academic_year_id === selectedAcademicYearId);
        const storeBills = localStore.getBills().filter((b) => b.academic_year_id === selectedAcademicYearId);
        const storeCategories = localStore.getCategories();
        const storePayments = localStore.getPayments();
        const storeAllocs = localStore.getAllocations();

        activeEnr = storeEnr.map((e) => ({
          ...e,
          student: storeStudents.find((s) => s.id === e.student_id),
        })).filter((e) => e.student && e.student.student_status === 'aktif');

        // Map allocs
        for (const a of storeAllocs) {
          const p = storePayments.find((pm) => pm.id === a.payment_id);
          if (p?.status === 'valid') {
            const prev = allocsByBillId.get(a.bill_id) || 0;
            allocsByBillId.set(a.bill_id, prev + Number(a.allocated_amount || 0));
          }
        }

        bills = storeBills.map((b) => ({
          ...b,
          catName: storeCategories.find((c) => c.id === b.category_id)?.name || 'Lainnya',
          paidAmount: allocsByBillId.get(b.id) || 0,
        }));

        recentPmts = storePayments.filter((p) => p.status === 'valid').slice(0, 5).map((p) => ({
          ...p,
          student: storeStudents.find((s) => s.id === p.student_id),
        }));
      } else {
        // Fast & reliable flat queries to Supabase
        // 1. Enrollments
        let allEnrollments: any[] = [];
        let enrPage = 0;
        const enrPageSize = 1000;
        let enrHasMore = true;

        while (enrHasMore) {
          const { data: enrollments, error: enrErr } = await supabase
            .from('student_enrollments')
            .select(`
              id,
              student_id,
              unit,
              grade,
              administrative_status,
              student:students(
                id,
                full_name,
                nis,
                gender,
                student_status
              )
            `)
            .eq('academic_year_id', selectedAcademicYearId)
            .range(enrPage * enrPageSize, (enrPage + 1) * enrPageSize - 1);

          if (enrErr) {
            console.warn('Enrollment fetch err:', enrErr);
            break;
          }

          if (enrollments && enrollments.length > 0) {
            allEnrollments = allEnrollments.concat(enrollments);
            if (enrollments.length < enrPageSize) enrHasMore = false;
            else enrPage++;
          } else {
            enrHasMore = false;
          }
        }

        activeEnr = allEnrollments.filter(
          (e: any) => e.student && e.student.student_status === 'aktif'
        );

        // 2. Billing Categories
        const { data: catList } = await supabase.from('billing_categories').select('id, name');
        const catMapById = new Map<string, string>();
        (catList || []).forEach((c: any) => catMapById.set(c.id, c.name));

        // 3. Flat payment allocations (only ~2188 rows)
        let aPage = 0;
        while (true) {
          const { data: aData } = await supabase.from('payment_allocations')
            .select('bill_id, allocated_amount, payment:payments(status)')
            .range(aPage * 1000, aPage * 1000 + 999);
          if (!aData || aData.length === 0) break;
          for (const a of aData) {
            if ((a as any).payment?.status === 'valid') {
              const prev = allocsByBillId.get(a.bill_id) || 0;
              allocsByBillId.set(a.bill_id, prev + Number(a.allocated_amount || 0));
            }
          }
          if (aData.length < 1000) break;
          aPage++;
        }

        // 4. Flat bills (7246 rows in fast pages of 1000)
        let allBillsData: any[] = [];
        let bPage = 0;
        while (true) {
          const { data: bData, error: bErr } = await supabase.from('bills')
            .select('id, student_id, category_id, billing_period, amount, status')
            .eq('academic_year_id', selectedAcademicYearId)
            .range(bPage * 1000, bPage * 1000 + 999);
          if (bErr || !bData || bData.length === 0) break;
          allBillsData = allBillsData.concat(bData);
          if (bData.length < 1000) break;
          bPage++;
        }

        bills = allBillsData.map((b) => ({
          ...b,
          catName: catMapById.get(b.category_id) || 'Lainnya',
          paidAmount: allocsByBillId.get(b.id) || 0,
        }));

        // 5. Recent payments
        const { data: pmts } = await supabase
          .from('payments')
          .select(`
            id,
            transaction_number,
            payment_date,
            amount,
            payment_method,
            status,
            student:students(full_name)
          `)
          .eq('status', 'valid')
          .order('payment_date', { ascending: false })
          .limit(5);

        recentPmts = pmts || [];
      }

      // Update student counts immediately
      setActiveStudentsCount(activeEnr.length);

      // Student mapping & unit lookup
      const studentUnitMap = new Map<string, string>();
      const studentGradeMap = new Map<string, string>();
      const studentNameMap = new Map<string, string>();
      const studentNisMap = new Map<string, string>();

      // Initialize class recap
      const defaultRecaps: StudentClassRecap[] = [
        { unit: 'TK IT', grade: 'Kelompok A', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'TK IT', grade: 'Kelompok B', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SD IT', grade: 'I', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SD IT', grade: 'II', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SD IT', grade: 'III', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SD IT', grade: 'IV', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SD IT', grade: 'V', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SD IT', grade: 'VI', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
      ];

      let countLaki = 0;
      let countPerempuan = 0;
      let countMampu = 0;
      let countYatim = 0;
      let countLainnya = 0;

      activeEnr.forEach((e: any) => {
        const stdId = e.student_id || e.student?.id;
        if (stdId) {
          studentUnitMap.set(stdId, e.unit);
          studentGradeMap.set(stdId, e.grade);
          if (e.student) {
            studentNameMap.set(stdId, e.student.full_name);
            studentNisMap.set(stdId, e.student.nis);
          }
        }

        const row = defaultRecaps.find(
          (r) => r.unit === e.unit && isGradeMatch(e.grade, r.grade, e.unit)
        );

        // Gender counting (L / P)
        const g = (e.student?.gender || '').toString().trim().toLowerCase();
        const isLaki = g === 'l' || g.startsWith('laki');
        if (isLaki) {
          countLaki++;
          if (row) row.lakiLaki++;
        } else {
          countPerempuan++;
          if (row) row.perempuan++;
        }

        const st = (e.administrative_status || 'Mampu').toLowerCase();
        if (row) {
          if (st === 'mampu') {
            row.mampu++;
            countMampu++;
          } else if (st === 'yatim') {
            row.yatim++;
            countYatim++;
          } else {
            row.lainnya++;
            countLainnya++;
          }
          row.total++;
        }
      });

      setTotalLaki(countLaki);
      setTotalPerempuan(countPerempuan);
      setTotalMampu(countMampu);
      setTotalYatim(countYatim);
      setTotalLainnya(countLainnya);
      setClassRecapList(defaultRecaps);

      let sumBills = 0;
      let sumPaid = 0;
      const studentBalanceMap = new Map<string, { studentId: string; totalBills: number; totalPaid: number }>();

      const catMap: Record<string, {
        tkTagihan: number; tkBayar: number;
        sdTagihan: number; sdBayar: number;
      }> = {
        'SPP': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
        'Perlengkapan': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
        'Peralatan': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
        'Kegiatan': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
        'Pembangunan': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
        'Ujian': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
        'Lainnya': { tkTagihan: 0, tkBayar: 0, sdTagihan: 0, sdBayar: 0 },
      };

      const sppMonthMap: Record<string, { target: number; collected: number }> = {};
      SPP_MONTHS.forEach((m) => {
        sppMonthMap[m] = { target: 0, collected: 0 };
      });

      let sumActiveDueBills = 0;

      for (const bill of bills || []) {
        const studentUnit = studentUnitMap.get(bill.student_id) || 'SD IT';
        const billAmount = Number(bill.amount || 0);
        const paidAmount = Number(bill.paidAmount || 0);

        let catName = bill.catName || 'Lainnya';
        if (catName.includes('Syahriyyah') || catName.includes('SPP')) catName = 'SPP';
        else if (catName.includes('Perlengkapan')) catName = 'Perlengkapan';
        else if (catName.includes('Peralatan')) catName = 'Peralatan';
        else if (catName.includes('Kegiatan')) catName = 'Kegiatan';
        else if (catName.includes('Pembangunan')) catName = 'Pembangunan';
        else if (catName.includes('Ujian')) catName = 'Ujian';
        else catName = 'Lainnya';

        const isSpp = catName === 'SPP';
        const isUpcoming = isSpp && isUpcomingSPPMonth(bill.billing_period, selectedAcademicYear);

        if (bill.status !== 'Bebas') {
          sumBills += billAmount;
          sumPaid += paidAmount;

          if (!isUpcoming || paidAmount > 0) {
            sumActiveDueBills += billAmount;
          }

          if (!studentBalanceMap.has(bill.student_id)) {
            studentBalanceMap.set(bill.student_id, {
              studentId: bill.student_id,
              totalBills: 0,
              totalPaid: 0,
            });
          }
          const sBal = studentBalanceMap.get(bill.student_id)!;
          if (!isUpcoming || paidAmount > 0) {
            sBal.totalBills += billAmount;
            sBal.totalPaid += paidAmount;
          }
        }

        if (!isUpcoming || paidAmount > 0) {
          if (studentUnit === 'TK IT') {
            if (bill.status !== 'Bebas') catMap[catName].tkTagihan += billAmount;
            catMap[catName].tkBayar += paidAmount;
          } else {
            if (bill.status !== 'Bebas') catMap[catName].sdTagihan += billAmount;
            catMap[catName].sdBayar += paidAmount;
          }
        }

        if (catName === 'SPP' && bill.billing_period && sppMonthMap[bill.billing_period]) {
          if (bill.status !== 'Bebas') {
            sppMonthMap[bill.billing_period].target += billAmount;
          }
          sppMonthMap[bill.billing_period].collected += paidAmount;
        }
      }

      const activeArrears = Math.max(0, sumActiveDueBills - sumPaid);

      setTotalBills(sumActiveDueBills);
      setTotalPayments(sumPaid);
      setTotalArrears(activeArrears);
      setActiveDueArrears(activeArrears);

      let countPaid = 0;
      let countArrears = 0;
      const studentArrearsList: any[] = [];

      studentBalanceMap.forEach((bal) => {
        const remaining = Math.max(0, bal.totalBills - bal.totalPaid);
        if (remaining === 0) {
          countPaid++;
        } else {
          countArrears++;
          studentArrearsList.push({
            studentId: bal.studentId,
            remaining,
          });
        }
      });

      setPaidStudentsCount(countPaid);
      setArrearsStudentsCount(countArrears);

      const catOrder = ['SPP', 'Perlengkapan', 'Peralatan', 'Kegiatan', 'Pembangunan', 'Ujian', 'Lainnya'];
      const builtSummaries: CategorySummary[] = catOrder.map((catKey) => {
        const data = catMap[catKey];
        const sisaTK = Math.max(0, data.tkTagihan - data.tkBayar);
        const sisaSD = Math.max(0, data.sdTagihan - data.sdBayar);
        const tagihanTotal = data.tkTagihan + data.sdTagihan;
        const bayarTotal = data.tkBayar + data.sdBayar;
        const sisaTotal = Math.max(0, tagihanTotal - bayarTotal);

        return {
          name: catKey === 'SPP' ? 'INFAQ SYAHRIYYAH (SPP)' : catKey.toUpperCase(),
          tagihanTK: data.tkTagihan,
          bayarTK: data.tkBayar,
          sisaTK,
          tagihanSD: data.sdTagihan,
          bayarSD: data.sdBayar,
          sisaSD,
          tagihanTotal,
          bayarTotal,
          sisaTotal,
        };
      });

      setCategorySummaries(builtSummaries);

      const builtMonthly = SPP_MONTHS.map((m) => {
        const item = sppMonthMap[m];
        const remaining = Math.max(0, item.target - item.collected);
        const percentage = item.target > 0 ? (item.collected / item.target) * 100 : 0;
        return {
          month: m,
          totalTarget: item.target,
          totalCollected: item.collected,
          totalRemaining: remaining,
          percentage,
        };
      });
      setMonthlySppStats(builtMonthly);

      studentArrearsList.sort((a, b) => b.remaining - a.remaining);
      const topFive = studentArrearsList.slice(0, 5);

      const mergedTop = topFive.map((s) => ({
        id: s.studentId,
        name: studentNameMap.get(s.studentId) || 'Siswa',
        nis: studentNisMap.get(s.studentId),
        unit: studentUnitMap.get(s.studentId) || 'SD IT',
        grade: studentGradeMap.get(s.studentId) || '-',
        remaining: s.remaining,
      }));

      setTopArrears(mergedTop);
      setRecentTransactions(recentPmts);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedAcademicYearId, refreshKey]);

  const formatRupiah = (val: number) => {
    return 'Rp' + Number(val || 0).toLocaleString('id-ID');
  };

  // Export Rekap Siswa Per Kelas & Jenjang
  const handleExportClassRecap = () => {
    const exportRows: any[] = classRecapList.map((r, idx) => ({
      'No': idx + 1,
      'Jenjang': r.unit,
      'Kelas': r.grade,
      'Laki-laki (L)': r.lakiLaki,
      'Perempuan (P)': r.perempuan,
      'Mampu (Reguler)': r.mampu,
      'Yatim (Bebas Biaya)': r.yatim,
      'Lainnya (Beasiswa/Dhuafa)': r.lainnya,
      'Total Siswa': r.total,
      'Persentase Mampu (%)': r.total > 0 ? ((r.mampu / r.total) * 100).toFixed(1) + '%' : '0%',
    }));

    // Subtotal rows
    exportRows.push({
      'No': '' as any,
      'Jenjang': 'SUBTOTAL TK IT',
      'Kelas': 'Kelompok A & B',
      'Laki-laki (L)': tkSubtotal.lakiLaki,
      'Perempuan (P)': tkSubtotal.perempuan,
      'Mampu (Reguler)': tkSubtotal.mampu,
      'Yatim (Bebas Biaya)': tkSubtotal.yatim,
      'Lainnya (Beasiswa/Dhuafa)': tkSubtotal.lainnya,
      'Total Siswa': tkSubtotal.total,
      'Persentase Mampu (%)': tkSubtotal.total > 0 ? ((tkSubtotal.mampu / tkSubtotal.total) * 100).toFixed(1) + '%' : '0%',
    });

    exportRows.push({
      'No': '' as any,
      'Jenjang': 'SUBTOTAL SD IT',
      'Kelas': 'Kelas I - VI',
      'Laki-laki (L)': sdSubtotal.lakiLaki,
      'Perempuan (P)': sdSubtotal.perempuan,
      'Mampu (Reguler)': sdSubtotal.mampu,
      'Yatim (Bebas Biaya)': sdSubtotal.yatim,
      'Lainnya (Beasiswa/Dhuafa)': sdSubtotal.lainnya,
      'Total Siswa': sdSubtotal.total,
      'Persentase Mampu (%)': sdSubtotal.total > 0 ? ((sdSubtotal.mampu / sdSubtotal.total) * 100).toFixed(1) + '%' : '0%',
    });

    exportRows.push({
      'No': '' as any,
      'Jenjang': 'TOTAL KESELURUHAN',
      'Kelas': 'Semua Kelas',
      'Laki-laki (L)': totalLaki,
      'Perempuan (P)': totalPerempuan,
      'Mampu (Reguler)': totalMampu,
      'Yatim (Bebas Biaya)': totalYatim,
      'Lainnya (Beasiswa/Dhuafa)': totalLainnya,
      'Total Siswa': activeStudentsCount,
      'Persentase Mampu (%)': activeStudentsCount > 0 ? ((totalMampu / activeStudentsCount) * 100).toFixed(1) + '%' : '0%',
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Kelas & Status');
    XLSX.writeFile(wb, `Rekap_Siswa_Kelas_Status_${selectedAcademicYear?.name || '2026-2027'}.xlsx`);
  };

  const filteredClassRecap = classRecapList.filter((r) => {
    if (classRecapUnitFilter === 'ALL') return true;
    return r.unit === classRecapUnitFilter;
  });

  const tkSubtotal = classRecapList.filter((r) => r.unit === 'TK IT').reduce((acc, r) => ({
    lakiLaki: acc.lakiLaki + r.lakiLaki,
    perempuan: acc.perempuan + r.perempuan,
    mampu: acc.mampu + r.mampu,
    yatim: acc.yatim + r.yatim,
    lainnya: acc.lainnya + r.lainnya,
    total: acc.total + r.total,
  }), { lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 });

  const sdSubtotal = classRecapList.filter((r) => r.unit === 'SD IT').reduce((acc, r) => ({
    lakiLaki: acc.lakiLaki + r.lakiLaki,
    perempuan: acc.perempuan + r.perempuan,
    mampu: acc.mampu + r.mampu,
    yatim: acc.yatim + r.yatim,
    lainnya: acc.lainnya + r.lainnya,
    total: acc.total + r.total,
  }), { lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 });

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Top Banner / Academic Year Status */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-850 to-emerald-950 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-md border border-emerald-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-gold-400 text-emerald-950 mb-1.5 sm:mb-2">
            <Calendar className="w-3.5 h-3.5" />
            Tahun Ajaran {selectedAcademicYear?.name || '2026/2027'}
          </span>
          <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white leading-tight">
            Dashboard Keuangan Yayasan Al-Qur’aniyyah
          </h2>
          <p className="text-emerald-200/80 text-xs sm:text-sm mt-1 max-w-2xl hidden xs:block">
            Ringkasan data real-time penerimaan Infaq Syahriyyah (SPP), perlengkapan, pembangunan, dan rekap tunggakan siswa unit TK IT &amp; SD IT.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => fetchDashboardData()}
            disabled={isLoading}
            className="flex items-center gap-1.5 sm:gap-2 bg-emerald-800/80 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition shadow-xs border border-emerald-600/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Perbarui Data</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards: 2 Columns on Mobile, 4 on Desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Siswa Aktif</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-800 mt-0.5 sm:mt-1">{activeStudentsCount}</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
              <span className="text-emerald-600 font-semibold">{paidStudentsCount} lunas</span> ·{' '}
              <span className="text-rose-600 font-semibold">{arrearsStudentsCount} nunggak</span>
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Total Tagihan (s/d Okt)</p>
            <h3 className="text-sm sm:text-2xl font-black text-slate-800 mt-0.5 sm:mt-1 truncate">{formatRupiah(totalBills)}</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">Kewajiban berjalan</p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 truncate">Pemasukan Diterima</p>
            <h3 className="text-sm sm:text-2xl font-black text-emerald-700 mt-0.5 sm:mt-1 truncate">{formatRupiah(totalPayments)}</h3>
            <p className="text-[10px] sm:text-xs text-emerald-600/80 font-medium mt-0.5 sm:mt-1 truncate">
              {totalBills > 0 ? ((totalPayments / totalBills) * 100).toFixed(1) : 0}% terealisasi
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-rose-500 truncate">Sisa Tunggakan</p>
            <h3 className="text-sm sm:text-2xl font-black text-rose-600 mt-0.5 sm:mt-1 truncate">{formatRupiah(totalArrears)}</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
              s/d Oktober
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* REKAP STATUS SISWA & KELAS (Requested by user) */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Header Section */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <h3 className="text-base font-bold text-slate-800 tracking-tight">
                Rekapitulasi Siswa Tiap Kelas & Jenjang
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribusi jenis kelamin (L/P) dan status administrasi pembiayaan (Mampu, Bebas Yatim, Beasiswa/Dhuafa).
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-medium">
              <button
                onClick={() => setClassRecapUnitFilter('ALL')}
                className={`px-3 py-1.5 rounded-md transition ${
                  classRecapUnitFilter === 'ALL'
                    ? 'bg-white text-slate-800 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Jenjang
              </button>
              <button
                onClick={() => setClassRecapUnitFilter('TK IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  classRecapUnitFilter === 'TK IT'
                    ? 'bg-white text-amber-800 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                TK IT (A &amp; B)
              </button>
              <button
                onClick={() => setClassRecapUnitFilter('SD IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  classRecapUnitFilter === 'SD IT'
                    ? 'bg-white text-emerald-800 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                SD IT (I - VI)
              </button>
            </div>

            <button
              onClick={handleExportClassRecap}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Compact & Elegant Stat Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/50 border-b border-slate-100">
          <div className="px-5 py-3">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Santri Putra (L)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-slate-800 tabular-nums">{totalLaki}</span>
              <span className="text-[11px] text-slate-500 font-medium">
                ({activeStudentsCount > 0 ? ((totalLaki / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          </div>

          <div className="px-5 py-3">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Santri Putri (P)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-slate-800 tabular-nums">{totalPerempuan}</span>
              <span className="text-[11px] text-slate-500 font-medium">
                ({activeStudentsCount > 0 ? ((totalPerempuan / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          </div>

          <div className="px-5 py-3">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Mampu (Reguler)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-emerald-700 tabular-nums">{totalMampu}</span>
              <span className="text-[11px] text-emerald-600/80 font-medium">
                ({activeStudentsCount > 0 ? ((totalMampu / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          </div>

          <div className="px-5 py-3">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Yatim (Free)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-slate-800 tabular-nums">{totalYatim}</span>
              <span className="text-[11px] text-slate-500 font-medium">
                ({activeStudentsCount > 0 ? ((totalYatim / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          </div>

          <div className="px-5 py-3 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Beasiswa / Lainnya</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-slate-800 tabular-nums">{totalLainnya}</span>
              <span className="text-[11px] text-slate-500 font-medium">
                ({activeStudentsCount > 0 ? ((totalLainnya / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          </div>
        </div>

        {/* Clean, Refined Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-2.5 px-4 w-12 text-center text-slate-400">No</th>
                <th className="py-2.5 px-4">Jenjang</th>
                <th className="py-2.5 px-4 text-center">Kelas</th>
                <th className="py-2.5 px-4 text-right">L (Putra)</th>
                <th className="py-2.5 px-4 text-right">P (Putri)</th>
                <th className="py-2.5 px-4 text-right">Mampu</th>
                <th className="py-2.5 px-4 text-right">Yatim</th>
                <th className="py-2.5 px-4 text-right">Lainnya</th>
                <th className="py-2.5 px-4 text-right text-slate-800 font-bold">Total Siswa</th>
                <th className="py-2.5 px-4 text-center">Rasio Mampu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClassRecap.map((row, idx) => {
                const ratio = row.total > 0 ? Math.round((row.mampu / row.total) * 100) : 0;
                return (
                  <tr key={`${row.unit}-${row.grade}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        row.unit === 'TK IT'
                          ? 'bg-amber-50/80 text-amber-800 border-amber-200/60'
                          : 'bg-emerald-50/80 text-emerald-800 border-emerald-200/60'
                      }`}>
                        {row.unit}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center font-semibold text-slate-800 whitespace-nowrap">
                      {formatGradeDisplay(row.grade, row.unit)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                      {row.lakiLaki}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                      {row.perempuan}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                      {row.mampu}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                      {row.yatim}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                      {row.lainnya}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {row.total}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                        {ratio}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* Subtotal TK IT */}
              {(classRecapUnitFilter === 'ALL' || classRecapUnitFilter === 'TK IT') && (
                <tr className="bg-amber-50/80 font-semibold text-slate-800 border-t border-slate-200">
                  <td className="py-2.5 px-4 text-left font-bold pl-6 text-amber-900" colSpan={3}>
                    Subtotal TK IT (Kelompok A &amp; B)
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{tkSubtotal.lakiLaki}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{tkSubtotal.perempuan}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{tkSubtotal.mampu}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{tkSubtotal.yatim}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{tkSubtotal.lainnya}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 tabular-nums">{tkSubtotal.total}</td>
                  <td className="py-2.5 px-4 text-center text-slate-600 font-medium">
                    {tkSubtotal.total > 0 ? ((tkSubtotal.mampu / tkSubtotal.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}

              {/* Subtotal SD IT */}
              {(classRecapUnitFilter === 'ALL' || classRecapUnitFilter === 'SD IT') && (
                <tr className="bg-emerald-50/80 font-semibold text-slate-800 border-t border-slate-200">
                  <td className="py-2.5 px-4 text-left font-bold pl-6 text-emerald-900" colSpan={3}>
                    Subtotal SD IT (Kelas I - VI)
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{sdSubtotal.lakiLaki}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{sdSubtotal.perempuan}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{sdSubtotal.mampu}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{sdSubtotal.yatim}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800 tabular-nums">{sdSubtotal.lainnya}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900 tabular-nums">{sdSubtotal.total}</td>
                  <td className="py-2.5 px-4 text-center text-slate-600 font-medium">
                    {sdSubtotal.total > 0 ? ((sdSubtotal.mampu / sdSubtotal.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}

              {/* Grand Total */}
              {classRecapUnitFilter === 'ALL' && (
                <tr className="bg-slate-900 font-bold text-white border-t-2 border-slate-800">
                  <td className="py-3 px-4 text-left font-extrabold pl-6" colSpan={3}>
                    TOTAL KESELURUHAN (TK IT &amp; SD IT)
                  </td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-200">{totalLaki}</td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-200">{totalPerempuan}</td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums text-emerald-300">{totalMampu}</td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-200">{totalYatim}</td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-200">{totalLainnya}</td>
                  <td className="py-3 px-4 text-right font-black tabular-nums text-gold-400">{activeStudentsCount}</td>
                  <td className="py-3 px-4 text-center text-emerald-300 font-bold">
                    {activeStudentsCount > 0 ? ((totalMampu / activeStudentsCount) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Main Breakdown: NOMINAL KEUANGAN PER ITEM */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Rekapitulasi Keuangan Per Item (TK IT &amp; SD IT)
            </h3>
            <p className="text-xs text-slate-500">
              Kewajiban aktif berjalan s/d Oktober (bulan mendatang belum dihitung sebagai tunggakan)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Filter Tampilan:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-xs font-semibold">
              <button
                onClick={() => setUnitFilter('ALL')}
                className={`px-3 py-1.5 rounded-md transition ${
                  unitFilter === 'ALL' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Seluruh Unit
              </button>
              <button
                onClick={() => setUnitFilter('TK IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  unitFilter === 'TK IT' ? 'bg-amber-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                TK IT
              </button>
              <button
                onClick={() => setUnitFilter('SD IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  unitFilter === 'SD IT' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                SD IT
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-emerald-950 text-white font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 border-b border-emerald-900 w-12 text-center">No</th>
                <th className="py-3.5 px-4 border-b border-emerald-900">Item Keuangan</th>
                {(unitFilter === 'ALL' || unitFilter === 'TK IT') && (
                  <>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-amber-950/60">
                      Tagihan TK
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-amber-950/60">
                      Masuk TK
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-amber-950/60">
                      Sisa TK
                    </th>
                  </>
                )}
                {(unitFilter === 'ALL' || unitFilter === 'SD IT') && (
                  <>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900/60">
                      Tagihan SD
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900/60">
                      Masuk SD
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900/60">
                      Sisa SD
                    </th>
                  </>
                )}
                {unitFilter === 'ALL' && (
                  <>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-slate-900">
                      Total Tagihan
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900">
                      Total Masuk
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-rose-950">
                      Total Sisa
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {categorySummaries.map((item, idx) => (
                <tr key={item.name} className="hover:bg-emerald-50/40 transition">
                  <td className="py-3 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{item.name}</td>
                  {(unitFilter === 'ALL' || unitFilter === 'TK IT') && (
                    <>
                      <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(item.tagihanTK)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700 font-semibold">{formatRupiah(item.bayarTK)}</td>
                      <td className="py-3 px-4 text-right text-rose-600 font-semibold">{formatRupiah(item.sisaTK)}</td>
                    </>
                  )}
                  {(unitFilter === 'ALL' || unitFilter === 'SD IT') && (
                    <>
                      <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(item.tagihanSD)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700 font-semibold">{formatRupiah(item.bayarSD)}</td>
                      <td className="py-3 px-4 text-right text-rose-600 font-semibold">{formatRupiah(item.sisaSD)}</td>
                    </>
                  )}
                  {unitFilter === 'ALL' && (
                    <>
                      <td className="py-3 px-4 text-right font-bold text-slate-800 bg-slate-50/60">
                        {formatRupiah(item.tagihanTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-800 bg-emerald-50/40">
                        {formatRupiah(item.bayarTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-700 bg-rose-50/30">
                        {formatRupiah(item.sisaTotal)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="py-3.5 px-4 text-center" colSpan={2}>
                  TOTAL KESELURUHAN
                </td>
                {(unitFilter === 'ALL' || unitFilter === 'TK IT') && (
                  <>
                    <td className="py-3.5 px-4 text-right">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.tagihanTK, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-800">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.bayarTK, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-700">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.sisaTK, 0))}
                    </td>
                  </>
                )}
                {(unitFilter === 'ALL' || unitFilter === 'SD IT') && (
                  <>
                    <td className="py-3.5 px-4 text-right">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.tagihanSD, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-800">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.bayarSD, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-700">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.sisaSD, 0))}
                    </td>
                  </>
                )}
                {unitFilter === 'ALL' && (
                  <>
                    <td className="py-3.5 px-4 text-right bg-slate-200">
                      {formatRupiah(totalBills)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-850 bg-emerald-100">
                      {formatRupiah(totalPayments)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-800 bg-rose-100">
                      {formatRupiah(totalArrears)}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Grid: Monthly SPP Collection Rate & Top Arrears / Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-slate-800">
                Pencapaian Infaq Syahriyyah (SPP) Per Bulan
              </h3>
              <p className="text-xs text-slate-500">
                Tingkat kolektibilitas SPP dari Juli hingga Juni
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              Juli - Juni
            </span>
          </div>

          <div className="space-y-3">
            {monthlySppStats.map((item) => (
              <div key={item.month} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-800 w-24">{item.month}</span>
                  <span className="text-slate-500 text-[11px]">
                    Masuk: <strong className="text-emerald-700">{formatRupiah(item.totalCollected)}</strong> /{' '}
                    Target: {formatRupiah(item.totalTarget)}
                  </span>
                  <span
                    className={`font-bold w-14 text-right ${
                      item.percentage >= 80
                        ? 'text-emerald-600'
                        : item.percentage >= 40
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.percentage >= 80
                        ? 'bg-emerald-500'
                        : item.percentage >= 40
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center justify-between">
              <span>Siswa Tunggakan Terbesar</span>
              <span className="text-[11px] text-rose-600 font-semibold">Top 5</span>
            </h4>

            {topArrears.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Tidak ada data tunggakan.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {topArrears.map((st) => (
                  <div key={st.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{st.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {st.unit} · {formatGradeDisplay(st.grade, st.unit)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-rose-600">{formatRupiah(st.remaining)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center justify-between">
              <span>Transaksi Terakhir</span>
              <span className="text-[11px] text-emerald-600 font-semibold">Real-time</span>
            </h4>

            {recentTransactions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Belum ada transaksi tercatat.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{tx.student?.full_name || 'Siswa'}</p>
                      <p className="text-[11px] text-slate-400">
                        {tx.payment_date} · {tx.payment_method || 'Tunai'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-700">{formatRupiah(tx.amount)}</p>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                        Sukses
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
