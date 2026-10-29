const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const SPP_MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

function excelSerialToDateStr(serial, fallbackYear, monthIndex) {
  if (typeof serial === 'number' && serial > 10000) {
    const d = XLSX.SSF.parse_date_code(serial);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  // Fallback
  const m = ((monthIndex + 6) % 12) + 1; // Juli is month 7
  const y = monthIndex < 6 ? fallbackYear : fallbackYear + 1;
  return `${y}-${String(m).padStart(2, '0')}-15`;
}

function generateRandomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function restore() {
  console.log('=== MEMULAI RESTORASI DATA ABDUL MUZIZ ===\n');

  // 1. Fetch categories
  const { data: catList } = await sb.from('billing_categories').select('*');
  const catMap = new Map();
  catList.forEach(c => catMap.set(c.name.toLowerCase(), c.id));

  // 2. Insert Student
  console.log('1. Memulihkan identitas siswa Abdul Muziz...');
  const { data: student, error: stdErr } = await sb.from('students').insert({
    nis: '00110100100',
    full_name: 'Abdul Muziz',
    gender: 'Laki-laki',
    phone: '6285721248015',
    student_status: 'aktif',
    notes: 'Dipulihkan otomatis setelah penghapusan tidak sengaja'
  }).select().single();

  if (stdErr) {
    console.error('Gagal memasukkan siswa:', stdErr);
    process.exit(1);
  }
  console.log('Siswa berhasil dibuat dengan ID:', student.id);

  // ----------------------------------------------------
  // 3. TAHUN AJARAN 2024/2025
  // ----------------------------------------------------
  console.log('\n2. Memulihkan data Tahun Ajaran 2024/2025 (Kelas X.3)...');
  const ay2024Id = '7e37da2f-eb8a-4d4a-abfe-540b0d0aa0b1';

  // Enrollment 2024/2025
  await sb.from('student_enrollments').insert({
    student_id: student.id,
    academic_year_id: ay2024Id,
    unit: 'SMA IT',
    grade: 'X.3',
    administrative_status: 'Mampu'
  });

  // Bills 2024/2025
  // SPP: 12 months @ 1,350,000
  // Perlengkapan: 3,100,000
  // Peralatan: 2,300,000
  // Kegiatan: 1,980,000
  // Pembangunan: 5,000,000
  const bills2024 = [];
  for (const m of SPP_MONTHS) {
    bills2024.push({
      student_id: student.id,
      academic_year_id: ay2024Id,
      category_id: catMap.get('spp'),
      billing_period: m,
      amount: 1350000,
      status: 'Lunas',
      description: `SPP Bulan ${m}`
    });
  }
  bills2024.push({
    student_id: student.id,
    academic_year_id: ay2024Id,
    category_id: catMap.get('perlengkapan'),
    billing_period: null,
    amount: 3100000,
    status: 'Lunas',
    description: 'Tagihan Perlengkapan'
  });
  bills2024.push({
    student_id: student.id,
    academic_year_id: ay2024Id,
    category_id: catMap.get('peralatan'),
    billing_period: null,
    amount: 2300000,
    status: 'Lunas',
    description: 'Tagihan Peralatan'
  });
  bills2024.push({
    student_id: student.id,
    academic_year_id: ay2024Id,
    category_id: catMap.get('kegiatan'),
    billing_period: null,
    amount: 1980000,
    status: 'Lunas',
    description: 'Tagihan Kegiatan'
  });
  bills2024.push({
    student_id: student.id,
    academic_year_id: ay2024Id,
    category_id: catMap.get('pembangunan'),
    billing_period: null,
    amount: 5000000,
    status: 'Lunas',
    description: 'Tagihan Pembangunan'
  });

  const { data: createdBills2024 } = await sb.from('bills').insert(bills2024).select();
  console.log(`Berhasil membuat ${createdBills2024.length} tagihan 2024/2025.`);

  // Dates for 2024/2025 from Excel PEMBAYARAN:
  // [45474, 45505, 45536, 45583, 45598, 45643, 45674, 45708, 45759, 45768, 45794, 45826]
  const sppSerials2024 = [45474, 45505, 45536, 45583, 45598, 45643, 45674, 45708, 45759, 45768, 45794, 45826];
  for (let idx = 0; idx < SPP_MONTHS.length; idx++) {
    const month = SPP_MONTHS[idx];
    const bill = createdBills2024.find(b => b.category_id === catMap.get('spp') && b.billing_period === month);
    const dateStr = excelSerialToDateStr(sppSerials2024[idx], 2024, idx);
    const dateCompact = dateStr.replace(/-/g, '');
    const trx = `TRX-${dateCompact}-SPP-${generateRandomCode()}`;

    const { data: pmt } = await sb.from('payments').insert({
      transaction_number: trx,
      student_id: student.id,
      payment_date: dateStr,
      amount: 1350000,
      payment_method: 'Import Excel',
      notes: `Pembayaran SPP ${month} via Import Excel`,
      created_by: 'Import Excel',
      status: 'valid'
    }).select().single();

    await sb.from('payment_allocations').insert({
      payment_id: pmt.id,
      bill_id: bill.id,
      allocated_amount: 1350000
    });
  }

  // Non-SPP payments 2024/2025:
  const nonSpp2024 = [
    { catKey: 'perlengkapan', amount: 3100000, name: 'Perlengkapan' },
    { catKey: 'peralatan', amount: 2300000, name: 'Peralatan' },
    { catKey: 'kegiatan', amount: 1980000, name: 'Kegiatan' },
    { catKey: 'pembangunan', amount: 5000000, name: 'Pembangunan' },
  ];
  for (const item of nonSpp2024) {
    const bill = createdBills2024.find(b => b.category_id === catMap.get(item.catKey));
    const trx = `TRX-20240715-${item.name.substring(0, 3).toUpperCase()}-${generateRandomCode()}`;
    const { data: pmt } = await sb.from('payments').insert({
      transaction_number: trx,
      student_id: student.id,
      payment_date: '2024-07-15',
      amount: item.amount,
      payment_method: 'Import Excel',
      notes: `Pembayaran ${item.name} via Import Excel`,
      created_by: 'Import Excel',
      status: 'valid'
    }).select().single();

    await sb.from('payment_allocations').insert({
      payment_id: pmt.id,
      bill_id: bill.id,
      allocated_amount: item.amount
    });
  }
  console.log('Semua pembayaran & alokasi 2024/2025 berhasil dipulihkan.');

  // ----------------------------------------------------
  // 4. TAHUN AJARAN 2025/2026
  // ----------------------------------------------------
  console.log('\n3. Memulihkan data Tahun Ajaran 2025/2026 (Kelas XI.3)...');
  const ay2025Id = 'c8424f3e-2cff-4009-bd53-e65b28c94fde';

  // Enrollment 2025/2026
  await sb.from('student_enrollments').insert({
    student_id: student.id,
    academic_year_id: ay2025Id,
    unit: 'SMA IT',
    grade: 'XI.3',
    administrative_status: 'Mampu'
  });

  // Bills 2025/2026:
  // SPP: 12 months @ 1,350,000
  // Peralatan: 1,745,000
  // Kegiatan: 1,980,000
  const bills2025 = [];
  for (const m of SPP_MONTHS) {
    bills2025.push({
      student_id: student.id,
      academic_year_id: ay2025Id,
      category_id: catMap.get('spp'),
      billing_period: m,
      amount: 1350000,
      status: 'Lunas',
      description: `SPP Bulan ${m}`
    });
  }
  bills2025.push({
    student_id: student.id,
    academic_year_id: ay2025Id,
    category_id: catMap.get('peralatan'),
    billing_period: null,
    amount: 1745000,
    status: 'Lunas',
    description: 'Tagihan Peralatan'
  });
  bills2025.push({
    student_id: student.id,
    academic_year_id: ay2025Id,
    category_id: catMap.get('kegiatan'),
    billing_period: null,
    amount: 1980000,
    status: 'Lunas',
    description: 'Tagihan Kegiatan'
  });

  const { data: createdBills2025 } = await sb.from('bills').insert(bills2025).select();
  console.log(`Berhasil membuat ${createdBills2025.length} tagihan 2025/2026.`);

  // Dates for 2025/2026:
  // [45878, 45902, 45938, 45947, 45982, 46016, 46051, 46304, 46108, 46175, 46175, 46304]
  const sppSerials2025 = [45878, 45902, 45938, 45947, 45982, 46016, 46051, 46304, 46108, 46175, 46175, 46304];
  for (let idx = 0; idx < SPP_MONTHS.length; idx++) {
    const month = SPP_MONTHS[idx];
    const bill = createdBills2025.find(b => b.category_id === catMap.get('spp') && b.billing_period === month);
    const dateStr = excelSerialToDateStr(sppSerials2025[idx], 2025, idx);
    const dateCompact = dateStr.replace(/-/g, '');
    const trx = `TRX-${dateCompact}-SPP-${generateRandomCode()}`;

    const { data: pmt } = await sb.from('payments').insert({
      transaction_number: trx,
      student_id: student.id,
      payment_date: dateStr,
      amount: 1350000,
      payment_method: 'Import Excel',
      notes: `Pembayaran SPP ${month} via Import Excel`,
      created_by: 'Import Excel',
      status: 'valid'
    }).select().single();

    await sb.from('payment_allocations').insert({
      payment_id: pmt.id,
      bill_id: bill.id,
      allocated_amount: 1350000
    });
  }

  // Non-SPP payments 2025/2026:
  const nonSpp2025 = [
    { catKey: 'peralatan', amount: 1745000, name: 'Peralatan' },
    { catKey: 'kegiatan', amount: 1980000, name: 'Kegiatan' },
  ];
  for (const item of nonSpp2025) {
    const bill = createdBills2025.find(b => b.category_id === catMap.get(item.catKey));
    const trx = `TRX-20250715-${item.name.substring(0, 3).toUpperCase()}-${generateRandomCode()}`;
    const { data: pmt } = await sb.from('payments').insert({
      transaction_number: trx,
      student_id: student.id,
      payment_date: '2025-07-15',
      amount: item.amount,
      payment_method: 'Import Excel',
      notes: `Pembayaran ${item.name} via Import Excel`,
      created_by: 'Import Excel',
      status: 'valid'
    }).select().single();

    await sb.from('payment_allocations').insert({
      payment_id: pmt.id,
      bill_id: bill.id,
      allocated_amount: item.amount
    });
  }
  console.log('Semua pembayaran & alokasi 2025/2026 berhasil dipulihkan.');

  // ----------------------------------------------------
  // 5. TAHUN AJARAN 2026/2027 (Aktif)
  // ----------------------------------------------------
  console.log('\n4. Memulihkan data Tahun Ajaran 2026/2027 (Kelas XII SMA IT)...');
  const ay2026Id = '9a798c1f-7deb-4b6d-b94e-56a83a9fe6f7';

  // Enrollment 2026/2027
  await sb.from('student_enrollments').insert({
    student_id: student.id,
    academic_year_id: ay2026Id,
    unit: 'SMA IT',
    grade: 'XII',
    administrative_status: 'Mampu'
  });

  // Bills 2026/2027
  // SPP Juli: Lunas (1,375,000)
  // SPP Agustus: Lunas (1,375,000)
  // SPP September: Belum Dibayar (1,375,000)
  // SPP Oktober: Belum Dibayar (1,375,000)
  // SPP November - Juni: Belum Dibayar (1,375,000)
  // Peralatan: 1,865,000 (Lunas)
  // Kegiatan: 1,980,000 (Belum Lunas - Dibayar 760,000)
  const bills2026 = [];
  for (const m of SPP_MONTHS) {
    let bStatus = 'Belum Dibayar';
    if (m === 'Juli' || m === 'Agustus') {
      bStatus = 'Lunas';
    }
    bills2026.push({
      student_id: student.id,
      academic_year_id: ay2026Id,
      category_id: catMap.get('spp'),
      billing_period: m,
      amount: 1375000,
      status: bStatus,
      description: `SPP Bulan ${m}`
    });
  }
  bills2026.push({
    student_id: student.id,
    academic_year_id: ay2026Id,
    category_id: catMap.get('peralatan'),
    billing_period: null,
    amount: 1865000,
    status: 'Lunas',
    description: 'Tagihan Peralatan'
  });
  bills2026.push({
    student_id: student.id,
    academic_year_id: ay2026Id,
    category_id: catMap.get('kegiatan'),
    billing_period: null,
    amount: 1980000,
    status: 'Belum Lunas',
    description: 'Tagihan Kegiatan'
  });

  const { data: createdBills2026 } = await sb.from('bills').insert(bills2026).select();
  console.log(`Berhasil membuat ${createdBills2026.length} tagihan 2026/2027.`);

  // 4 Payments 2026/2027 from initialExcelData:
  // pmt-001740: TRX-20261009-SPP-1741, 1375000, SPP Juli
  // pmt-001741: TRX-20261009-SPP-1742, 1375000, SPP Agustus
  // pmt-001742: TRX-20260801-PER-1743, 1865000, Peralatan
  // pmt-001743: TRX-20260801-KEG-1744, 760000, Kegiatan

  const billSppJuli = createdBills2026.find(b => b.category_id === catMap.get('spp') && b.billing_period === 'Juli');
  const billSppAgustus = createdBills2026.find(b => b.category_id === catMap.get('spp') && b.billing_period === 'Agustus');
  const billPeralatan = createdBills2026.find(b => b.category_id === catMap.get('peralatan'));
  const billKegiatan = createdBills2026.find(b => b.category_id === catMap.get('kegiatan'));

  const payments2026Data = [
    {
      trx: 'TRX-20261009-SPP-1741',
      date: '2026-10-09',
      amount: 1375000,
      notes: 'SPP Juli',
      billId: billSppJuli.id,
      allocAmount: 1375000
    },
    {
      trx: 'TRX-20261009-SPP-1742',
      date: '2026-10-09',
      amount: 1375000,
      notes: 'SPP Agustus',
      billId: billSppAgustus.id,
      allocAmount: 1375000
    },
    {
      trx: 'TRX-20260801-PER-1743',
      date: '2026-08-01',
      amount: 1865000,
      notes: 'Pembayaran Peralatan',
      billId: billPeralatan.id,
      allocAmount: 1865000
    },
    {
      trx: 'TRX-20260801-KEG-1744',
      date: '2026-08-01',
      amount: 760000,
      notes: 'Pembayaran Kegiatan',
      billId: billKegiatan.id,
      allocAmount: 760000
    }
  ];

  for (const p of payments2026Data) {
    const { data: pmt } = await sb.from('payments').insert({
      transaction_number: p.trx,
      student_id: student.id,
      payment_date: p.date,
      amount: p.amount,
      payment_method: 'Tunai',
      notes: p.notes,
      created_by: 'Excel Acuan',
      status: 'valid'
    }).select().single();

    await sb.from('payment_allocations').insert({
      payment_id: pmt.id,
      bill_id: p.billId,
      allocated_amount: p.allocAmount
    });
  }
  console.log('Semua pembayaran & alokasi 2026/2027 berhasil dipulihkan.');

  console.log('\n=== RESTORASI SELESAI DENGAN SUKSES! ===');
}

restore().catch(err => {
  console.error('Error saat restorasi:', err);
});
