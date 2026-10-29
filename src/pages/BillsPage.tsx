import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Plus,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  X,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Sliders,
  UserX,
  UserMinus,
  CheckCircle2,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { studentService } from '../services/studentService';
import { Bill, BillingCategory, Student, BillStatus } from '../types/database';

export const BillsPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey } = useApp();

  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Modal Add Bill
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [billType, setBillType] = useState<'single' | 'monthly_spp'>('single');
  const [formData, setFormData] = useState({
    student_id: '',
    category_id: '',
    billing_period: '',
    amount: '',
    due_date: '',
    description: '',
  });

  // Modal Edit Single Bill
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editFormData, setEditFormData] = useState({
    amount: '',
    billing_period: '',
    due_date: '',
    status: 'Belum Dibayar' as BillStatus,
    description: '',
  });

  // Modal Revisi Massal Tarif / Santri Berhenti
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionTab, setRevisionTab] = useState<'revise_spp' | 'dropout'>('revise_spp');
  
  // State Revisi SPP
  const [revStudentId, setRevStudentId] = useState('');
  const [revAmount, setRevAmount] = useState('');
  const [revFromMonth, setRevFromMonth] = useState('November');

  // State Santri Berhenti
  const [dropoutStudentId, setDropoutStudentId] = useState('');
  const [dropoutMonth, setDropoutMonth] = useState('November');
  const [dropoutAction, setDropoutAction] = useState<'bebas' | 'delete'>('bebas');
  const [dropoutStatus, setDropoutStatus] = useState<'nonaktif' | 'pindah'>('nonaktif');

  const loadData = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);
    try {
      const [bData, cData, sData] = await Promise.all([
        billingService.getBillsForAcademicYear(selectedAcademicYearId),
        billingService.getCategories(),
        studentService.getAllWithEnrollment({ academicYearId: selectedAcademicYearId })
      ]);
      setBills(bData);
      setCategories(cData);
      setStudents(sData);
      if (cData.length > 0 && !formData.category_id) {
        setFormData((prev) => ({ ...prev, category_id: cData[0].id }));
      }
    } catch (err: any) {
      console.error('Error loading bills:', err);
      showToast('Gagal memuat tagihan: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedAcademicYearId, refreshKey]);

  const handleOpenAdd = () => {
    setFormData({
      student_id: students.length > 0 ? students[0].id : '',
      category_id: categories.length > 0 ? categories[0].id : '',
      billing_period: '',
      amount: '',
      due_date: '',
      description: '',
    });
    setIsModalOpen(true);
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.student_id || !selectedAcademicYearId) {
      showToast('Pilih siswa terlebih dahulu', 'error');
      return;
    }

    try {
      if (billType === 'monthly_spp') {
        const sppCat = categories.find((c) => c.name.toLowerCase().includes('spp')) || categories[0];
        await billingService.generateMonthlySPPForStudent(
          formData.student_id,
          selectedAcademicYearId,
          sppCat.id,
          Number(formData.amount || 0)
        );
        showToast('Tagihan 12 bulan SPP berhasil dibuat', 'success');
      } else {
        await billingService.createBill({
          student_id: formData.student_id,
          academic_year_id: selectedAcademicYearId,
          category_id: formData.category_id,
          billing_period: formData.billing_period.trim() || null,
          amount: Number(formData.amount || 0),
          due_date: formData.due_date || null,
          status: 'Belum Dibayar',
          description: formData.description.trim() || null,
        });
        showToast('Tagihan berhasil ditambahkan', 'success');
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast('Gagal membuat tagihan: ' + err.message, 'error');
    }
  };

  const handleOpenEditBill = (bill: Bill) => {
    setEditingBill(bill);
    setEditFormData({
      amount: String(bill.amount || 0),
      billing_period: bill.billing_period || '',
      due_date: bill.due_date ? String(bill.due_date).split('T')[0] : '',
      status: (bill.status as BillStatus) || 'Belum Dibayar',
      description: bill.description || '',
    });
  };

  const handleUpdateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;

    try {
      await billingService.updateBill(editingBill.id, {
        amount: Number(editFormData.amount || 0),
        billing_period: editFormData.billing_period.trim() || null,
        due_date: editFormData.due_date || null,
        status: editFormData.status,
        description: editFormData.description.trim() || null,
      });

      showToast('Tagihan berhasil diperbarui', 'success');
      setEditingBill(null);
      loadData();
    } catch (err: any) {
      showToast('Gagal memperbarui tagihan: ' + err.message, 'error');
    }
  };

  const handleDeleteBill = async (bill: Bill) => {
    const studentName = bill.student?.full_name || 'siswa ini';
    const catName = bill.category?.name || 'Tagihan';
    const period = bill.billing_period ? `(${bill.billing_period})` : '';

    if (!window.confirm(`Yakin ingin menghapus tagihan ${catName} ${period} untuk ${studentName}?`)) {
      return;
    }

    try {
      await billingService.deleteBill(bill.id);
      showToast(`Tagihan ${catName} berhasil dihapus`, 'success');
      loadData();
    } catch (err: any) {
      showToast('Gagal menghapus tagihan: ' + err.message, 'error');
    }
  };

  const handleOpenRevisionModal = () => {
    setRevStudentId(students.length > 0 ? students[0].id : '');
    setRevAmount('');
    setRevFromMonth('November');

    setDropoutStudentId(students.length > 0 ? students[0].id : '');
    setDropoutMonth('November');
    setDropoutAction('bebas');
    setDropoutStatus('nonaktif');

    setIsRevisionModalOpen(true);
  };

  const handleApplyRevisionSPP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revStudentId || !selectedAcademicYearId) {
      showToast('Pilih santri terlebih dahulu', 'error');
      return;
    }

    try {
      const res = await billingService.reviseStudentSPP(
        revStudentId,
        selectedAcademicYearId,
        Number(revAmount || 0),
        revFromMonth
      );

      showToast(`Berhasil merevisi tarif SPP! ${res.updatedCount} tagihan mulai bulan ${revFromMonth} telah diubah.`, 'success');
      setIsRevisionModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast('Gagal merevisi tarif SPP: ' + err.message, 'error');
    }
  };

  const handleApplyDropout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropoutStudentId || !selectedAcademicYearId) {
      showToast('Pilih santri terlebih dahulu', 'error');
      return;
    }

    const std = students.find(s => s.id === dropoutStudentId);
    const actionText = dropoutAction === 'delete' ? 'menghapus tagihan' : 'membebaskan tagihan (Rp 0)';
    if (!window.confirm(`Yakin ingin memproses santri ${std?.full_name || ''} sebagai ${dropoutStatus}? Tindakan ini akan ${actionText} mulai bulan ${dropoutMonth} ke depan.`)) {
      return;
    }

    try {
      const res = await billingService.handleStudentDropout(
        dropoutStudentId,
        selectedAcademicYearId,
        dropoutMonth,
        dropoutAction,
        dropoutStatus
      );

      showToast(`Santri berhasil diatur menjadi ${dropoutStatus}. Sebanyak ${res.affectedBillsCount} tagihan mendatang berhasil ${dropoutAction === 'delete' ? 'dihapus' : 'dibebaskan'}.`, 'success');
      setIsRevisionModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast('Gagal memproses santri berhenti: ' + err.message, 'error');
    }
  };

  // Filter bills
  const filteredBills = bills.filter((b) => {
    const studentName = b.student?.full_name?.toLowerCase() || '';
    const studentNis = b.student?.nis?.toLowerCase() || '';
    const catName = b.category?.name || '';
    const period = b.billing_period || '';

    const matchesSearch =
      !search ||
      studentName.includes(search.toLowerCase()) ||
      studentNis.includes(search.toLowerCase()) ||
      catName.toLowerCase().includes(search.toLowerCase()) ||
      period.toLowerCase().includes(search.toLowerCase());

    const matchesCat = categoryFilter === 'ALL' || b.category_id === categoryFilter;
    const matchesMonth = monthFilter === 'ALL' || (b.billing_period && b.billing_period.toLowerCase() === monthFilter.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || b.calculated_status === statusFilter;

    return matchesSearch && matchesCat && matchesMonth && matchesStatus;
  });

  const totalPages = Math.ceil(filteredBills.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedBills = filteredBills.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-3">
      {/* Dense Desktop-Style Action & Filter Toolbar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 leading-tight">Daftar Tagihan Siswa</h3>
            <p className="text-[11px] text-slate-500">
              T.A. {selectedAcademicYear?.name || '2026/2027'} · Total {filteredBills.length.toLocaleString('id-ID')} tagihan
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleOpenRevisionModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-700" />
              <span>Revisi Tarif / Santri Berhenti</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-semibold transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Tagihan</span>
            </button>
          </div>
        </div>

        {/* Compact Filter Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari siswa/tagihan..."
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Bulan</option>
              {SPP_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Status</option>
              <option value="Belum Dibayar">Belum Dibayar</option>
              <option value="Akan Berlangsung">Akan Berlangsung</option>
              <option value="Belum Lunas">Belum Lunas</option>
              <option value="Lunas">Lunas</option>
              <option value="Bebas">Bebas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Info Banner: Active Month vs Upcoming Months */}
      <div className="bg-emerald-50/80 border border-emerald-200/70 rounded-xl px-3 py-1.5 flex items-center gap-2 text-[11px] text-emerald-950 shadow-2xs">
        <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        <span>
          Bulan berjalan: <strong className="font-bold text-emerald-900">Oktober</strong>.
          Tagihan SPP bulan mendatang (November-Juni) berstatus <em>Akan Berlangsung</em> (bukan tunggakan).
        </span>
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-230px)] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
              <tr className="text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-20">No</th>
                <th className="py-2.5 px-3 min-w-[150px] sticky left-10 bg-slate-100 z-20">Nama Siswa</th>
                <th className="py-2.5 px-3 min-w-[100px]">Jenis Tagihan</th>
                <th className="py-2.5 px-3 min-w-[80px]">Periode</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Nominal</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Dibayar</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Sisa</th>
                <th className="py-2.5 px-3 text-center min-w-[110px]">Status</th>
                <th className="py-2.5 px-3 text-center w-20">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Memuat tagihan...
                  </td>
                </tr>
              ) : filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Tidak ada tagihan yang ditemukan.
                  </td>
                </tr>
              ) : (
                paginatedBills.map((bill, idx) => (
                  <tr key={bill.id} className="hover:bg-slate-50/60 transition group">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-bold sticky left-0 bg-white group-hover:bg-slate-50/60 z-10">{startIndex + idx + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 sticky left-10 bg-white group-hover:bg-slate-50/60 z-10 whitespace-nowrap">
                      {bill.student?.full_name || 'Siswa'}
                      {bill.student?.nis && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          NIS: {bill.student.nis}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      {bill.category?.name || 'Tagihan'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {bill.billing_period || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                      Rp{Number(bill.amount).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      Rp{Number(bill.total_paid || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {bill.calculated_status === 'Akan Berlangsung' ? (
                        <span className="text-slate-400 font-medium text-[11px]" title="Tagihan belum jatuh tempo (bulan mendatang)">
                          - (Belum Berjalan)
                        </span>
                      ) : Number(bill.remaining_amount || 0) > 0 ? (
                        <span className="font-bold text-rose-600">
                          Rp{Number(bill.remaining_amount).toLocaleString('id-ID')}
                        </span>
                      ) : (
                        <span className="font-semibold text-emerald-600">
                          Rp0
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          bill.calculated_status === 'Lunas' || bill.calculated_status === 'Bebas'
                            ? 'bg-emerald-100 text-emerald-800'
                            : bill.calculated_status === 'Belum Lunas'
                            ? 'bg-amber-100 text-amber-800'
                            : bill.calculated_status === 'Akan Berlangsung'
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {bill.calculated_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditBill(bill)}
                          title="Revisi / Ubah Tagihan"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBill(bill)}
                          title="Hapus Tagihan"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
          <div>
            Menampilkan <strong className="text-slate-800">{filteredBills.length === 0 ? 0 : startIndex + 1}</strong> - <strong className="text-slate-800">{Math.min(startIndex + pageSize, filteredBills.length)}</strong> dari <strong className="text-slate-800">{filteredBills.length.toLocaleString('id-ID')}</strong> tagihan (<strong className="text-emerald-700">{students.length} Siswa</strong>)
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Baris:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1 px-2 border border-slate-200 rounded-lg bg-white text-xs font-semibold focus:outline-none"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold text-slate-800 text-xs">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Add Bill */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h4 className="text-base font-bold text-slate-800">Buat Tagihan Siswa</h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Siswa *</label>
                <select
                  required
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="">-- Pilih Siswa --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.current_enrollment?.unit || 'SD IT'} - {s.current_enrollment?.grade || 'I'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 py-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="billType"
                    checked={billType === 'single'}
                    onChange={() => setBillType('single')}
                    className="text-emerald-700"
                  />
                  <span>Tagihan Satu Kali / Per Kegiatan</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="billType"
                    checked={billType === 'monthly_spp'}
                    onChange={() => setBillType('monthly_spp')}
                    className="text-emerald-700"
                  />
                  <span>Generate SPP 12 Bulan (Juli-Juni)</span>
                </label>
              </div>

              {billType === 'single' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Kategori Tagihan</label>
                      <select
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Periode / Bulan (Opsional)</label>
                      <input
                        type="text"
                        placeholder="Contoh: Agustus, atau kosongkan"
                        value={formData.billing_period}
                        onChange={(e) => setFormData({ ...formData, billing_period: e.target.value })}
                        className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nominal Tagihan (Rp) *</label>
                    <input
                      type="number"
                      required
                      placeholder="Contioh: 2900000"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan</label>
                    <input
                      type="text"
                      placeholder="Contoh: Tagihan Perlengkapan Santri Baru"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tarif SPP Bulanan (Rp) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Contoh: 1335000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Akan membuat otomatis 12 tagihan dari bulan Juli hingga Juni untuk tahun ajaran aktif.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                >
                  Simpan Tagihan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Single Bill */}
      {editingBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  Revisi / Ubah Tagihan
                </h4>
                <p className="text-xs text-slate-500">
                  {editingBill.student?.full_name} · {editingBill.category?.name}
                </p>
              </div>
              <button
                onClick={() => setEditingBill(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBill} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Tagihan (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Periode / Bulan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Agustus"
                    value={editFormData.billing_period}
                    onChange={(e) => setEditFormData({ ...editFormData, billing_period: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Tagihan
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as BillStatus })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Belum Dibayar">Belum Dibayar</option>
                    <option value="Belum Lunas">Belum Lunas</option>
                    <option value="Lunas">Lunas</option>
                    <option value="Bebas">Bebas (Gratis / Tidak Tertagih)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tanggal Jatuh Tempo (Opsional)
                </label>
                <input
                  type="date"
                  value={editFormData.due_date}
                  onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
                  className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan Revisi
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Keringanan / Penyesuaian tengah tahun"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Revisi Massal / Santri Berhenti */}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  Pengaturan Khusus Tagihan
                </h4>
                <p className="text-xs text-slate-500">
                  Penyesuaian tarif SPP dan santri berhenti/pindah di tengah tahun ajaran
                </p>
              </div>
              <button
                onClick={() => setIsRevisionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="flex border-b border-slate-200 mb-4">
              <button
                type="button"
                onClick={() => setRevisionTab('revise_spp')}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition flex items-center justify-center gap-2 ${
                  revisionTab === 'revise_spp'
                    ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Revisi Tarif SPP Santri</span>
              </button>
              <button
                type="button"
                onClick={() => setRevisionTab('dropout')}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition flex items-center justify-center gap-2 ${
                  revisionTab === 'dropout'
                    ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <UserMinus className="w-4 h-4" />
                <span>Santri Berhenti / Pindah</span>
              </button>
            </div>

            {revisionTab === 'revise_spp' ? (
              <form onSubmit={handleApplyRevisionSPP} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Santri *
                  </label>
                  <select
                    required
                    value={revStudentId}
                    onChange={(e) => setRevStudentId(e.target.value)}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="">-- Pilih Santri --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.current_enrollment?.unit || 'SD IT'} - {s.current_enrollment?.grade || '-'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Besaran Tarif SPP Baru (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Contoh: 1100000"
                    value={revAmount}
                    onChange={(e) => setRevAmount(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Berlaku Mulai Bulan *
                  </label>
                  <select
                    value={revFromMonth}
                    onChange={(e) => setRevFromMonth(e.target.value)}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {SPP_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        Bulan {m} ke depan
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Cara Kerja Revisi SPP:
                  </p>
                  <p>
                    Semua tagihan SPP santri ini mulai bulan <strong>{revFromMonth}</strong> s/d Juni yang belum lunas akan otomatis disesuaikan ke nominal baru <strong>Rp{Number(revAmount || 0).toLocaleString('id-ID')}</strong>. Tagihan bulan sebelum {revFromMonth} yang sudah berjalan tidak akan terpengaruh.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsRevisionModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                  >
                    Terapkan Perubahan Tarif
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleApplyDropout} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Santri yang Berhenti / Pindah *
                  </label>
                  <select
                    required
                    value={dropoutStudentId}
                    onChange={(e) => setDropoutStudentId(e.target.value)}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="">-- Pilih Santri --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.current_enrollment?.unit || 'SD IT'} - {s.current_enrollment?.grade || '-'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Status Santri Baru
                    </label>
                    <select
                      value={dropoutStatus}
                      onChange={(e) => setDropoutStatus(e.target.value as 'nonaktif' | 'pindah')}
                      className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="nonaktif">Non-Aktif (Berhenti / Keluar)</option>
                      <option value="pindah">Pindah Sekolah</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Efektif Mulai Bulan
                    </label>
                    <select
                      value={dropoutMonth}
                      onChange={(e) => setDropoutMonth(e.target.value)}
                      className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    >
                      {SPP_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          Bulan {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Tindakan Tagihan Bulan Mendatang ({dropoutMonth} s/d Juni):
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-100/60 transition">
                      <input
                        type="radio"
                        name="dropoutAction"
                        checked={dropoutAction === 'bebas'}
                        onChange={() => setDropoutAction('bebas')}
                        className="mt-0.5 text-emerald-700"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800">
                          Bebaskan Tagihan (Status: Bebas) - Disarankan
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Tagihan tetap tersimpan untuk riwayat audit, namun status menjadi Bebas sehingga tidak akan lagi tertagih ataupun dihitung sebagai tunggakan aktif.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-100/60 transition">
                      <input
                        type="radio"
                        name="dropoutAction"
                        checked={dropoutAction === 'delete'}
                        onChange={() => setDropoutAction('delete')}
                        className="mt-0.5 text-rose-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-rose-800">
                          Hapus Permanen Tagihan Mendatang
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Tagihan SPP bulan {dropoutMonth} ke depan yang belum dibayar akan dihapus secara permanen dari database.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsRevisionModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-600 rounded-xl transition shadow-sm"
                  >
                    Proses Santri Berhenti
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
