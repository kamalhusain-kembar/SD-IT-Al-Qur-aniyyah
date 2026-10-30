import React, { useState } from 'react';
import {
  X,
  Printer,
  Camera,
  Copy,
  Check,
  Calendar,
  Phone,
  Building2,
  Image as ImageIcon
} from 'lucide-react';
import { StudentCrossYearArrears, formatGradeDisplay } from '../types/database';
import html2canvas from 'html2canvas';
import logoImg from '../assets/logo.png';

interface StudentArrearsCardModalProps {
  studentArrears: StudentCrossYearArrears;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const SPP_MONTH_ORDER = [
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
  'januari', 'februari', 'maret', 'april', 'mei', 'juni'
];

interface StudentPaymentAccount {
  isVirtualAccount: boolean;
  bankName: string;
  accountLabel: string;
  accountNumber: string;
  accountHolder: string;
}

const getStudentPaymentAccount = (student: { full_name: string; nis?: string | null }): StudentPaymentAccount => {
  const rawNis = (student.nis || '').trim();
  const cleanNis = rawNis.replace(/[^0-9]/g, '');

  if (cleanNis) {
    // Jika NIS / Rekening diawali 103 atau 102 -> tambahkan prefix 9003189
    if (cleanNis.startsWith('103') || cleanNis.startsWith('102') || cleanNis.startsWith('101')) {
      return {
        isVirtualAccount: true,
        bankName: 'Bank Syariah Indonesia (BSI)',
        accountLabel: 'No. Virtual Account (VA)',
        accountNumber: `9003189${cleanNis}`,
        accountHolder: student.full_name,
      };
    }

    // Jika NIS / Rekening diawali 0011 dst -> tambahkan prefix 9001480
    if (cleanNis.startsWith('0011') || cleanNis.startsWith('001')) {
      return {
        isVirtualAccount: true,
        bankName: 'Bank Syariah Indonesia (BSI)',
        accountLabel: 'No. Virtual Account (VA)',
        accountNumber: `9001480${cleanNis}`,
        accountHolder: student.full_name,
      };
    }
  }

  // Fallback rekening resmi yayasan jika santri belum memiliki nomor VA / NIS
  return {
    isVirtualAccount: false,
    bankName: 'Bank Syariah Indonesia (BSI)',
    accountLabel: 'No. Rekening',
    accountNumber: '7110256118',
    accountHolder: "Yayasan Al-Qur'aniyyah",
  };
};

export const StudentArrearsCardModal: React.FC<StudentArrearsCardModalProps> = ({
  studentArrears,
  onClose,
  showToast,
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [copied, setCopied] = useState(false);

  const student = studentArrears.student;
  const grandTotal = studentArrears.grand_total_arrears;
  const isLunas = grandTotal === 0;
  const paymentAccount = getStudentPaymentAccount(student);

  // Format today's date in Indonesian
  const todayFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  // Download High-Res Screenshot as PNG (Landscape)
  const handleDownloadImage = async () => {
    const cardElement = document.getElementById('student-arrears-printable-card');
    if (!cardElement) return;

    setIsCapturing(true);
    try {
      const canvas = await html2canvas(cardElement, {
        scale: 2, // High resolution for crisp text & borders
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1400,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const cleanName = student.full_name.replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `Kartu_Tunggakan_Landscape_${cleanName}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Gambar kartu tunggakan (Landscape) berhasil didownload (PNG)!', 'success');
    } catch (err: any) {
      console.error('Failed to capture card:', err);
      showToast('Gagal membuat gambar kartu: ' + err.message, 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  // Copy High-Res Image directly to Clipboard (Landscape, without download)
  const handleCopyImage = async () => {
    const cardElement = document.getElementById('student-arrears-printable-card');
    if (!cardElement) return;

    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast('Browser Anda tidak mendukung salin gambar langsung. Silakan gunakan tombol Download PNG.', 'error');
      return;
    }

    setIsCopyingImage(true);
    try {
      const canvas = await html2canvas(cardElement, {
        scale: 2, // High resolution for crisp text & borders
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1400,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Gagal memproses gambar untuk disalin', 'error');
          setIsCopyingImage(false);
          return;
        }

        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          setImageCopied(true);
          showToast('Gambar kartu landscape berhasil disalin ke clipboard! Langsung tekan Ctrl + V di WhatsApp.', 'success');
          setTimeout(() => setImageCopied(false), 3000);
        } catch (clipErr: any) {
          console.error('Clipboard write error:', clipErr);
          showToast('Izin clipboard ditolak. Silakan gunakan tombol Download PNG.', 'error');
        } finally {
          setIsCopyingImage(false);
        }
      }, 'image/png');
    } catch (err: any) {
      console.error('Failed to copy card image:', err);
      showToast('Gagal menyalin gambar: ' + err.message, 'error');
      setIsCopyingImage(false);
    }
  };

  // Print or Save as PDF (Landscape)
  const handlePrintPdf = () => {
    window.print();
  };

  // Copy structured message for WhatsApp
  const handleCopyWhatsApp = () => {
    let text = `*RINCIAN TUNGGAKAN SISWA*\n`;
    text += `*YAYASAN AL-QUR'ANIYYAH*\n`;
    text += `_TK & SD IT Al-Qur'aniyyah_\n`;
    text += `====================\n\n`;
    text += `Assalamu'alaikum Wr. Wb.\n\n`;
    text += `Kepada Yth.\n`;
    text += `Orang Tua / Wali dari Ananda:\n`;
    text += `Nama Siswa : *${student.full_name}*\n`;
    text += `NIS        : ${student.nis || '-'}\n`;
    text += `Jenjang/Kls: ${studentArrears.current_unit || 'SD IT'} · ${formatGradeDisplay(studentArrears.current_grade, studentArrears.current_unit)}\n\n`;
    text += `Dengan ini kami sampaikan rincian kewajiban pembayaran yang masih tercatat pada sistem keuangan:\n\n`;

    studentArrears.years.forEach((y) => {
      const unpaidItems = y.bills_detail.filter((b) => b.remaining > 0 && b.status !== 'Akan Berlangsung');
      if (unpaidItems.length > 0) {
        text += `📌 *Tahun Ajaran ${y.academic_year_name} (${formatGradeDisplay(y.grade, y.unit)})*\n`;
        unpaidItems.forEach((b) => {
          text += ` • ${b.category_name}${b.billing_period ? ` (${b.billing_period})` : ''} : Rp${b.remaining.toLocaleString('id-ID')}\n`;
        });
        text += `   _Subtotal: Rp${y.remaining_arrears.toLocaleString('id-ID')}_\n\n`;
      }
    });

    text += `----------------------------------\n`;
    text += `*TOTAL SISA TUNGGAKAN: Rp${grandTotal.toLocaleString('id-ID')}*\n`;
    text += `----------------------------------\n\n`;
    text += `*Pembayaran dapat disalurkan melalui transfer:*\n`;
    text += `${paymentAccount.bankName}\n`;
    if (paymentAccount.isVirtualAccount) {
      text += `No. Virtual Account (VA) : *${paymentAccount.accountNumber}*\n`;
      text += `Atas Nama    : *${paymentAccount.accountHolder}*\n\n`;
    } else {
      text += `No. Rekening : *${paymentAccount.accountNumber}*\n`;
      text += `Atas Nama    : *${paymentAccount.accountHolder}*\n\n`;
    }
    text += `Konfirmasi Bukti Transfer: *0857-1723-5374* (Bendahara: Nasrulloh)\n\n`;
    text += `Mohon kirimkan bukti transfer setelah melakukan pembayaran. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.\n`;
    text += `Jazakumullahu khairan katsiran. 🙏\n\n`;
    text += `Wassalamu'alaikum Wr. Wb.\n\n`;
    text += `_Bendahara Yayasan Al-Qur'aniyyah - Nasrulloh_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Teks rincian berhasil disalin untuk WhatsApp!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  const isSpp = (b: { category_name: string }) => {
    const name = b.category_name.toLowerCase();
    return name.includes('spp') || name.includes('syahriyyah');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-slate-100 rounded-2xl max-w-6xl w-full shadow-2xl border border-slate-300 max-h-[96vh] flex flex-col overflow-hidden my-auto">
        
        {/* Top Control Bar (Hidden on print) */}
        <div className="bg-white px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              Format Landscape · Pas Lintas Tahun Ajaran
            </span>
            <h4 className="text-sm sm:text-base font-bold text-slate-800 mt-0.5">
              Rincian Tunggakan: <span className="text-emerald-900">{student.full_name}</span>
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle view: All vs Unpaid only */}
            <button
              onClick={() => setOnlyUnpaid(!onlyUnpaid)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                onlyUnpaid
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Filter tampilan item tagihan"
            >
              {onlyUnpaid ? '⚠️ Hanya Belum Lunas' : '📋 Semua Item Tagihan'}
            </button>

            {/* Copy Image directly to Clipboard (Landscape, Tanpa Download) */}
            <button
              onClick={handleCopyImage}
              disabled={isCopyingImage}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold transition shadow-xs disabled:opacity-50 ${
                imageCopied
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              title="Salin gambar kartu landscape langsung ke clipboard tanpa download (bisa langsung paste / Ctrl+V di WhatsApp)"
            >
              {imageCopied ? (
                <Check className="w-3.5 h-3.5 text-white" />
              ) : (
                <ImageIcon className={`w-3.5 h-3.5 ${isCopyingImage ? 'animate-spin' : ''}`} />
              )}
              <span>{isCopyingImage ? 'Menyalin...' : imageCopied ? 'Gambar Tersalin!' : 'Salin Gambar (Landscape)'}</span>
            </button>

            {/* Copy WA Message */}
            <button
              onClick={handleCopyWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-200"
              title="Salin ringkasan pesan rapi untuk WhatsApp"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin' : 'Salin WA'}</span>
            </button>

            {/* Download as Image (PNG) */}
            <button
              onClick={handleDownloadImage}
              disabled={isCapturing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
              title="Download gambar kartu landscape untuk dikirim ke WhatsApp"
            >
              <Camera className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin' : ''}`} />
              <span>{isCapturing ? 'Memproses...' : 'Download PNG'}</span>
            </button>

            {/* Print / Export PDF */}
            <button
              onClick={handlePrintPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
              title="Cetak langsung ke printer atau Simpan sebagai PDF A4 Landscape"
            >
              <Printer className="w-3.5 h-3.5 text-amber-300" />
              <span>Cetak / PDF (Landscape)</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Card Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/60">
          
          {/* THE OFFICIAL CARD (TARGET FOR SCREENSHOT & PRINT - LANDSCAPE LAYOUT) */}
          <div
            id="student-arrears-printable-card"
            style={{ width: '100%', maxWidth: '1050px' }}
            className="bg-white mx-auto p-6 sm:p-8 rounded-2xl border border-slate-300 shadow-md relative overflow-hidden text-slate-800"
          >
            {/* Watermark Stamp (Lunas / Belum Lunas) - Di pojok kanan atas, tidak menabrak teks */}
            <div className="absolute right-8 top-7 pointer-events-none opacity-20 rotate-[-10deg] select-none">
              <div
                className={`border-3 border-dashed rounded-xl px-5 py-1.5 text-xl font-black uppercase tracking-widest ${
                  isLunas ? 'border-emerald-600 text-emerald-600' : 'border-rose-600 text-rose-600'
                }`}
              >
                {isLunas ? 'LUNAS' : 'BELUM LUNAS'}
              </div>
            </div>

            {/* Kop Surat Resmi */}
            <div className="border-b-2 border-emerald-900 pb-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                    <img
                      src={logoImg}
                      alt="Logo Al-Qur'aniyyah"
                      className="w-14 h-14 object-contain"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-emerald-950 uppercase tracking-wide leading-tight">
                      Yayasan Pendidikan Islam Al-Qur'aniyyah
                    </h2>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">
                      TK IT &amp; SD IT Al-Qur'aniyyah
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pondok Aren, Tangerang Selatan · Sistem Rekapitulasi Keuangan Santri Lintas Tahun
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 hidden sm:block shrink-0">
                  <p className="font-semibold text-slate-700">Tanggal Dokumen:</p>
                  <p className="font-bold text-slate-800">{todayFormatted}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Dok. Keuangan Resmi</p>
                </div>
              </div>

              {/* Decorative green and gold lines */}
              <div className="w-full flex h-1 mt-2.5 rounded-full overflow-hidden">
                <div className="w-3/4 bg-emerald-800"></div>
                <div className="w-1/4 bg-amber-500"></div>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center my-3">
              <h4 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wider">
                Kartu Rincian Kewajiban &amp; Tunggakan Siswa
              </h4>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Rekapitulasi Riwayat Pembayaran Tagihan Sekolah Lintas Tahun Ajaran
              </p>
            </div>

            {/* Top Row in Landscape: Biodata Santri (Kiri) & Ringkasan KPI (Kanan) Side-by-Side */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 mb-4">
              
              {/* Left: Student Metadata Box (7 Cols) */}
              <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-center">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Nama Santri/Siswa</span>
                    <span className="font-bold text-slate-800 text-sm leading-tight block">{student.full_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">NIS / No. Rekening</span>
                    <span className="font-mono font-bold text-slate-700 text-xs block">
                      {student.nis ? (
                        student.nis
                      ) : (
                        <span className="text-amber-600 font-sans font-normal italic text-[11px]">Belum diisi</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Jenjang / Kelas</span>
                    <span className="font-bold text-emerald-900 text-xs block">
                      {studentArrears.current_unit || 'SD IT'} · {formatGradeDisplay(studentArrears.current_grade, studentArrears.current_unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">No. WhatsApp / Wali</span>
                    <span className="font-bold text-slate-700 flex items-center gap-1 text-xs">
                      <Phone className="w-3 h-3 text-emerald-700 shrink-0" />
                      <span>{student.phone || '-'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Grand Summary 3 KPI Boxes (5 Cols) */}
              <div className="lg:col-span-5 grid grid-cols-3 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center flex flex-col justify-center">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Total Tagihan</p>
                  <p className="text-xs sm:text-sm font-black text-slate-800 mt-1 leading-normal">
                    Rp{studentArrears.grand_total_bills.toLocaleString('id-ID')}
                  </p>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center flex flex-col justify-center">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-800">Total Terbayar</p>
                  <p className="text-xs sm:text-sm font-black text-emerald-700 mt-1 leading-normal">
                    Rp{studentArrears.grand_total_paid.toLocaleString('id-ID')}
                  </p>
                </div>

                <div
                  className={`rounded-xl p-2.5 text-center border flex flex-col justify-center ${
                    isLunas ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
                  }`}
                >
                  <p
                    className={`text-[9.5px] font-bold uppercase tracking-wider ${
                      isLunas ? 'text-emerald-800' : 'text-rose-800'
                    }`}
                  >
                    Sisa Tunggakan
                  </p>
                  <p
                    className={`text-xs sm:text-sm font-black mt-1 leading-normal ${
                      isLunas ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    Rp{grandTotal.toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

            </div>

            {/* Itemized Breakdown per Academic Year (Landscape Grid for Multi-Year Support) */}
            <div
              className={`mb-4 ${
                studentArrears.years.length > 1
                  ? 'grid grid-cols-1 xl:grid-cols-2 gap-4'
                  : 'space-y-4'
              }`}
            >
              {studentArrears.years.map((year) => {
                // Saring tagihan agar tidak menyertakan status 'Akan Berlangsung' (hanya tagihan yang sudah/sedang berjalan)
                const activeBills = year.bills_detail.filter((b) => b.status !== 'Akan Berlangsung');

                // Urutkan bills secara kronologis: SPP (Juli s.d. Juni), kemudian non-SPP
                const sortedBills = [...activeBills].sort((a, b) => {
                  const isSppA = isSpp(a);
                  const isSppB = isSpp(b);
                  if (isSppA && !isSppB) return -1;
                  if (!isSppA && isSppB) return 1;
                  if (isSppA && isSppB) {
                    const idxA = SPP_MONTH_ORDER.indexOf(a.billing_period?.toLowerCase() || '');
                    const idxB = SPP_MONTH_ORDER.indexOf(b.billing_period?.toLowerCase() || '');
                    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                  }
                  return a.category_name.localeCompare(b.category_name);
                });

                const displayedBills = onlyUnpaid
                  ? sortedBills.filter((b) => b.remaining > 0)
                  : sortedBills;

                if (displayedBills.length === 0) return null;

                return (
                  <div
                    key={year.academic_year_id}
                    className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                  >
                    {/* Header per Tahun Ajaran */}
                    <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-3.5 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-800" />
                        <span className="font-bold text-xs text-slate-800">
                          Tahun Ajaran {year.academic_year_name} ({formatGradeDisplay(year.grade, year.unit)})
                        </span>
                        <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                          {year.unit}
                        </span>
                      </div>

                      <div className="text-xs flex items-center gap-3">
                        <span className="text-slate-500 text-[11px]">
                          Terbayar: <strong>Rp{year.total_paid.toLocaleString('id-ID')}</strong>
                        </span>
                        <span
                          className={`font-black px-2 py-0.5 rounded text-[11px] ${
                            year.remaining_arrears > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          Tunggakan: Rp{year.remaining_arrears.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Table of Bills (Landscape: Kolom Lega & Status Tidak Bertumpuk) */}
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                          <th className="py-2 px-3 w-8 text-center">No</th>
                          <th className="py-2 px-3">Item Tagihan</th>
                          <th className="py-2 px-3 text-right">Nominal Tagihan</th>
                          <th className="py-2 px-3 text-right">Telah Dibayar</th>
                          <th className="py-2 px-3 text-right">Sisa Belum Bayar</th>
                          <th className="py-2 px-4 text-center whitespace-nowrap w-36">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {displayedBills.map((b, bIdx) => (
                          <tr
                            key={b.bill_id}
                            className={
                              b.remaining > 0
                                ? 'bg-rose-50/20 hover:bg-rose-50/40'
                                : 'bg-white hover:bg-slate-50/50'
                            }
                          >
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {bIdx + 1}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {b.category_name}
                              {b.billing_period ? (
                                <span className="font-semibold text-emerald-900 ml-1">
                                  ({b.billing_period})
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600">
                              Rp{b.amount.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                              Rp{b.paid.toLocaleString('id-ID')}
                            </td>
                            {/* Merah HANYA jika benar-benar ada tunggakan, jika Rp0 abu-abu netral */}
                            <td
                              className={`py-2 px-3 text-right ${
                                b.remaining > 0
                                  ? 'font-black text-rose-600'
                                  : 'font-semibold text-slate-400'
                              }`}
                            >
                              Rp{b.remaining.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-4 text-center whitespace-nowrap">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                  b.status === 'Lunas' || b.status === 'Bebas'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : b.status === 'Belum Lunas'
                                    ? 'bg-amber-100 text-amber-800'
                                    : b.status === 'Akan Berlangsung'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* Bottom Row in Landscape: Rekening Bank (Kiri) & Tanda Tangan (Kanan) Side-by-Side */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end pt-2 border-t border-slate-200">
              
              {/* Left: Informasi Rekening Resmi Pembayaran (7 Cols) */}
              <div className="lg:col-span-7 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-800 text-amber-300 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <p className="font-black text-emerald-950">
                        {paymentAccount.isVirtualAccount
                          ? 'Rekening Virtual Account (VA) Siswa:'
                          : 'Rekening Resmi Pembayaran Sekolah:'}
                      </p>
                      <p className="text-slate-700 mt-0.5">
                        Bank: <strong>{paymentAccount.bankName}</strong> ·{' '}
                        {paymentAccount.isVirtualAccount ? 'No. VA' : 'No. Rek'}:{' '}
                        <strong className="font-mono text-emerald-950 bg-emerald-100/80 px-1.5 py-0.5 rounded text-xs">
                          {paymentAccount.accountNumber}
                        </strong>
                      </p>
                      <p className="text-slate-600 mt-0.5">
                        Atas Nama: <strong>{paymentAccount.accountHolder}</strong>
                      </p>
                      {!paymentAccount.isVirtualAccount && (
                        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded mt-1.5 inline-block font-medium">
                          ⚠️ NIS santri belum diisi di menu Data Siswa (nomor VA otomatis aktif setelah NIS diisi).
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500 border-t sm:border-t-0 sm:border-l border-emerald-200 pt-2 sm:pt-0 sm:pl-3 shrink-0">
                    <p className="font-semibold text-emerald-950">Konfirmasi Bukti Transfer:</p>
                    <p className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-emerald-700" />
                      <span>0857-1723-5374</span>
                    </p>
                    <p className="text-emerald-900 font-bold text-[11px] mt-0.5">Bendahara: Nasrulloh</p>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-emerald-200/60 text-[10px] text-slate-400 space-y-0.5">
                  <p>• Catatan: Simpan kartu ini sebagai bukti rincian tagihan resmi.</p>
                  <p>• Dokumen ini dicetak otomatis dari Sistem Keuangan SIMKA Al-Qur'aniyyah.</p>
                </div>
              </div>

              {/* Right: Tanda Tangan & Pengesahan (5 Cols) */}
              <div className="lg:col-span-5 flex justify-end">
                <div className="text-center w-56 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600 mb-0.5">
                    Jakarta, {todayFormatted}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-700">
                    Bendahara Keuangan,
                  </p>
                  {/* Spacer for signature */}
                  <div className="h-12 flex items-center justify-center">
                    <span className="text-[10px] text-slate-300 italic select-none">
                      [Tervalidasi Sistem]
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-xs border-t border-slate-300 pt-1">
                    Nasrulloh
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Bendahara Al-Qur'aniyyah
                  </p>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Bottom Modal Actions */}
        <div className="bg-white px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0 no-print">
          <p className="text-xs text-slate-500">
            💡 <em>Format Landscape memudahkan tampilan santri yang memiliki rincian tagihan lintas beberapa tahun ajaran.</em>
          </p>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
