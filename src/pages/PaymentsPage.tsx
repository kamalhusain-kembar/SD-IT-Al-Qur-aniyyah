import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  CheckCircle2,
  Calendar,
  DollarSign,
  User,
  History,
  RotateCcw,
  Sparkles,
  AlertCircle,
  FileCheck2,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentService } from '../services/studentService';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { paymentService } from '../services/paymentService';
import { Student, Bill, Payment } from '../types/database';

export const PaymentsPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey, triggerRefresh } = useApp();

  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [studentBills, setStudentBills] = useState<Bill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [isLoadingBills, setIsLoadingBills] = useState(false);

  // Form Fields
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Tunai');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keepStudentAfterSave, setKeepStudentAfterSave] = useState(true);

  // Recent payments list
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Cancel payment modal
  const [cancellingPayment, setCancellingPayment] = useState<Payment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // 1. Fetch students for search
  useEffect(() => {
    studentService.getAllWithEnrollment({
      academicYearId: selectedAcademicYearId || undefined
    }).then(setStudents).catch(console.error);
  }, [selectedAcademicYearId, refreshKey]);

  // 2. Fetch bills when selectedStudent changes
  useEffect(() => {
    if (!selectedStudent || !selectedAcademicYearId) {
      setStudentBills([]);
      setSelectedBillId('');
      setAmount('');
      return;
    }

    setIsLoadingBills(true);
    billingService.getBillsByStudent(selectedStudent.id, selectedAcademicYearId)
      .then((bills) => {
        setStudentBills(bills);
        // Find first unpaid bill (prefer SPP current month or earliest unpaid)
        const firstUnpaid = bills.find((b) => (b.remaining_amount || 0) > 0);
        if (firstUnpaid) {
          setSelectedBillId(firstUnpaid.id);
          setAmount(String(firstUnpaid.remaining_amount));
        } else if (bills.length > 0) {
          setSelectedBillId(bills[0].id);
          setAmount(String(bills[0].remaining_amount || bills[0].amount));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingBills(false));
  }, [selectedStudent, selectedAcademicYearId, refreshKey]);

  // 3. Update amount when selected bill changes
  const handleBillSelect = (billId: string) => {
    setSelectedBillId(billId);
    const bill = studentBills.find((b) => b.id === billId);
    if (bill) {
      setAmount(String(bill.remaining_amount || bill.amount));
    }
  };

  // 4. Fetch recent payments
  const loadRecentPayments = async () => {
    setIsLoadingRecent(true);
    try {
      const pmts = await paymentService.getRecentPayments(15, selectedAcademicYearId);
      setRecentPayments(pmts);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  useEffect(() => {
    loadRecentPayments();
  }, [selectedAcademicYearId, refreshKey]);

  // Filter students for search dropdown
  const filteredStudents = studentSearch.trim()
    ? students.filter((s) => {
        const query = studentSearch.toLowerCase();
        return (
          s.full_name.toLowerCase().includes(query) ||
          (s.nis && s.nis.toLowerCase().includes(query)) ||
          (s.phone && s.phone.includes(query))
        );
      }).slice(0, 8)
    : [];

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      showToast('Pilih nama siswa terlebih dahulu', 'error');
      return;
    }
    if (!selectedBillId) {
      showToast('Pilih tagihan yang akan dibayar', 'error');
      return;
    }
    const payNominal = Number(amount);
    if (!payNominal || payNominal <= 0) {
      showToast('Masukkan nominal pembayaran yang valid', 'error');
      return;
    }

    const bill = studentBills.find((b) => b.id === selectedBillId);
    if (!bill) {
      showToast('Tagihan tidak valid', 'error');
      return;
    }

    if (payNominal > (bill.remaining_amount || bill.amount)) {
      showToast(
        `Nominal melebihi sisa tagihan (Rp${Number(bill.remaining_amount || bill.amount).toLocaleString('id-ID')})`,
        'error'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await paymentService.recordPayment({
        student_id: selectedStudent.id,
        payment_date: paymentDate,
        amount: payNominal,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
        allocations: [
          {
            bill_id: selectedBillId,
            allocated_amount: payNominal,
          },
        ],
      });

      showToast(`Pembayaran Rp${payNominal.toLocaleString('id-ID')} untuk ${selectedStudent.full_name} berhasil disimpan!`, 'success');
      triggerRefresh();
      loadRecentPayments();

      if (!keepStudentAfterSave) {
        setSelectedStudent(null);
        setStudentSearch('');
      } else {
        // Re-fetch bills for this student
        const updatedBills = await billingService.getBillsByStudent(selectedStudent.id, selectedAcademicYearId);
        setStudentBills(updatedBills);
        const nextUnpaid = updatedBills.find((b) => (b.remaining_amount || 0) > 0);
        if (nextUnpaid) {
          setSelectedBillId(nextUnpaid.id);
          setAmount(String(nextUnpaid.remaining_amount));
        } else {
          setAmount('');
        }
      }
    } catch (err: any) {
      showToast('Gagal mencatat pembayaran: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingPayment) return;
    if (!cancelReason.trim()) {
      showToast('Alasan pembatalan wajib diisi', 'error');
      return;
    }

    try {
      await paymentService.cancelPayment(cancellingPayment.id, cancelReason.trim());
      showToast('Pembayaran berhasil dibatalkan dan sisa tagihan dihitung ulang', 'success');
      setCancellingPayment(null);
      setCancelReason('');
      triggerRefresh();
      loadRecentPayments();
    } catch (err: any) {
      showToast('Gagal membatalkan pembayaran: ' + err.message, 'error');
    }
  };

  const selectedBill = studentBills.find((b) => b.id === selectedBillId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 pb-8">
      {/* LEFT / MAIN COLUMN: Input Form (7 Cols) */}
      <div className="lg:col-span-7 space-y-3">
        <div className="bg-white rounded-xl p-3.5 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Input Cepat &amp; Akurat
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-800 mt-0.5">
                Catat Pembayaran Siswa
              </h3>
              <p className="text-[11px] text-slate-500">
                Tahun Ajaran {selectedAcademicYear?.name || '2026/2027'}
              </p>
            </div>

            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>

          <form onSubmit={handleSavePayment} className="space-y-4 pt-4">
            {/* Step 1: Search & Select Student */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>1. Pilih Nama Siswa *</span>
                {selectedStudent && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudent(null);
                      setStudentSearch('');
                    }}
                    className="text-[11px] text-rose-600 hover:underline font-semibold"
                  >
                    Ganti Siswa
                  </button>
                )}
              </label>

              {!selectedStudent ? (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Ketik nama siswa (contoh: Amar, Abid, dsb)..."
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-slate-50/50"
                  />

                  {filteredStudents.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                      {filteredStudents.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudent(s);
                            setStudentSearch('');
                          }}
                          className="w-full text-left p-3 hover:bg-emerald-50 flex items-center justify-between text-xs transition"
                        >
                          <div>
                            <p className="font-bold text-slate-800">{s.full_name}</p>
                            <p className="text-[11px] text-slate-400">
                              NIS: {s.nis || '-'} · {s.current_enrollment?.unit || 'SMP IT'} · Kelas {s.current_enrollment?.grade || '-'}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {s.current_enrollment?.administrative_status || 'Mampu'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-300 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                      {selectedStudent.full_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-emerald-950">{selectedStudent.full_name}</p>
                      <p className="text-xs text-emerald-800">
                        NIS: {selectedStudent.nis || '-'} · {selectedStudent.current_enrollment?.unit || 'SMP IT'} Kelas {selectedStudent.current_enrollment?.grade || '-'} ({selectedStudent.current_enrollment?.administrative_status || 'Mampu'})
                      </p>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
              )}
            </div>

            {/* Step 2: Select Bill (SPP or One-Time) */}
            {selectedStudent && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  2. Pilih Tagihan yang Dibayar *
                </label>

                {isLoadingBills ? (
                  <p className="text-xs text-slate-400 py-3">Memuat tagihan siswa...</p>
                ) : studentBills.length === 0 ? (
                  <p className="text-xs text-rose-500 py-2">
                    Belum ada tagihan untuk siswa ini di T.A. aktif. Tambahkan tagihan di menu Tagihan Siswa.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={selectedBillId}
                      onChange={(e) => handleBillSelect(e.target.value)}
                      className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
                    >
                      <optgroup label="Tagihan SPP Bulanan">
                        {studentBills
                          .filter((b) => b.category?.name.toLowerCase().includes('spp'))
                          .map((b) => {
                            const isLunas = b.calculated_status === 'Lunas' || b.calculated_status === 'Bebas';
                            return (
                              <option key={b.id} value={b.id} className="text-xs py-1">
                                SPP {b.billing_period} - Tagihan: Rp{Number(b.amount).toLocaleString('id-ID')} | Sisa: Rp{Number(b.remaining_amount || 0).toLocaleString('id-ID')} ({b.calculated_status})
                              </option>
                            );
                          })}
                      </optgroup>
                      <optgroup label="Tagihan Non-SPP (Perlengkapan, Pembangunan, dsb)">
                        {studentBills
                          .filter((b) => !b.category?.name.toLowerCase().includes('spp'))
                          .map((b) => (
                            <option key={b.id} value={b.id} className="text-xs py-1">
                              {b.category?.name} - Tagihan: Rp{Number(b.amount).toLocaleString('id-ID')} | Sisa: Rp{Number(b.remaining_amount || 0).toLocaleString('id-ID')} ({b.calculated_status})
                            </option>
                          ))}
                      </optgroup>
                    </select>

                    {/* Quick Bill Info Box */}
                    {selectedBill && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <p className="text-slate-500">Status Saat Ini:</p>
                          <span
                            className={`inline-block font-bold mt-0.5 px-2 py-0.5 rounded text-[10px] ${
                              selectedBill.calculated_status === 'Lunas' || selectedBill.calculated_status === 'Bebas'
                                ? 'bg-emerald-100 text-emerald-800'
                                : selectedBill.calculated_status === 'Belum Lunas'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {selectedBill.calculated_status}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-500">Sisa Tagihan:</p>
                          <p className="font-black text-rose-600 text-sm">
                            Rp{Number(selectedBill.remaining_amount || 0).toLocaleString('id-ID')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Payment Date & Nominal */}
            {selectedStudent && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. Tanggal Pembayaran Sebenarnya *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tanggal saat transaksi terjadi (bukan tanggal buka aplikasi)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    4. Nominal Pembayaran (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Contoh: 1335000"
                    className="w-full text-sm font-black px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white text-emerald-950"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Dapat bayar sebagian (parsial) atau lunas
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Payment Method & Notes */}
            {selectedStudent && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Metode Pembayaran</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Tunai">Tunai / Cash</option>
                    <option value="Transfer BSI">Transfer BSI</option>
                    <option value="Transfer Mandiri">Transfer Bank Mandiri</option>
                    <option value="Transfer BRI">Transfer BRI</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Catatan / Keterangan</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nomor referensi / keterangan..."
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
            )}

            {/* Consecutive Entry Toggle & Save Button */}
            {selectedStudent && (
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepStudentAfterSave}
                    onChange={(e) => setKeepStudentAfterSave(e.target.checked)}
                    className="rounded text-emerald-700"
                  />
                  <span>Tetap pada siswa ini untuk input pembayaran berikutnya (Mode Cepat)</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-800 hover:bg-emerald-700 text-white text-sm font-black rounded-xl transition shadow-md shadow-emerald-950/20 disabled:opacity-50"
                >
                  <FileCheck2 className="w-5 h-5 text-gold-400" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran'}</span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT COLUMN: Recent Transactions & Audit History (5 Cols) */}
      <div className="lg:col-span-5 space-y-3">
        <div className="bg-white rounded-xl p-3.5 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-800">Riwayat Pembayaran Terbaru</h4>
              <p className="text-[10px] text-slate-400">Transaksi tercatat di database Supabase</p>
            </div>
            <History className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="divide-y divide-slate-100 mt-2 max-h-[600px] overflow-y-auto">
            {isLoadingRecent ? (
              <p className="text-xs text-slate-400 py-6 text-center">Memuat riwayat transaksi...</p>
            ) : recentPayments.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Belum ada transaksi pembayaran.</p>
            ) : (
              recentPayments.map((p) => {
                const isCancelled = p.status === 'cancelled';
                const firstAlloc = p.allocations?.[0];
                const catName = firstAlloc?.bill?.category?.name || 'Tagihan';
                const period = firstAlloc?.bill?.billing_period;

                return (
                  <div key={p.id} className="py-3 flex items-start justify-between text-xs">
                    <div className="space-y-0.5">
                      <p className={`font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {p.student?.full_name || 'Siswa'}
                      </p>
                      <p className="text-[11px] text-emerald-800 font-semibold">
                        {catName} {period ? `(${period})` : ''} · {p.payment_method}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {p.payment_date} · {p.transaction_number}
                      </p>
                      {p.notes && (
                        <p className="text-[10px] text-slate-500 italic">{p.notes}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`font-black text-sm ${isCancelled ? 'line-through text-slate-400' : 'text-emerald-700'}`}>
                        Rp{Number(p.amount).toLocaleString('id-ID')}
                      </p>
                      {isCancelled ? (
                        <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                          Dibatalkan
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCancellingPayment(p)}
                          className="text-[10px] text-rose-600 hover:text-rose-800 underline font-semibold mt-1"
                        >
                          Batalkan (Koreksi)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal Cancel Payment */}
      {cancellingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h4 className="text-base font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>Batalkan Pembayaran</span>
              </h4>
              <button
                onClick={() => setCancellingPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Anda akan membatalkan transaksi <strong>{cancellingPayment.transaction_number}</strong> sebesar{' '}
              <strong>Rp{Number(cancellingPayment.amount).toLocaleString('id-ID')}</strong> untuk{' '}
              <strong>{cancellingPayment.student?.full_name}</strong>. Data ini akan ditandai dibatalkan dan sisa tagihan akan otomatis dikembalikan.
            </p>

            <form onSubmit={handleCancelPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Alasan Pembatalan / Koreksi *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Salah input nominal atau salah nama siswa"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCancellingPayment(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition shadow-sm"
                >
                  Konfirmasi Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
