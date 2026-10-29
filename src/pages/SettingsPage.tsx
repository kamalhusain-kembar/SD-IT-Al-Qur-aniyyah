import React, { useState, useEffect } from 'react';
import {
  Settings,
  FileSpreadsheet,
  Upload,
  Download,
  Info,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Database,
  Layers,
  Copy,
  ExternalLink,
  Plus,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { excelService, ImportPreviewItem, ImportResult } from '../services/excelService';
import { billingService } from '../services/billingService';
import { BillingCategory } from '../types/database';
import * as XLSX from 'xlsx';

export const SettingsPage: React.FC = () => {
  const {
    academicYears,
    selectedAcademicYearId,
    selectedAcademicYear,
    setSelectedAcademicYearId,
    showToast,
    refreshKey,
    triggerRefresh
  } = useApp();

  const [activeTab, setActiveTab] = useState<'import' | 'categories' | 'database'>('import');

  // Excel Import States
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewItems, setPreviewItems] = useState<ImportPreviewItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(true);

  // Billing Categories States
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'one_time' | 'monthly'>('one_time');

  useEffect(() => {
    billingService.getCategories().then(setCategories).catch(console.error);
  }, [refreshKey]);

  // Prevent accidental refresh or tab close while import is running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isImporting) {
        e.preventDefault();
        e.returnValue = 'Proses import data sedang berlangsung. Jika Anda memuat ulang atau menutup halaman ini, proses akan terhenti. Yakin ingin keluar?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isImporting]);

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setIsParsing(true);
    setImportResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const parsed = excelService.parseAcuanWorkbook(workbook);
      setPreviewItems(parsed);
      showToast(`Berhasil membaca file: ${parsed.length} siswa ditemukan`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memproses file Excel: ' + err.message, 'error');
      setPreviewItems([]);
    } finally {
      setIsParsing(false);
    }
  };

  // Execute import
  const handleStartImport = async () => {
    if (previewItems.length === 0) {
      showToast('Pilih file Excel acuan terlebih dahulu', 'error');
      return;
    }

    let targetYearId = selectedAcademicYearId || selectedAcademicYear?.id || (academicYears.length > 0 ? academicYears[0].id : '');
    if (!targetYearId) {
      try {
        const { data: yList } = await supabase.from('academic_years').select('id').limit(1);
        if (yList && yList.length > 0) {
          targetYearId = yList[0].id;
          setSelectedAcademicYearId(targetYearId);
        }
      } catch (e) {
        console.warn(e);
      }
    }

    if (!targetYearId) {
      targetYearId = '9a798c1f-7deb-4b6d-b94e-56a83a9fe6f7';
      setSelectedAcademicYearId(targetYearId);
    }

    setIsImporting(true);
    setImportProgress({ processed: 0, total: previewItems.length });

    try {
      const res = await excelService.executeImport(
        previewItems,
        targetYearId,
        (processed, total) => {
          setImportProgress({ processed, total });
        }
      );

      setImportResult(res);
      showToast(
        `Import selesai! ${res.studentsCreated} siswa, ${res.billsCreated} tagihan, ${res.paymentsCreated} pembayaran berhasil disimpan.`,
        'success'
      );
      triggerRefresh();
    } catch (err: any) {
      showToast('Import gagal: ' + err.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      await billingService.addCategory(newCatName.trim(), newCatType, categories.length + 1);
      showToast(`Kategori "${newCatName}" berhasil ditambahkan`, 'success');
      setNewCatName('');
      billingService.getCategories().then(setCategories);
    } catch (err: any) {
      showToast('Gagal menambah kategori: ' + err.message, 'error');
    }
  };

  const copyMigrationSQL = () => {
    const sql = `-- Salin file di: supabase/migrations/20261016_initial_schema.sql`;
    navigator.clipboard.writeText(sql);
    showToast('Lokasi file SQL berhasil disalin', 'info');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Pengaturan & Import Excel</h3>
          <p className="text-xs text-slate-500">
            Import data dari file Excel acuan, kelola kategori tagihan, dan konfigurasi database Supabase
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('import')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
            activeTab === 'import'
              ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          <span>Import Excel Acuan (Administrasi SMP/SMA)</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4 text-emerald-700" />
          <span>Kategori Tagihan</span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
            activeTab === 'database'
              ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-700" />
          <span>Koneksi Supabase & SQL Schema</span>
        </button>
      </div>

      {/* TAB 1: IMPORT EXCEL */}
      {activeTab === 'import' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-slate-100">
              <div>
                <h4 className="font-bold text-base text-slate-800">
                  Import File Excel Acuan Administrasi
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Import database siswa, tagihan, dan pembayaran sekaligus dari file Excel.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => excelService.downloadTemplateAcuanExcel()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                >
                  <Download className="w-4 h-4 text-gold-300" />
                  <span>Unduh Format Template Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowFormatGuide(!showFormatGuide)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition"
                >
                  <Info className="w-4 h-4 text-emerald-700" />
                  <span>{showFormatGuide ? 'Tutup Panduan' : 'Lihat Format'}</span>
                </button>
              </div>
            </div>

            {/* Target Academic Year indicator */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-700">
                Data akan dihubungkan ke Tahun Ajaran:{' '}
                <strong className="text-emerald-950 font-bold">{selectedAcademicYear?.name || '2026/2027'}</strong>
              </span>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                T.A. Aktif
              </span>
            </div>

            {/* FORMAT GUIDE BOX */}
            {showFormatGuide && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-800" />
                    <span className="font-bold text-slate-800">Ketentuan Format File Excel (.xlsx)</span>
                  </div>
                  <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded">
                    Wajib Memiliki 2 Sheet
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  {/* Sheet 1 TAGIHAN */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <strong className="text-emerald-900 font-black">1. Sheet "TAGIHAN"</strong>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">Master Siswa & Tarif</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Menyimpan data identitas siswa dan besaran tagihan per siswa.
                    </p>
                    <div className="bg-slate-50 p-2 rounded-lg font-mono text-[10px] text-slate-700 border border-slate-100 space-y-0.5">
                      <p className="font-bold text-emerald-800">Nama-nama Kolom Header:</p>
                      <p className="break-all">NO, NAMA, JK, STATUS, NO TELPON, NO REKENING (NIS), JENJANG, KELAS, SPP, PERLENGKAPAN, PERALATAN, KEGIATAN, PEMBANGUNAN, UJIAN, LAINNYA</p>
                    </div>
                    <ul className="list-disc list-inside text-slate-500 space-y-0.5 text-[10px]">
                      <li><strong>JK:</strong> L (Laki-laki) atau P (Perempuan)</li>
                      <li><strong>STATUS:</strong> Mampu, Yatim, Dhuafa, Beasiswa, Rekomendasi</li>
                      <li><strong>JENJANG:</strong> TK IT, SD IT, SMP IT, atau SMA IT</li>
                    </ul>
                  </div>

                  {/* Sheet 2 PEMBAYARAN */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <strong className="text-emerald-900 font-black">2. Sheet "PEMBAYARAN"</strong>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">Riwayat Pembayaran</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Menyimpan riwayat tanggal pembayaran SPP bulanan & nominal non-SPP.
                    </p>
                    <div className="bg-slate-50 p-2 rounded-lg font-mono text-[10px] text-slate-700 border border-slate-100 space-y-0.5">
                      <p className="font-bold text-emerald-800">Nama-nama Kolom Header:</p>
                      <p className="break-all">NO, NAMA, JK, STATUS, NO REKENING, JENJANG, KELAS, SPP, <strong>Juli, Agustus, September, ..., Juni</strong>, PERLENGKAPAN, PERALATAN, KEGIATAN, PEMBANGUNAN, UJIAN, LAINNYA, NO. TELPON</p>
                    </div>
                    <ul className="list-disc list-inside text-slate-500 space-y-0.5 text-[10px]">
                      <li><strong>Kolom Bulan:</strong> Isi <strong>tanggal bayar</strong> (contoh: <code>28/08/2026</code>) atau <code>Free</code> jika gratis. Kosongkan jika belum bayar.</li>
                      <li><strong>Non-SPP:</strong> Isi <strong>angka nominal</strong> yang sudah dibayar (contoh: <code>500000</code>).</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200 flex items-start gap-2 text-[11px] text-emerald-950">
                  <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <p>
                    <strong>Tips Cepat:</strong> File Excel acuan yayasan Anda (<code>Administrasi_SMP_SMA_2026-2027.xlsx</code>) sudah persis memenuhi struktur ini. Anda bisa langsung mengunggah file tersebut tanpa perlu merubah formatnya!
                  </p>
                </div>
              </div>
            )}

            {/* File Upload Box */}
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-emerald-600 transition bg-slate-50/50">
              <input
                type="file"
                id="excelFileInput"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="excelFileInput"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="font-bold text-sm text-slate-800 mt-2">
                  {importFile ? importFile.name : 'Klik untuk memilih file Excel (atau drag file Administrasi_SMP_SMA_2026-2027.xlsx ke sini)'}
                </p>
                <p className="text-xs text-slate-400">
                  Mendukung file .xlsx (format sheet TAGIHAN & PEMBAYARAN)
                </p>
              </label>
            </div>

            {/* Parsing State */}
            {isParsing && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
                <span>Menganalisis isi sheet TAGIHAN & PEMBAYARAN...</span>
              </div>
            )}

            {/* Preview Section */}
            {previewItems.length > 0 && !isImporting && !importResult && (
              <div className="space-y-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-sm text-slate-800">
                      Preview Data Siap Impor ({previewItems.length} Siswa)
                    </h5>
                    <p className="text-xs text-slate-500">
                      Periksa sampel sebelum disimpan ke database Supabase
                    </p>
                  </div>

                  <button
                    onClick={handleStartImport}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition"
                  >
                    <CheckCircle2 className="w-4 h-4 text-gold-400" />
                    <span>Konfirmasi & Simpan ke Supabase</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">No</th>
                        <th className="py-2.5 px-3">Nama Siswa</th>
                        <th className="py-2.5 px-3">Jenjang & Kelas</th>
                        <th className="py-2.5 px-3">Kategori</th>
                        <th className="py-2.5 px-3 text-right">SPP Bulanan</th>
                        <th className="py-2.5 px-3 text-center">Bulan Lunas</th>
                        <th className="py-2.5 px-3 text-right">Tagihan Non-SPP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewItems.slice(0, 15).map((item) => {
                        const paidMonthsCount = item.sppPayments.filter((p) => p.isPaid).length;
                        return (
                          <tr key={item.name} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 text-center text-slate-400 font-bold">{item.no}</td>
                            <td className="py-2 px-3 font-bold text-slate-800">{item.name}</td>
                            <td className="py-2 px-3 text-slate-600 font-medium">{item.unit} · {item.grade}</td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100">
                                {item.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-slate-800">
                              Rp{item.sppNominal.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                {paidMonthsCount} / 12 Bulan
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600">
                              {item.otherBills.length} item
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {previewItems.length > 15 && (
                  <p className="text-[11px] text-slate-400 text-center">
                    Menampilkan 15 dari {previewItems.length} siswa pada preview.
                  </p>
                )}
              </div>
            )}

            {/* Importing Progress Bar */}
            {isImporting && (
              <div className="p-6 bg-amber-50/70 rounded-2xl border border-amber-300 space-y-3 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin" />
                    <span>Sedang Menyimpan ke Supabase...</span>
                  </span>
                  <span className="text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full font-mono">
                    {importProgress.processed} / {importProgress.total} Siswa ({Math.round((importProgress.processed / (importProgress.total || 1)) * 100)}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${(importProgress.processed / (importProgress.total || 1)) * 100}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-amber-800 font-semibold bg-amber-100/60 p-2.5 rounded-xl border border-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
                  <span>
                    <strong>PENTING:</strong> Mohon jangan menutup tab atau me-refresh (F5) halaman browser ini hingga proses mencapai 100%.
                  </span>
                </div>
              </div>
            )}

            {/* Import Result Summary */}
            {importResult && (
              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-3">
                <h5 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Import Data Selesai & Berhasil Disimpan!</span>
                </h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <p className="text-slate-400">Total Diproses</p>
                    <p className="font-black text-base text-slate-800 mt-0.5">{importResult.totalProcessed}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <p className="text-slate-400">Siswa Baru</p>
                    <p className="font-black text-base text-emerald-700 mt-0.5">{importResult.studentsCreated}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <p className="text-slate-400">Tagihan Dibuat</p>
                    <p className="font-black text-base text-blue-700 mt-0.5">{importResult.billsCreated}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <p className="text-slate-400">Transaksi Pembayaran</p>
                    <p className="font-black text-base text-purple-700 mt-0.5">{importResult.paymentsCreated}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: KATEGORI TAGIHAN */}
      {activeTab === 'categories' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h4 className="font-bold text-base text-slate-800">Kategori Tagihan Keuangan</h4>
              <p className="text-xs text-slate-500">
                Kelola kategori pembiayaan santri (SPP, Perlengkapan, Peralatan, dsb).
              </p>
            </div>

            {/* Add Category Form */}
            <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                required
                placeholder="Nama Kategori (contoh: Buku Paket, Wisuda)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as any)}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white"
              >
                <option value="one_time">Tagihan Satu Kali / Kegiatan</option>
                <option value="monthly">Tagihan Bulanan (seperti SPP)</option>
              </select>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                Tambah Kategori
              </button>
            </form>

            {/* Categories List */}
            <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-12 text-center">No</th>
                    <th className="py-2.5 px-4">Nama Kategori</th>
                    <th className="py-2.5 px-4">Tipe Pembiayaan</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{c.name}</td>
                      <td className="py-3 px-4 font-medium text-slate-600">
                        {c.category_type === 'monthly' ? 'Bulanan (12 Periode)' : 'Satu Kali / Kegiatan'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Aktif
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUPABASE DATABASE & SCHEMA */}
      {activeTab === 'database' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold text-base text-slate-800">
                  Status Database Supabase PostgreSQL
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Seluruh data siswa, tagihan, dan pembayaran tersimpan di cloud database Supabase dengan RLS dan enkripsi.
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  isSupabaseConfigured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-amber-50 text-amber-700 border-amber-300'
                }`}
              >
                {isSupabaseConfigured ? '✓ Supabase Terhubung' : 'Belum Dikonfigurasi'}
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <p className="font-bold text-slate-800">Langkah Konfigurasi Supabase:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600 font-medium">
                <li>Buka project di <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-700 font-bold underline">supabase.com</a>.</li>
                <li>Buka menu <strong>SQL Editor</strong> di dashboard Supabase.</li>
                <li>Jalankan query migrasi lengkap yang telah disiapkan di: <code className="bg-white px-2 py-0.5 rounded border border-slate-200 text-emerald-800 font-mono">supabase/migrations/20261016_initial_schema.sql</code>.</li>
                <li>Buka menu <strong>Project Settings &gt; API</strong>, salin URL dan anon public key.</li>
                <li>Masukkan ke file <code className="bg-white px-2 py-0.5 rounded border border-slate-200 text-emerald-800 font-mono">.env</code> pada aplikasi ini:
                  <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 rounded-lg font-mono text-[11px] overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...`}
                  </pre>
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={copyMigrationSQL}
                className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Salin Path Migrasi SQL</span>
              </button>

              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 underline"
              >
                <span>Buka Supabase Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
