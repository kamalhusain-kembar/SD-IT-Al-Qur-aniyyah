const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const AY_ID = '9a798c1f-7deb-4b6d-b94e-56a83a9fe6f7';
const SPP_MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function run() {
  console.log('=== MEMULAI IMPORT DATA PEMBAYARAN DARI UPDATE.XLSX KE SUPABASE ===');

  // 1. Fetch SPP Category
  const { data: cats } = await sb.from('billing_categories').select('id, name').ilike('name', '%spp%').limit(1);
  const sppCatId = cats[0].id;

  // 2. Fetch Students
  const { data: students } = await sb.from('students').select('id, full_name');
  const studentMap = new Map();
  students.forEach(s => studentMap.set(normalizeName(s.full_name), s));

  // 3. Read Excel
  const filePath = 'C:/Users/Nasrullah/Downloads/Update.xlsx';
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Total baris Excel:', rows.length - 1);

  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawName = r[3];
    if (!rawName) continue;

    const student = studentMap.get(normalizeName(rawName));
    if (!student) {
      console.warn(`Siswa tidak ditemukan: ${rawName}`);
      failCount++;
      continue;
    }

    // Determine month
    const rincian = String(r[20] || 'SPP OKTOBER').toLowerCase();
    let month = 'Oktober';
    for (const m of SPP_MONTHS) {
      if (rincian.includes(m.toLowerCase())) {
        month = m;
        break;
      }
    }

    // Determine date
    let dateStr = '2026-10-15';
    const cellDate = r[0];
    if (typeof cellDate === 'number' && cellDate > 10000) {
      const d = XLSX.SSF.parse_date_code(cellDate);
      dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    } else if (cellDate instanceof Date) {
      dateStr = cellDate.toISOString().split('T')[0];
    } else if (typeof cellDate === 'string' && cellDate.length >= 8) {
      dateStr = cellDate.split(' ')[0].replace(/\//g, '-');
    }

    // Determine amount
    const rawNominal = r[6] || r[11] || 1335000;
    const amount = Number(rawNominal) || 1335000;

    const ref = r[7] || r[8] || `BSI-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const channel = r[5] || 'Bank Syariah Indonesia';

    try {
      // Find or create bill
      let billId;
      let billAmount = amount;
      const { data: existingBill } = await sb.from('bills')
        .select('id, amount, status')
        .eq('student_id', student.id)
        .eq('academic_year_id', AY_ID)
        .eq('category_id', sppCatId)
        .eq('billing_period', month)
        .maybeSingle();

      if (existingBill) {
        billId = existingBill.id;
        billAmount = Number(existingBill.amount);
      } else {
        const { data: newBill, error: bErr } = await sb.from('bills').insert([{
          student_id: student.id,
          academic_year_id: AY_ID,
          category_id: sppCatId,
          billing_period: month,
          amount: billAmount,
          status: 'Belum Dibayar',
          description: `SPP Bulan ${month}`
        }]).select().single();
        if (bErr) throw bErr;
        billId = newBill.id;
      }

      // Clear old allocs for this bill
      const { data: existingAllocs } = await sb.from('payment_allocations').select('id, payment_id').eq('bill_id', billId);
      if (existingAllocs && existingAllocs.length > 0) {
        const pmtIds = existingAllocs.map(a => a.payment_id);
        await sb.from('payment_allocations').delete().eq('bill_id', billId);
        await sb.from('payments').delete().in('id', pmtIds);
      }

      // Create Payment
      const datePart = dateStr.replace(/-/g, '');
      const trxNum = `TRX-${datePart}-${String(ref).substring(0, 10).toUpperCase()}`;

      const { data: pmt, error: pErr } = await sb.from('payments').insert([{
        transaction_number: trxNum,
        student_id: student.id,
        payment_date: dateStr,
        amount: amount,
        payment_method: channel,
        notes: `Pembayaran ${month} via BSI (${ref})`,
        created_by: 'Import Bank BSI',
        status: 'valid'
      }]).select().single();

      if (pErr) throw pErr;

      // Create Allocation
      await sb.from('payment_allocations').insert([{
        payment_id: pmt.id,
        bill_id: billId,
        allocated_amount: amount
      }]);

      // Update bill
      const finalStatus = amount >= billAmount ? 'Lunas' : 'Belum Lunas';
      await sb.from('bills').update({
        status: finalStatus,
        updated_at: new Date().toISOString()
      }).eq('id', billId);

      successCount++;
      if (successCount % 20 === 0 || successCount === rows.length - 1) {
        console.log(`Berhasil menerapkan: ${successCount}/${rows.length - 1} pembayaran...`);
      }
    } catch (err) {
      console.error(`Gagal import siswa ${student.full_name} (${month}):`, err.message);
      failCount++;
    }
  }

  console.log(`\n=== HASIL IMPORT ===`);
  console.log(`Sukses: ${successCount}`);
  console.log(`Gagal : ${failCount}`);
}

run();
