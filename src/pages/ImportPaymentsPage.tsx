import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  ArrowRight,
  Database,
  Calendar,
  Layers,
  Check,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentService } from '../services/studentService';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { paymentService } from '../services/paymentService';
import { Student, Bill } from '../types/database';
import * as XLSX from 'xlsx';

interface MatchedPaymentItem {
  studentName: string;
  studentId?: string;
  matched: boolean;
  itemType: 'SPP' | 'Non-SPP';
  categoryOrMonth: string;
  paymentDate: string;
  amount: number;
}

export function parseCurrencyNumber(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  let s = String(val).trim().replace(/Rp/gi, '').replace(/\s+/g, '');
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/\./g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  }
  s = s.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? fallback : parsed;
}

export function parseDateToYMD(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number' && val > 10000) {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const monthsMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
    jun: '06', jul: '07', agu: '08', aug: '08', sep: '09', okt: '10', oct: '10',
    nov: '11', des: '12', dec: '12'
  };
  const parts = s.split(/[-/.\s]+/);
  if (parts.length === 3) {
    let [p1, p2, p3] = parts;
    let year = p3.length === 4 ? p3 : (p1.length === 4 ? p1 : '2026');
    let month = '01';
    let day = '01';
    if (p3.length === 4) {
      day = p1.padStart(2, '0');
      const mStr = p2.toLowerCase().substring(0, 3);
      month = monthsMap[mStr] || p2.padStart(2, '0');
    } else {
      day = p3.padStart(2, '0');
      const mStr = p2.toLowerCase().substring(0, 3);
      month = monthsMap[mStr] || p2.padStart(2, '0');
    }
    return `${year}-${month}-${day}`;
  }
  return s;
}

export function matchSppMonth(text: string): string | null {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const m of SPP_MONTHS) {
    if (lower.includes(m.toLowerCase())) return m;
  }
  return null;
}

export const ImportPaymentsPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, triggerRefresh } = useApp();

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(null);
  const [previewItems, setPreviewItems] = useState<MatchedPaymentItem[]>([]);
  const [importSummary, setImportSummary] = useState<{
    totalMatched: number;
    totalUnmatched: number;
    totalAmount: number;
    sppCount: number;
    nonSppCount: number;
  } | null>(null);

  const normalizeName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/['’`.]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);
    setImportSummary(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      
      // Load current students and existing bills from Supabase
      const [students, bills] = await Promise.all([
        studentService.getAllWithEnrollment({
          academicYearId: selectedAcademicYearId || undefined,
        }),
        selectedAcademicYearId ? billingService.getBillsForAcademicYear(selectedAcademicYearId) : Promise.resolve([])
      ]);

      // Index bills by studentId and month/category for fast lookup
      const sppBillMap: Record<string, Record<string, Bill>> = {};
      bills.forEach((b) => {
        if (b.category?.name?.toLowerCase().includes('spp') && b.billing_period) {
          if (!sppBillMap[b.student_id]) sppBillMap[b.student_id] = {};
          sppBillMap[b.student_id][b.billing_period.toLowerCase()] = b;
        }
      });

      const getSppNominalForStudent = (student: Student | undefined, month: string): number => {
        if (!student) return 1335000;
        const b = sppBillMap[student.id]?.[month.toLowerCase()];
        if (b && b.amount !== undefined && b.amount !== null) {
          return Number(b.amount);
        }
        return 1335000;
      };

      // Check if file has 'PEMBAYARAN' sheet (standard Excel template)
      const bayarSheet = workbook.Sheets['PEMBAYARAN'] || workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(bayarSheet, { header: 1, defval: null });

      if (rows.length < 2) {
        throw new Error('File Excel tidak memiliki baris data');
      }

      const header = (rows[0] || []).map((h: any) => String(h || '').trim());
      const headerUpper = header.map((h: string) => h.toUpperCase());

      const nameColIdx = headerUpper.findIndex((h: string) => h.includes('NAMA'));
      if (nameColIdx === -1) {
        throw new Error("Kolom 'NAMA' atau 'NAMA SISWA' tidak ditemukan pada baris pertama file Excel.");
      }

      const matchedList: MatchedPaymentItem[] = [];

      // Check if format is matrix format (sheet PEMBAYARAN with Juli..Juni columns)
      const monthIndices: { month: string; idx: number }[] = [];
      SPP_MONTHS.forEach((m) => {
        const mIdx = headerUpper.findIndex((h: string) => h === m.toUpperCase());
        if (mIdx !== -1) monthIndices.push({ month: m, idx: mIdx });
      });

      const nonSppCatCols = ['PERLENGKAPAN', 'PERALATAN', 'KEGIATAN', 'PEMBANGUNAN', 'UJIAN', 'LAINNYA', 'BUKU PAKET'];
      const catIndices: { name: string; idx: number }[] = [];
      nonSppCatCols.forEach((cat) => {
        const cIdx = headerUpper.findIndex((h: string) => h.includes(cat));
        if (cIdx !== -1) catIndices.push({ name: cat === 'LAINNYA' ? 'Lainnya' : (cat.charAt(0) + cat.slice(1).toLowerCase()), idx: cIdx });
      });

      if (monthIndices.length > 0 || catIndices.length > 0) {
        // MATRIX FORMAT
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const rawName = row[nameColIdx];
          if (!rawName) continue;
          const nameStr = String(rawName).trim();
          const cleanName = normalizeName(nameStr);

          // Match student
          const matchedStudent = students.find(
            (s) => normalizeName(s.full_name) === cleanName
          );

          // 1. Process SPP months
          for (const mItem of monthIndices) {
            const cellVal = row[mItem.idx];
            if (cellVal && cellVal !== 'Belum Dibayar' && cellVal !== 'Akan Berlangsung') {
              let dateStr = parseDateToYMD(cellVal);
              let isPaid = false;

              if (cellVal instanceof Date || typeof cellVal === 'number' || (typeof cellVal === 'string' && cellVal.length > 3)) {
                isPaid = true;
              }

              if (isPaid) {
                // Khusus SPP: otomatis mengikuti tagihan siswa yang ada di database
                const autoSppNominal = getSppNominalForStudent(matchedStudent, mItem.month);

                matchedList.push({
                  studentName: nameStr,
                  studentId: matchedStudent?.id,
                  matched: Boolean(matchedStudent),
                  itemType: 'SPP',
                  categoryOrMonth: mItem.month,
                  paymentDate: dateStr,
                  amount: autoSppNominal,
                });
              }
            }
          }

          // 2. Process Non-SPP categories
          for (const cItem of catIndices) {
            const cellVal = parseCurrencyNumber(row[cItem.idx], 0);
            if (cellVal > 0) {
              matchedList.push({
                studentName: nameStr,
                studentId: matchedStudent?.id,
                matched: Boolean(matchedStudent),
                itemType: 'Non-SPP',
                categoryOrMonth: cItem.name,
                paymentDate: new Date().toISOString().split('T')[0],
                amount: cellVal,
              });
            }
          }
        }
      } else {
        // LIST FORMAT (Rows of: Nama, Tagihan/Bulan/Rincian, Tanggal, Nominal)
        const dateIdx = headerUpper.findIndex((h: string) => h.includes('TANGGAL') || h.includes('DATE'));
        const tagihanIdx = headerUpper.findIndex((h: string) => 
          h.includes('TAGIHAN') || h.includes('BULAN') || h.includes('ITEM') || h.includes('RINCIAN') || h.includes('KETERANGAN')
        );
        // Nominal must be distinct from date, name, and tagihan columns
        const nominalIdx = headerUpper.findIndex((h: string, idx: number) => 
          idx !== dateIdx && 
          idx !== nameColIdx && 
          idx !== tagihanIdx && 
          (h === 'NOMINAL' || h === 'NOMINAL DIBAYAR' || h === 'NOMINAL BAYAR' || h.includes('NOMINAL') || h.includes('JUMLAH') || h.includes('TOTAL') || (h.includes('BAYAR') && !h.includes('TANGGAL')))
        );

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const rawName = row[nameColIdx];
          if (!rawName) continue;
          const nameStr = String(rawName).trim();
          const cleanName = normalizeName(nameStr);
          const matchedStudent = students.find(
            (s) => normalizeName(s.full_name) === cleanName
          );

          const tagihanStr = tagihanIdx !== -1 ? String(row[tagihanIdx] || 'SPP').trim() : 'SPP';
          const detectedSppMonth = matchSppMonth(tagihanStr);
          const isSpp = detectedSppMonth !== null;

          let finalAmount = 0;
          let categoryOrMonth = '';

          if (isSpp) {
            // KHUSUS SPP: Tidak perlu memasukkan nominal dari Excel, otomatis mengikuti tagihan yang sudah ada di database
            categoryOrMonth = detectedSppMonth;
            finalAmount = getSppNominalForStudent(matchedStudent, detectedSppMonth);
          } else {
            // KHUSUS PEMBAYARAN LAINNYA: Nominal diambil dari file Excel
            categoryOrMonth = tagihanStr || 'Lainnya';
            finalAmount = nominalIdx !== -1 ? parseCurrencyNumber(row[nominalIdx], 0) : 0;
          }

          let dateStr = dateIdx !== -1 ? parseDateToYMD(row[dateIdx]) : new Date().toISOString().split('T')[0];

          matchedList.push({
            studentName: nameStr,
            studentId: matchedStudent?.id,
            matched: Boolean(matchedStudent),
            itemType: isSpp ? 'SPP' : 'Non-SPP',
            categoryOrMonth: categoryOrMonth,
            paymentDate: dateStr,
            amount: finalAmount,
          });
        }
      }

      setPreviewItems(matchedList);

      const matchedCount = matchedList.filter((m) => m.matched).length;
      const unmatchedCount = matchedList.filter((m) => !m.matched).length;
      const sumAmount = matchedList.reduce((sum, m) => sum + (isNaN(m.amount) ? 0 : m.amount), 0);
      const sppCount = matchedList.filter((m) => m.itemType === 'SPP').length;
      const nonSppCount = matchedList.filter((m) => m.itemType === 'Non-SPP').length;

      setImportSummary({
        totalMatched: matchedCount,
        totalUnmatched: unmatchedCount,
        totalAmount: sumAmount,
        sppCount,
        nonSppCount,
      });

      showToast(`Berhasil membaca ${matchedList.length} transaksi (${sppCount} SPP otomatis, ${nonSppCount} lainnya)`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memproses file: ' + err.message, 'error');
      setPreviewItems([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyToRecap = async () => {
    if (previewItems.length === 0 || !selectedAcademicYearId) {
      showToast('Tidak ada data yang dapat diimpor', 'error');
      return;
    }

    const validItems = previewItems.filter((item) => item.matched && item.studentId);
    if (validItems.length === 0) {
      showToast('Tidak ada siswa yang cocok untuk disimpan', 'error');
      return;
    }

    setIsApplying(true);
    setApplyProgress({ current: 0, total: validItems.length });

    try {
      const itemsToApply = validItems.map((item) => ({
        studentId: item.studentId!,
        itemType: item.itemType,
        categoryOrMonth: item.categoryOrMonth,
        paymentDate: item.paymentDate,
        amount: item.amount,
        paymentMethod: 'Tunai',
      }));

      const result = await paymentService.batchApplyPayments(
        selectedAcademicYearId,
        itemsToApply,
        (current, total) => {
          setApplyProgress({ current, total });
        }
      );

      showToast(`Sukses menerapkan ${result.successCount} transaksi pembayaran ke database online!`, 'success');
      triggerRefresh();
      setPreviewItems([]);
      setFile(null);
      setImportSummary(null);
    } catch (err: any) {
      console.error('Error applying payments:', err);
      showToast('Terjadi kesalahan saat menerapkan pembayaran: ' + err.message, 'error');
    } finally {
      setIsApplying(false);
      setApplyProgress(null);
    }
  };

  const downloadSampleTemplate = () => {
    const sampleRows = [
      { 'Nama Siswa': 'Aditya Ramadhan', 'Bulan / Tagihan': 'SPP September', 'Tanggal Bayar': '2026-09-10', 'Nominal': '' },
      { 'Nama Siswa': 'Aditya Ramadhan', 'Bulan / Tagihan': 'SPP Oktober', 'Tanggal Bayar': '2026-10-08', 'Nominal': '' },
      { 'Nama Siswa': 'Umar Faqih Al Ghozy', 'Bulan / Tagihan': 'SPP Oktober', 'Tanggal Bayar': '2026-10-15', 'Nominal': '' },
      { 'Nama Siswa': 'Ahmad Omar Rafly Lubis', 'Bulan / Tagihan': 'Buku Paket', 'Tanggal Bayar': '2026-10-15', 'Nominal': 450000 },
      { 'Nama Siswa': 'Ahmad Omar Rafly Lubis', 'Bulan / Tagihan': 'Kegiatan', 'Tanggal Bayar': '2026-10-15', 'Nominal': 300000 },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Pembayaran');
    XLSX.writeFile(wb, 'Format_Import_Pembayaran.xlsx');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
            Layanan Import Transaksi Otomatis
          </span>
          <h3 className="text-xl font-black text-slate-800 mt-1">
            Import Pembayaran Siswa Dari Excel
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah file Excel berisi nama siswa, tanggal bayar, bulan SPP, atau biaya buku/lainnya. Sistem akan langsung memperbarui database dan tabel Rekap Pembayaran secara otomatis.
          </p>
        </div>

        <button
          onClick={downloadSampleTemplate}
          className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
        >
          <Download className="w-4 h-4 text-emerald-700" />
          <span>Unduh Contoh Format Excel</span>
        </button>
      </div>

      {/* Information Banner on Rules */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900 shadow-xs">
        <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 font-bold">
          <Info className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <p className="font-bold text-amber-950 text-sm">Petunjuk Pengisian File Import Pembayaran:</p>
          <ul className="list-disc list-inside space-y-1 text-amber-900 text-xs">
            <li>
              <strong>Khusus Pembayaran SPP:</strong> Tidak perlu memasukkan nominal di Excel (boleh dikosongkan). Sistem otomatis mendeteksi dan menggunakan nominal tagihan siswa yang tersimpan di database.
            </li>
            <li>
              <strong>Pembayaran Lainnya (Non-SPP):</strong> Wajib menyertakan nominal pembayaran pada kolom Nominal (contoh: Buku Paket Rp450.000, Kegiatan Rp300.000, Peralatan, dll).
            </li>
            <li>
              <strong>Format Tanggal:</strong> Mendukung berbagai format tanggal (contoh: <code>2026-10-15</code>, <code>15-Oct-2026</code>, atau <code>15/10/2026</code>).
            </li>
          </ul>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="border-2 border-dashed border-emerald-300 rounded-2xl p-8 text-center hover:border-emerald-600 transition bg-emerald-50/20">
          <input
            type="file"
            id="paymentExcelUpload"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            disabled={isApplying || isProcessing}
            className="hidden"
          />
          <label
            htmlFor="paymentExcelUpload"
            className={`flex flex-col items-center justify-center gap-2 ${isApplying || isProcessing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-bold text-sm text-slate-800 mt-2">
              {file ? file.name : 'Pilih atau Drag File Excel Pembayaran di Sini'}
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              Bisa berupa file matriks acuan <code>Administrasi_SMP_SMA_2026-2027.xlsx</code> (sheet PEMBAYARAN) atau file Excel daftar transaksi baru.
            </p>
          </label>
        </div>

        {isProcessing && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
            <span>Mencocokkan nama siswa dengan tagihan database online dan mengurai tanggal transaksi...</span>
          </div>
        )}

        {isApplying && applyProgress && (
          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
                Menerapkan pembayaran ke database online Supabase...
              </span>
              <span>
                {applyProgress.current} / {applyProgress.total} ({Math.round((applyProgress.current / applyProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Summary Card */}
        {importSummary && !isApplying && (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-slate-500">Siswa Cocok</p>
                <p className="font-black text-emerald-800 text-base">{importSummary.totalMatched}</p>
              </div>
              <div>
                <p className="text-slate-500">Tidak Dikenal</p>
                <p className="font-black text-rose-600 text-base">{importSummary.totalUnmatched}</p>
              </div>
              <div>
                <p className="text-slate-500">Transaksi SPP (Otomatis)</p>
                <p className="font-black text-emerald-700 text-base">{importSummary.sppCount}</p>
              </div>
              <div>
                <p className="text-slate-500">Total Nilai Transaksi</p>
                <p className="font-black text-slate-800 text-base">
                  Rp{Number(importSummary.totalAmount || 0).toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <button
              onClick={handleApplyToRecap}
              disabled={isApplying || importSummary.totalMatched === 0}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition"
            >
              <CheckCircle2 className="w-4 h-4 text-gold-400" />
              <span>Terapkan Pembayaran ke Rekap</span>
            </button>
          </div>
        )}

        {/* Preview Table */}
        {previewItems.length > 0 && !isApplying && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Preview Baris Pembayaran ({previewItems.length} Transaksi)
              </h4>
              <span className="text-[11px] text-emerald-700 font-semibold">
                ✓ Siap diproses ke Rekap & Dashboard
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3">Nama Siswa di Excel</th>
                    <th className="py-2.5 px-3 text-center">Status Pencocokan</th>
                    <th className="py-2.5 px-3">Item / Bulan</th>
                    <th className="py-2.5 px-3 text-center">Tanggal Bayar</th>
                    <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {previewItems.slice(0, 100).map((item, idx) => (
                    <tr key={idx} className={item.matched ? 'hover:bg-slate-50/60' : 'bg-rose-50/30'}>
                      <td className="py-2 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{item.studentName}</td>
                      <td className="py-2 px-3 text-center">
                        {item.matched ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            ✓ Cocok
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                            Nama Tidak Ditemukan
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-700">
                        {item.categoryOrMonth}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                        {item.paymentDate}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-slate-800">
                            Rp{Number(item.amount || 0).toLocaleString('id-ID')}
                          </span>
                          {item.itemType === 'SPP' ? (
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded mt-0.5">
                              ✓ Sesuai Tagihan Siswa
                            </span>
                          ) : item.amount > 0 ? (
                            <span className="text-[9px] font-bold text-blue-800 bg-blue-100/80 px-1.5 py-0.2 rounded mt-0.5">
                              Dari Kolom Excel
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-rose-700 bg-rose-100/80 px-1.5 py-0.2 rounded mt-0.5">
                              ⚠️ Nominal Kosong
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewItems.length > 100 && (
              <p className="text-[11px] text-slate-400 text-center">
                Menampilkan 100 dari {previewItems.length} transaksi pada preview.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
