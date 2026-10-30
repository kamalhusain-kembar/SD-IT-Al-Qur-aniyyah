import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  FileSpreadsheet,
  TrendingUp,
  Receipt,
  Users,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SPP_MONTHS } from '../services/billingService';
import { localStore } from '../services/dataStore';
import * as XLSX from 'xlsx';

export const FinancialReportPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey } = useApp();

  const [activeReportTab, setActiveReportTab] = useState<'monthly' | 'categories' | 'units'>('monthly');
  const [isLoading, setIsLoading] = useState(true);

  // Monthly income report
  const [monthlyData, setMonthlyData] = useState<{
    month: string;
    targetAmount: number;
    receivedAmount: number;
    remainingAmount: number;
    percentage: number;
  }[]>([]);

  // Category income report
  const [categoryData, setCategoryData] = useState<{
    categoryName: string;
    totalBills: number;
    totalReceived: number;
    remaining: number;
    percentage: number;
  }[]>([]);

  // Unit breakdown report
  const [unitData, setUnitData] = useState<{
    unit: string;
    studentCount: number;
    totalBills: number;
    totalReceived: number;
    totalArrears: number;
  }[]>([]);

  const loadReports = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      let bills: any[] = [];
      let enrollments: any[] = [];

      if (!isSupabaseConfigured) {
        const storeBills = localStore.getBills().filter((b) => b.academic_year_id === selectedAcademicYearId);
        const storeCats = localStore.getCategories();
        const storePmts = localStore.getPayments();
        const storeAllocs = localStore.getAllocations();

        bills = storeBills.map((b) => ({
          ...b,
          category: storeCats.find((c) => c.id === b.category_id),
          allocations: storeAllocs.filter((a) => a.bill_id === b.id).map((a) => ({
            ...a,
            payment: storePmts.find((p) => p.id === a.payment_id),
          })),
        }));

        enrollments = localStore.getEnrollments().filter((e) => e.academic_year_id === selectedAcademicYearId);
      } else {
        let allBillsData: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data: bBatch, error: bErr } = await supabase
            .from('bills')
            .select(`
              id,
              student_id,
              category_id,
              billing_period,
              amount,
              status,
              category:billing_categories(name),
              allocations:payment_allocations(
                allocated_amount,
                payment:payments(status, payment_date)
              )
            `)
            .eq('academic_year_id', selectedAcademicYearId)
            .range(from, to);

          if (bErr) throw bErr;

          if (bBatch && bBatch.length > 0) {
            allBillsData = allBillsData.concat(bBatch);
            if (bBatch.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }

        bills = allBillsData;

        let allEnrData: any[] = [];
        let enrPage = 0;
        const enrPageSize = 1000;
        let enrHasMore = true;

        while (enrHasMore) {
          const { data: enrData } = await supabase
            .from('student_enrollments')
            .select('student_id, unit, grade')
            .eq('academic_year_id', selectedAcademicYearId)
            .range(enrPage * enrPageSize, (enrPage + 1) * enrPageSize - 1);

          if (enrData && enrData.length > 0) {
            allEnrData = allEnrData.concat(enrData);
            if (enrData.length < enrPageSize) enrHasMore = false;
            else enrPage++;
          } else {
            enrHasMore = false;
          }
        }

        enrollments = allEnrData;
      }

      const studentUnitMap = new Map<string, string>();
      (enrollments || []).forEach((e) => studentUnitMap.set(e.student_id, e.unit));

      // Process Monthly SPP
      const mStats: Record<string, { target: number; received: number }> = {};
      SPP_MONTHS.forEach((m) => {
        mStats[m] = { target: 0, received: 0 };
      });

      // Process Categories
      const cStats: Record<string, { bills: number; received: number }> = {};

      // Process Units
      const uStats: Record<string, { count: Set<string>; bills: number; received: number }> = {
        'TK IT': { count: new Set(), bills: 0, received: 0 },
        'SD IT': { count: new Set(), bills: 0, received: 0 },
      };

      for (const bill of bills || []) {
        const bAmt = Number(bill.amount || 0);
        const validPaid = (bill.allocations || [])
          .filter((a: any) => a.payment?.status === 'valid')
          .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        const catObj: any = Array.isArray(bill.category) ? bill.category[0] : bill.category;
        const catName = catObj?.name || 'Lainnya';
        const unit = studentUnitMap.get(bill.student_id) || 'SD IT';

        // Monthly
        if (bill.billing_period && mStats[bill.billing_period]) {
          if (bill.status !== 'Bebas') {
            mStats[bill.billing_period].target += bAmt;
          }
          mStats[bill.billing_period].received += validPaid;
        }

        // Category
        if (!cStats[catName]) cStats[catName] = { bills: 0, received: 0 };
        if (bill.status !== 'Bebas') cStats[catName].bills += bAmt;
        cStats[catName].received += validPaid;

        // Unit
        if (!uStats[unit]) uStats[unit] = { count: new Set(), bills: 0, received: 0 };
        uStats[unit].count.add(bill.student_id);
        if (bill.status !== 'Bebas') uStats[unit].bills += bAmt;
        uStats[unit].received += validPaid;
      }

      // Build Monthly Array
      const builtMonthly = SPP_MONTHS.map((m) => {
        const item = mStats[m];
        const rem = Math.max(0, item.target - item.received);
        const pct = item.target > 0 ? (item.received / item.target) * 100 : 0;
        return {
          month: m,
          targetAmount: item.target,
          receivedAmount: item.received,
          remainingAmount: rem,
          percentage: pct,
        };
      });
      setMonthlyData(builtMonthly);

      // Build Category Array
      const builtCategories = Object.keys(cStats).map((cName) => {
        const item = cStats[cName];
        const rem = Math.max(0, item.bills - item.received);
        const pct = item.bills > 0 ? (item.received / item.bills) * 100 : 0;
        return {
          categoryName: cName,
          totalBills: item.bills,
          totalReceived: item.received,
          remaining: rem,
          percentage: pct,
        };
      });
      setCategoryData(builtCategories);

      // Build Unit Array
      const builtUnits = Object.keys(uStats).map((uName) => {
        const item = uStats[uName];
        const rem = Math.max(0, item.bills - item.received);
        return {
          unit: uName,
          studentCount: item.count.size,
          totalBills: item.bills,
          totalReceived: item.received,
          totalArrears: rem,
        };
      });
      setUnitData(builtUnits);
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memuat laporan: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [selectedAcademicYearId, refreshKey]);

  const handleExportCurrentTab = () => {
    let filename = `Laporan_Keuangan_${selectedAcademicYear?.name.replace('/', '-')}`;
    let rows: any[] = [];

    if (activeReportTab === 'monthly') {
      filename += '_Bulanan_SPP';
      rows = monthlyData.map((m, idx) => ({
        'NO': idx + 1,
        'BULAN': m.month,
        'TARGET TAGIHAN (Rp)': m.targetAmount,
        'DITERIMA (Rp)': m.receivedAmount,
        'TERTUNGGAK (Rp)': m.remainingAmount,
        'PERSENTASE (%)': m.percentage.toFixed(2) + '%',
      }));
    } else if (activeReportTab === 'categories') {
      filename += '_Per_Kategori';
      rows = categoryData.map((c, idx) => ({
        'NO': idx + 1,
        'KATEGORI PEMBIAYAAN': c.categoryName,
        'TOTAL TAGIHAN (Rp)': c.totalBills,
        'TOTAL PEMBAYARAN (Rp)': c.totalReceived,
        'SISA TUNGGAKAN (Rp)': c.remaining,
        'PERSENTASE (%)': c.percentage.toFixed(2) + '%',
      }));
    } else {
      filename += '_Per_Jenjang';
      rows = unitData.map((u, idx) => ({
        'NO': idx + 1,
        'JENJANG': u.unit,
        'JUMLAH SISWA': u.studentCount,
        'TOTAL TAGIHAN (Rp)': u.totalBills,
        'TOTAL PEMASUKAN (Rp)': u.totalReceived,
        'TOTAL TUNGGAKAN (Rp)': u.totalArrears,
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    showToast('Laporan berhasil diexport ke Excel', 'success');
  };

  return (
    <div className="space-y-3 pb-8">
      {/* Dense Desktop-Style Toolbar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 leading-tight">Laporan Keuangan & Rekapitulasi</h3>
          <p className="text-[11px] text-slate-500">
            Laporan penerimaan SPP, kategori tagihan, dan komparasi unit (T.A. {selectedAcademicYear?.name || 'Aktif'})
          </p>
        </div>

        <button
          onClick={handleExportCurrentTab}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-2xs"
        >
          <Download className="w-3.5 h-3.5 text-gold-400" />
          <span>Export Excel</span>
        </button>
      </div>

      {/* Horizontally scrollable tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto no-scrollbar whitespace-nowrap bg-white p-1 rounded-xl shadow-2xs">
        <button
          onClick={() => setActiveReportTab('monthly')}
          className={`py-2 px-3 font-bold text-xs rounded-lg transition shrink-0 ${
            activeReportTab === 'monthly'
              ? 'bg-emerald-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Pemasukan SPP Per Bulan
        </button>
        <button
          onClick={() => setActiveReportTab('categories')}
          className={`py-2 px-3 font-bold text-xs rounded-lg transition shrink-0 ${
            activeReportTab === 'categories'
              ? 'bg-emerald-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Per Kategori Pembiayaan
        </button>
        <button
          onClick={() => setActiveReportTab('units')}
          className={`py-2 px-3 font-bold text-xs rounded-lg transition shrink-0 ${
            activeReportTab === 'units'
              ? 'bg-emerald-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Rekapitulasi Unit TK IT &amp; SD IT
        </button>
      </div>

      {activeReportTab === 'monthly' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-230px)] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
                <tr className="text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-20">No</th>
                  <th className="py-2.5 px-3 sticky left-10 bg-slate-100 z-20 min-w-[120px]">Bulan</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Target SPP</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Diterima</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Tertunggak</th>
                  <th className="py-2.5 px-3 text-center min-w-[90px]">Realisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {monthlyData.map((m, idx) => (
                  <tr key={m.month} className="hover:bg-slate-50/60 group">
                    <td className="py-2 px-3 text-center text-slate-400 font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">{idx + 1}</td>
                    <td className="py-2 px-3 font-bold text-slate-800 sticky left-10 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap">{m.month}</td>
                    <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">
                      Rp{m.targetAmount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      Rp{m.receivedAmount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-rose-600 whitespace-nowrap">
                      Rp{m.remainingAmount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                          m.percentage >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.percentage >= 40
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {m.percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300">
                <tr className="font-black text-slate-900 text-xs">
                  <td className="py-2.5 px-3 text-center sticky left-0 bg-slate-100 z-20" colSpan={2}>
                    TOTAL SPP (JULI - JUNI)
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    Rp{monthlyData.reduce((s, m) => s + m.targetAmount, 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-800 whitespace-nowrap">
                    Rp{monthlyData.reduce((s, m) => s + m.receivedAmount, 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-700 whitespace-nowrap">
                    Rp{monthlyData.reduce((s, m) => s + m.remainingAmount, 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {(
                      (monthlyData.reduce((s, m) => s + m.receivedAmount, 0) /
                        (monthlyData.reduce((s, m) => s + m.targetAmount, 0) || 1)) *
                      100
                    ).toFixed(1)}
                    %
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeReportTab === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-230px)] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
                <tr className="text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-20">No</th>
                  <th className="py-2.5 px-3 sticky left-10 bg-slate-100 z-20 min-w-[150px]">Kategori Tagihan</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Total Tagihan</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Diterima</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Sisa Tagihan</th>
                  <th className="py-2.5 px-3 text-center min-w-[90px]">Persentase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {categoryData.map((c, idx) => (
                  <tr key={c.categoryName} className="hover:bg-slate-50/60 group">
                    <td className="py-2 px-3 text-center text-slate-400 font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">{idx + 1}</td>
                    <td className="py-2 px-3 font-bold text-slate-800 sticky left-10 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap">{c.categoryName}</td>
                    <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">
                      Rp{c.totalBills.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      Rp{c.totalReceived.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-rose-600 whitespace-nowrap">
                      Rp{c.remaining.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span className="font-bold text-slate-700">{c.percentage.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300">
                <tr className="font-black text-slate-900 text-xs">
                  <td className="py-2.5 px-3 text-center sticky left-0 bg-slate-100 z-20" colSpan={2}>
                    TOTAL SELURUH KATEGORI
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    Rp{categoryData.reduce((s, c) => s + c.totalBills, 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-800 whitespace-nowrap">
                    Rp{categoryData.reduce((s, c) => s + c.totalReceived, 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-700 whitespace-nowrap">
                    Rp{categoryData.reduce((s, c) => s + c.remaining, 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeReportTab === 'units' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-230px)] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
                <tr className="text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-20">No</th>
                  <th className="py-2.5 px-3 sticky left-10 bg-slate-100 z-20 min-w-[120px]">Jenjang Unit</th>
                  <th className="py-2.5 px-3 text-center min-w-[100px]">Jumlah Siswa</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Total Tagihan</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Total Pemasukan</th>
                  <th className="py-2.5 px-3 text-right min-w-[110px]">Total Tunggakan</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {unitData.map((u, idx) => (
                <tr key={u.unit} className="hover:bg-slate-50/60 group">
                  <td className="py-2 px-3 text-center text-slate-400 font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">{idx + 1}</td>
                  <td className="py-2 px-3 font-bold text-slate-800 sticky left-10 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap">{u.unit}</td>
                  <td className="py-2 px-3 text-center font-bold text-slate-700 whitespace-nowrap">{u.studentCount} siswa</td>
                  <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">
                    Rp{u.totalBills.toLocaleString('id-ID')}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                    Rp{u.totalReceived.toLocaleString('id-ID')}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-rose-600 whitespace-nowrap">
                    Rp{u.totalArrears.toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
