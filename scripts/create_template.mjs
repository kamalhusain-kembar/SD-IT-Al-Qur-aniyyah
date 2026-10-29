import * as XLSX from 'xlsx';
import * as path from 'path';

// Sheet 1: TAGIHAN
const tagihanData = [
  {
    "NO": 1,
    "NAMA": "Muhammad Fatih",
    "JK": "L",
    "STATUS": "Mampu",
    "NO TELPON": "081234567890",
    "NO REKENING": "202607001",
    "JENJANG": "SMP IT",
    "KELAS": "VII A",
    "SPP": 1335000,
    "PERLENGKAPAN": 500000,
    "PERALATAN": 250000,
    "KEGIATAN": 300000,
    "PEMBANGUNAN": 1000000,
    "UJIAN": 200000,
    "LAINNYA": 0
  },
  {
    "NO": 2,
    "NAMA": "Aisyah Humaira",
    "JK": "P",
    "STATUS": "Yatim",
    "NO TELPON": "081298765432",
    "NO REKENING": "202607002",
    "JENJANG": "SMA IT",
    "KELAS": "X IPA",
    "SPP": 0,
    "PERLENGKAPAN": 500000,
    "PERALATAN": 250000,
    "KEGIATAN": 300000,
    "PEMBANGUNAN": 0,
    "UJIAN": 200000,
    "LAINNYA": 0
  },
  {
    "NO": 3,
    "NAMA": "Umar Al-Faruq",
    "JK": "L",
    "STATUS": "Mampu",
    "NO TELPON": "085612345678",
    "NO REKENING": "202607003",
    "JENJANG": "SMP IT",
    "KELAS": "VIII B",
    "SPP": 1250000,
    "PERLENGKAPAN": 0,
    "PERALATAN": 0,
    "KEGIATAN": 300000,
    "PEMBANGUNAN": 500000,
    "UJIAN": 200000,
    "LAINNYA": 50000
  }
];

// Sheet 2: PEMBAYARAN
const pembayaranData = [
  {
    "NO": 1,
    "NAMA": "Muhammad Fatih",
    "JK": "L",
    "STATUS": "Mampu",
    "NO REKENING": "202607001",
    "JENJANG": "SMP IT",
    "KELAS": "VII A",
    "SPP": 1335000,
    "Juli": "2026-07-25",
    "Agustus": "2026-08-28",
    "September": "",
    "Oktober": "",
    "November": "",
    "Desember": "",
    "Januari": "",
    "Februari": "",
    "Maret": "",
    "April": "",
    "Mei": "",
    "Juni": "",
    "PERLENGKAPAN": 500000,
    "PERALATAN": 250000,
    "KEGIATAN": 0,
    "PEMBANGUNAN": 500000,
    "UJIAN": 0,
    "LAINNYA": 0,
    "NO. TELPON": "081234567890"
  },
  {
    "NO": 2,
    "NAMA": "Aisyah Humaira",
    "JK": "P",
    "STATUS": "Yatim",
    "NO REKENING": "202607002",
    "JENJANG": "SMA IT",
    "KELAS": "X IPA",
    "SPP": 0,
    "Juli": "Free",
    "Agustus": "Free",
    "September": "Free",
    "Oktober": "Free",
    "November": "Free",
    "Desember": "Free",
    "Januari": "Free",
    "Februari": "Free",
    "Maret": "Free",
    "April": "Free",
    "Mei": "Free",
    "Juni": "Free",
    "PERLENGKAPAN": 500000,
    "PERALATAN": 250000,
    "KEGIATAN": 300000,
    "PEMBANGUNAN": 0,
    "UJIAN": 0,
    "LAINNYA": 0,
    "NO. TELPON": "081298765432"
  },
  {
    "NO": 3,
    "NAMA": "Umar Al-Faruq",
    "JK": "L",
    "STATUS": "Mampu",
    "NO REKENING": "202607003",
    "JENJANG": "SMP IT",
    "KELAS": "VIII B",
    "SPP": 1250000,
    "Juli": "2026-07-20",
    "Agustus": "",
    "September": "",
    "Oktober": "",
    "November": "",
    "Desember": "",
    "Januari": "",
    "Februari": "",
    "Maret": "",
    "April": "",
    "Mei": "",
    "Juni": "",
    "PERLENGKAPAN": 0,
    "PERALATAN": 0,
    "KEGIATAN": 300000,
    "PEMBANGUNAN": 0,
    "UJIAN": 0,
    "LAINNYA": 0,
    "NO. TELPON": "085612345678"
  }
];

// Sheet 3: PETUNJUK
const petunjukData = [
  { "KOLOM": "SHEET TAGIHAN", "PENJELASAN": "Berisi data master siswa dan besaran kewajiban tagihan" },
  { "KOLOM": "NO", "PENJELASAN": "Nomor urut siswa" },
  { "KOLOM": "NAMA", "PENJELASAN": "Nama lengkap siswa (Wajib diisi)" },
  { "KOLOM": "JK", "PENJELASAN": "Jenis kelamin: L (Laki-laki) atau P (Perempuan)" },
  { "KOLOM": "STATUS", "PENJELASAN": "Kategori administrasi: Mampu, Yatim, Dhuafa, Beasiswa, atau Rekomendasi" },
  { "KOLOM": "NO TELPON", "PENJELASAN": "Nomor WhatsApp / telepon aktif orang tua / siswa" },
  { "KOLOM": "NO REKENING / NIS", "PENJELASAN": "Nomor Induk Siswa atau nomor virtual account/rekening siswa" },
  { "KOLOM": "JENJANG", "PENJELASAN": "Jenjang pendidikan: TK IT, SD IT, SMP IT, atau SMA IT" },
  { "KOLOM": "KELAS", "PENJELASAN": "Kelas siswa, contoh: VII, VIII, IX, X, XI, XII" },
  { "KOLOM": "SPP", "PENJELASAN": "Nominal tagihan SPP per bulan (contoh: 1335000). Jika gratis isi 0." },
  { "KOLOM": "PERLENGKAPAN, dsb", "PENJELASAN": "Nominal total tagihan non-SPP yang harus dibayar siswa pada tahun ajaran ini." },
  { "KOLOM": "---", "PENJELASAN": "------------------------------------------------------------" },
  { "KOLOM": "SHEET PEMBAYARAN", "PENJELASAN": "Berisi riwayat tanggal pembayaran SPP per bulan dan total nominal tagihan non-SPP yang sudah dibayar" },
  { "KOLOM": "Kolom Juli - Juni", "PENJELASAN": "Isi dengan TANGGAL pembayaran (contoh: 2026-07-25 atau 25/07/2026). Jika gratis isi 'Free'. Jika belum bayar, KOSONGKAN." },
  { "KOLOM": "Kolom Non-SPP (Perlengkapan, dll)", "PENJELASAN": "Isi dengan NOMINAL akumulasi yang sudah dibayarkan oleh siswa untuk kategori tersebut." }
];

const wb = XLSX.utils.book_new();

const wsTagihan = XLSX.utils.json_to_sheet(tagihanData);
const wsPembayaran = XLSX.utils.json_to_sheet(pembayaranData);
const wsPetunjuk = XLSX.utils.json_to_sheet(petunjukData);

XLSX.utils.book_append_sheet(wb, wsTagihan, 'TAGIHAN');
XLSX.utils.book_append_sheet(wb, wsPembayaran, 'PEMBAYARAN');
XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'PETUNJUK PENGISIAN');

const outPath = path.resolve('public/Template_Format_Database_Administrasi.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Template created at:', outPath);
