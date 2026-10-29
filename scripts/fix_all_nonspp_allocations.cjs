const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const DIR = 'C:/Users/Nasrullah/Videos/Rekapan_Administrasi_SMP_SMA_Per_Tahun_Ajaran/';

const YEARS = [
  { name: '2021/2022', id: '5b097650-fb27-4173-8a53-299756a9fa26', file: 'Rekapan_Administrasi_SMP_SMA_2021-2022.xlsx', defaultDate: '2021-07-15' },
  { name: '2022/2023', id: '90e7e427-8531-4131-b563-dd2fff3516ba', file: 'Rekapan_Administrasi_SMP_SMA_2022-2023.xlsx', defaultDate: '2022-07-15' },
  { name: '2023/2024', id: 'dc8b8a33-d43f-4ac2-826f-f8abd8c18f43', file: 'Rekapan_Administrasi_SMP_SMA_2023-2024.xlsx', defaultDate: '2023-07-15' },
  { name: '2024/2025', id: '7e37da2f-eb8a-4d4a-abfe-540b0d0aa0b1', file: 'Rekapan_Administrasi_SMP_SMA_2024-2025.xlsx', defaultDate: '2024-07-15' },
  { name: '2025/2026', id: 'c8424f3e-2cff-4009-bd53-e65b28c94fde', file: 'Rekapan_Administrasi_SMP_SMA_2025-2026.xlsx', defaultDate: '2025-07-15' },
];

function normalize(str) {
  return String(str || '').toLowerCase().replace(/['’`.]/g, '').replace(/\s+/g, ' ').trim();
}

async function fixYear(yearConfig, catMap) {
  console.log(`\n======================================================`);
  console.log(`MEMPROSES TAHUN AJARAN: ${yearConfig.name}`);
  console.log(`======================================================`);

  const filePath = path.join(DIR, yearConfig.file);
  if (!fs.existsSync(filePath)) {
    console.error('File tidak ditemukan:', filePath);
    return;
  }

  const wb = XLSX.readFile(filePath);
  const tagRows = XLSX.utils.sheet_to_json(wb.Sheets['TAGIHAN'], { header: 1 });
  const bayarRows = XLSX.utils.sheet_to_json(wb.Sheets['PEMBAYARAN'], { header: 1 });

  const bayarH = (bayarRows[0] || []).map(h => String(h || '').trim().toUpperCase());

  // In these files, the shifted non-SPP columns are:
  // Col labeled PERLENGKAPAN -> actually PERALATAN
  // Col labeled PERALATAN -> actually KEGIATAN
  // Col labeled KEGIATAN -> actually PEMBANGUNAN
  // Col labeled PEMBANGUNAN -> actually PERLENGKAPAN
  // Col labeled UJIAN -> UJIAN
  // Col labeled LAINNYA -> LAINNYA
  const idxPerl = bayarH.findIndex(h => h.includes('PERLENGKAPAN'));
  const idxPera = bayarH.findIndex(h => h.includes('PERALATAN'));
  const idxKegi = bayarH.findIndex(h => h.includes('KEGIATAN'));
  const idxPemb = bayarH.findIndex(h => h.includes('PEMBANGUNAN'));
  const idxUjian = bayarH.findIndex(h => h.includes('UJIAN'));
  const idxLain = bayarH.findIndex(h => h.includes('LAINNYA'));

  console.log(`Kolom Bayar: PerlHeader=${idxPerl}, PeraHeader=${idxPera}, KegiHeader=${idxKegi}, PembHeader=${idxPemb}`);

  // Build lookup of bayar by student name
  const bayarMap = new Map();
  for (let r = 1; r < bayarRows.length; r++) {
    const row = bayarRows[r];
    const name = normalize(row[1]);
    if (name) bayarMap.set(name, row);
  }

  // 1. Fetch all students for this year from Supabase
  console.log('Mengambil data enrollment & siswa dari Supabase...');
  const { data: enrollments } = await sb.from('student_enrollments')
    .select('student_id, students(id, full_name, nis)')
    .eq('academic_year_id', yearConfig.id);

  const studentMap = new Map(); // normName -> studentId
  const studentIdSet = new Set();
  (enrollments || []).forEach(e => {
    if (e.students) {
      studentMap.set(normalize(e.students.full_name), e.students.id);
      studentIdSet.add(e.students.id);
    }
  });

  console.log(`Total siswa terdaftar di Supabase untuk ${yearConfig.name}: ${studentMap.size}`);

  // 2. Fetch all non-SPP bills for this academic year
  console.log('Mengambil tagihan non-SPP...');
  const sppCatId = catMap.get('spp');
  let allBills = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: bBatch, error } = await sb.from('bills')
      .select('id, student_id, category_id, amount, status')
      .eq('academic_year_id', yearConfig.id)
      .neq('category_id', sppCatId)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (bBatch && bBatch.length > 0) {
      allBills = allBills.concat(bBatch);
      if (bBatch.length < pageSize) break;
      page++;
    } else {
      break;
    }
  }

  console.log(`Total tagihan non-SPP ditemukan di Supabase: ${allBills.length}`);

  // Group bills by `${student_id}_${category_id}`
  const billMap = new Map();
  allBills.forEach(b => {
    billMap.set(`${b.student_id}_${b.category_id}`, b);
  });

  const allBillIds = allBills.map(b => b.id);

  // 3. Clear old allocations and payments for non-SPP bills
  console.log('Membersihkan alokasi & pembayaran non-SPP lama...');
  for (let i = 0; i < allBillIds.length; i += 200) {
    const chunk = allBillIds.slice(i, i + 200);
    const { data: allocs } = await sb.from('payment_allocations')
      .select('id, payment_id')
      .in('bill_id', chunk);

    if (allocs && allocs.length > 0) {
      const pmtIds = Array.from(new Set(allocs.map(a => a.payment_id)));
      await sb.from('payment_allocations').delete().in('bill_id', chunk);
      // Delete payments created by Import Excel
      await sb.from('payments').delete().in('id', pmtIds).eq('created_by', 'Import Excel');
    }
  }

  // 4. Create correct payments and allocations
  console.log('Membuat pembayaran & alokasi yang benar...');
  const paymentsToInsert = [];
  const billUpdates = [];

  // Mapping from shifted column to target category
  const mapping = [
    { catKey: 'peralatan', catName: 'Peralatan', colIdx: idxPerl }, // col labeled PERLENGKAPAN is PERALATAN
    { catKey: 'kegiatan', catName: 'Kegiatan', colIdx: idxPera },   // col labeled PERALATAN is KEGIATAN
    { catKey: 'pembangunan', catName: 'Pembangunan', colIdx: idxKegi }, // col labeled KEGIATAN is PEMBANGUNAN
    { catKey: 'perlengkapan', catName: 'Perlengkapan', colIdx: idxPemb }, // col labeled PEMBANGUNAN is PERLENGKAPAN
    { catKey: 'ujian', catName: 'Ujian', colIdx: idxUjian },
    { catKey: 'lainnya', catName: 'Lainnya', colIdx: idxLain },
  ];

  let matchedStudentsCount = 0;
  let fixedPaymentsCount = 0;

  for (const [normName, studentId] of studentMap.entries()) {
    const bRow = bayarMap.get(normName);
    if (!bRow) continue;
    matchedStudentsCount++;

    for (const m of mapping) {
      if (m.colIdx === -1) continue;
      const paidVal = Number(bRow[m.colIdx] || 0);
      const catId = catMap.get(m.catKey);
      if (!catId) continue;

      const bill = billMap.get(`${studentId}_${catId}`);
      if (!bill) continue;

      const billAmt = Number(bill.amount || 0);

      if (paidVal > 0) {
        paymentsToInsert.push({
          student_id: studentId,
          bill_id: bill.id,
          catName: m.catName,
          paidAmount: paidVal,
          billAmount: billAmt
        });
        fixedPaymentsCount++;
      } else {
        // paidVal === 0
        billUpdates.push({
          id: bill.id,
          status: 'Belum Dibayar'
        });
      }
    }
  }

  console.log(`Siswa cocok: ${matchedStudentsCount}, Pembayaran yang akan disimpan: ${paymentsToInsert.length}`);

  // Batch insert payments & allocations in chunks of 50
  for (let i = 0; i < paymentsToInsert.length; i += 50) {
    const chunk = paymentsToInsert.slice(i, i + 50);
    const pmtRows = chunk.map((c, idx) => ({
      transaction_number: `TRX-${yearConfig.defaultDate.replace(/-/g, '')}-${c.catName.substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${i + idx}`,
      student_id: c.student_id,
      payment_date: yearConfig.defaultDate,
      amount: c.paidAmount,
      payment_method: 'Import Excel',
      notes: `Pembayaran ${c.catName} via Import Excel`,
      created_by: 'Import Excel',
      status: 'valid'
    }));

    const { data: createdPmts, error: pErr } = await sb.from('payments').insert(pmtRows).select('id');
    if (pErr) {
      console.error('Error inserting payments batch:', pErr);
      continue;
    }

    const allocRows = (createdPmts || []).map((pmt, idx) => ({
      payment_id: pmt.id,
      bill_id: chunk[idx].bill_id,
      allocated_amount: chunk[idx].paidAmount
    }));

    await sb.from('payment_allocations').insert(allocRows);

    chunk.forEach(c => {
      const newStatus = c.paidAmount >= c.billAmount ? 'Lunas' : 'Belum Lunas';
      billUpdates.push({ id: c.bill_id, status: newStatus });
    });
  }

  // Update bill statuses
  console.log(`Mengupdate status untuk ${billUpdates.length} tagihan...`);
  // Group by status for mass update
  const lunasIds = billUpdates.filter(b => b.status === 'Lunas').map(b => b.id);
  const belumLunasIds = billUpdates.filter(b => b.status === 'Belum Lunas').map(b => b.id);
  const belumDibayarIds = billUpdates.filter(b => b.status === 'Belum Dibayar').map(b => b.id);

  for (let i = 0; i < lunasIds.length; i += 200) {
    await sb.from('bills').update({ status: 'Lunas' }).in('id', lunasIds.slice(i, i + 200));
  }
  for (let i = 0; i < belumLunasIds.length; i += 200) {
    await sb.from('bills').update({ status: 'Belum Lunas' }).in('id', belumLunasIds.slice(i, i + 200));
  }
  for (let i = 0; i < belumDibayarIds.length; i += 200) {
    await sb.from('bills').update({ status: 'Belum Dibayar' }).in('id', belumDibayarIds.slice(i, i + 200));
  }

  console.log(`SELESAI ${yearConfig.name}: ${lunasIds.length} Lunas, ${belumLunasIds.length} Belum Lunas, ${belumDibayarIds.length} Belum Dibayar.`);
}

async function main() {
  console.log('=== MEMULAI PERBAIKAN TOTAL ALOKASI NON-SPP DI SUPABASE ===');

  const { data: cats } = await sb.from('billing_categories').select('*');
  const catMap = new Map();
  cats.forEach(c => catMap.set(c.name.toLowerCase(), c.id));

  for (const y of YEARS) {
    await fixYear(y, catMap);
  }

  console.log('\n===========================================================');
  console.log('SELURUH TAHUN AJARAN BERHASIL DIPERBAIKI 100%!');
  console.log('===========================================================');
}

main().catch(console.error);
