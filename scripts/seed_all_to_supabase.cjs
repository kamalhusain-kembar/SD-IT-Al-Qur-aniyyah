const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const dump = JSON.parse(fs.readFileSync('src/data/initialExcelData.json', 'utf8'));

async function main() {
  console.log('=== SEEDING FULL DATABASE TO SUPABASE ===');

  // 1. Academic Year
  const ayId = '9a798c1f-7deb-4b6d-b94e-56a83a9fe6f7';
  console.log('Using Academic Year ID:', ayId);

  // 2. Billing Categories map
  const { data: catList } = await sb.from('billing_categories').select('id, name');
  const catMap = new Map();
  catList.forEach(c => catMap.set(c.name.toLowerCase(), c.id));
  console.log('Billing categories available:', Array.from(catMap.keys()));

  // 3. Check existing students
  const { data: existingStudents } = await sb.from('students').select('id, full_name, nis');
  const studentMap = new Map(); // name.toLowerCase() -> id
  (existingStudents || []).forEach(s => {
    studentMap.set(s.full_name.trim().toLowerCase(), s.id);
  });
  console.log('Existing students in DB:', studentMap.size);

  // 4. Insert remaining students in batches of 100
  const studentsToInsert = [];
  const dumpStudentOldIdToName = new Map();
  dump.students.forEach(s => {
    dumpStudentOldIdToName.set(s.id, s.full_name.trim().toLowerCase());
    if (!studentMap.has(s.full_name.trim().toLowerCase())) {
      studentsToInsert.push({
        full_name: s.full_name.trim(),
        nis: s.nis || null,
        gender: s.gender || 'Laki-laki',
        phone: s.phone || null,
        student_status: s.student_status || 'aktif'
      });
    }
  });

  console.log('Students to insert:', studentsToInsert.length);
  for (let i = 0; i < studentsToInsert.length; i += 100) {
    const batch = studentsToInsert.slice(i, i + 100);
    const { data: created, error } = await sb.from('students').insert(batch).select('id, full_name');
    if (error) {
      console.error('Error inserting students batch:', error);
      throw error;
    }
    (created || []).forEach(s => studentMap.set(s.full_name.trim().toLowerCase(), s.id));
    console.log(`Inserted ${Math.min(i + 100, studentsToInsert.length)}/${studentsToInsert.length} students`);
  }

  console.log('Total students now mapped in DB:', studentMap.size);

  // Map dump student id -> real supabase student uuid
  const oldIdToUuid = new Map();
  dump.students.forEach(s => {
    const uuid = studentMap.get(s.full_name.trim().toLowerCase());
    if (uuid) {
      oldIdToUuid.set(s.id, uuid);
    }
  });
  console.log('Mapped dump student IDs:', oldIdToUuid.size);

  // 5. Insert Student Enrollments
  const { data: existingEnr } = await sb.from('student_enrollments').select('student_id').eq('academic_year_id', ayId);
  const enrolledStudentIds = new Set((existingEnr || []).map(e => e.student_id));

  const enrollmentsToInsert = [];
  dump.enrollments.forEach(e => {
    const realStudentId = oldIdToUuid.get(e.student_id);
    if (realStudentId && !enrolledStudentIds.has(realStudentId)) {
      enrollmentsToInsert.push({
        student_id: realStudentId,
        academic_year_id: ayId,
        unit: e.unit,
        grade: e.grade,
        administrative_status: e.administrative_status,
        notes: e.notes || null
      });
      enrolledStudentIds.add(realStudentId);
    }
  });

  console.log('Enrollments to insert:', enrollmentsToInsert.length);
  for (let i = 0; i < enrollmentsToInsert.length; i += 100) {
    const batch = enrollmentsToInsert.slice(i, i + 100);
    const { error } = await sb.from('student_enrollments').insert(batch);
    if (error) {
      console.error('Error inserting enrollments batch:', error);
      throw error;
    }
    console.log(`Inserted ${Math.min(i + 100, enrollmentsToInsert.length)}/${enrollmentsToInsert.length} enrollments`);
  }

  // 6. Bills
  // Map old bill category id to real category id
  const oldCatMap = {
    'cat-spp': catMap.get('spp'),
    'cat-perlengkapan': catMap.get('perlengkapan'),
    'cat-peralatan': catMap.get('peralatan'),
    'cat-kegiatan': catMap.get('kegiatan'),
    'cat-pembangunan': catMap.get('pembangunan'),
    'cat-ujian': catMap.get('ujian'),
    'cat-buku': catMap.get('buku paket') || catMap.get('lainnya'),
    'cat-lainnya': catMap.get('lainnya')
  };

  const { data: existingBills } = await sb.from('bills').select('id, student_id, category_id, billing_period').eq('academic_year_id', ayId);
  const billLookup = new Map(); // `${student_id}_${category_id}_${billing_period || ''}` -> id
  (existingBills || []).forEach(b => {
    billLookup.set(`${b.student_id}_${b.category_id}_${b.billing_period || ''}`, b.id);
  });
  console.log('Existing bills in DB:', billLookup.size);

  const billsToInsert = [];
  const dumpBillIdToInsertKey = new Map();

  dump.bills.forEach(b => {
    const realStudentId = oldIdToUuid.get(b.student_id);
    const realCatId = oldCatMap[b.category_id] || catMap.get('spp');
    if (!realStudentId || !realCatId) return;

    const key = `${realStudentId}_${realCatId}_${b.billing_period || ''}`;
    dumpBillIdToInsertKey.set(b.id, key);

    if (!billLookup.has(key)) {
      let dbStatus = b.status;
      if (dbStatus === 'Akan Berlangsung' || !['Belum Dibayar', 'Belum Lunas', 'Lunas', 'Bebas'].includes(dbStatus)) {
        dbStatus = 'Belum Dibayar';
      }

      billsToInsert.push({
        student_id: realStudentId,
        academic_year_id: ayId,
        category_id: realCatId,
        billing_period: b.billing_period || null,
        amount: b.amount,
        status: dbStatus,
        description: b.description || null
      });
      billLookup.set(key, 'PENDING'); // mark so we don't duplicate
    }
  });

  console.log('Bills to insert:', billsToInsert.length);
  for (let i = 0; i < billsToInsert.length; i += 200) {
    const batch = billsToInsert.slice(i, i + 200);
    const { data: created, error } = await sb.from('bills').insert(batch).select('id, student_id, category_id, billing_period');
    if (error) {
      console.error('Error inserting bills batch:', error);
      throw error;
    }
    (created || []).forEach(b => {
      billLookup.set(`${b.student_id}_${b.category_id}_${b.billing_period || ''}`, b.id);
    });
    console.log(`Inserted ${Math.min(i + 200, billsToInsert.length)}/${billsToInsert.length} bills`);
  }

  // Refresh bill lookup map with exact IDs
  const { data: allBills } = await sb.from('bills').select('id, student_id, category_id, billing_period').eq('academic_year_id', ayId);
  allBills.forEach(b => {
    billLookup.set(`${b.student_id}_${b.category_id}_${b.billing_period || ''}`, b.id);
  });
  console.log('Total bills in DB now:', allBills.length);

  // Map old bill ID -> real bill uuid
  const oldBillIdToUuid = new Map();
  dump.bills.forEach(b => {
    const realStudentId = oldIdToUuid.get(b.student_id);
    const realCatId = oldCatMap[b.category_id] || catMap.get('spp');
    if (realStudentId && realCatId) {
      const key = `${realStudentId}_${realCatId}_${b.billing_period || ''}`;
      const uuid = billLookup.get(key);
      if (uuid) {
        oldBillIdToUuid.set(b.id, uuid);
      }
    }
  });
  console.log('Mapped dump bill IDs:', oldBillIdToUuid.size);

  // 7. Payments & Allocations
  const { data: existingPayments } = await sb.from('payments').select('id, transaction_number');
  const existingTrxSet = new Set((existingPayments || []).map(p => p.transaction_number));
  console.log('Existing payments in DB:', existingTrxSet.size);

  const paymentsToInsert = [];
  const oldPaymentIdToTemp = new Map();

  dump.payments.forEach(p => {
    const realStudentId = oldIdToUuid.get(p.student_id);
    if (!realStudentId) return;

    if (!existingTrxSet.has(p.transaction_number)) {
      paymentsToInsert.push({
        transaction_number: p.transaction_number,
        student_id: realStudentId,
        payment_date: p.payment_date,
        amount: p.amount,
        payment_method: p.payment_method || 'Tunai',
        notes: p.notes || null,
        created_by: p.created_by || 'Bendahara',
        status: p.status || 'valid'
      });
    }
  });

  console.log('Payments to insert:', paymentsToInsert.length);
  const oldPaymentTrxToUuid = new Map();
  for (let i = 0; i < paymentsToInsert.length; i += 200) {
    const batch = paymentsToInsert.slice(i, i + 200);
    const { data: created, error } = await sb.from('payments').insert(batch).select('id, transaction_number');
    if (error) {
      console.error('Error inserting payments batch:', error);
      throw error;
    }
    (created || []).forEach(p => oldPaymentTrxToUuid.set(p.transaction_number, p.id));
    console.log(`Inserted ${Math.min(i + 200, paymentsToInsert.length)}/${paymentsToInsert.length} payments`);
  }

  // Fetch all payments to have a complete trx -> uuid map
  const { data: allPayments } = await sb.from('payments').select('id, transaction_number');
  (allPayments || []).forEach(p => oldPaymentTrxToUuid.set(p.transaction_number, p.id));

  // Map old payment id -> real uuid
  const oldPaymentIdToUuid = new Map();
  dump.payments.forEach(p => {
    const uuid = oldPaymentTrxToUuid.get(p.transaction_number);
    if (uuid) {
      oldPaymentIdToUuid.set(p.id, uuid);
    }
  });

  // 8. Payment Allocations
  const { data: existingAllocations } = await sb.from('payment_allocations').select('payment_id, bill_id');
  const existingAllocSet = new Set((existingAllocations || []).map(a => `${a.payment_id}_${a.bill_id}`));

  const allocationsToInsert = [];
  dump.payment_allocations.forEach(a => {
    const realPaymentId = oldPaymentIdToUuid.get(a.payment_id);
    const realBillId = oldBillIdToUuid.get(a.bill_id);
    if (realPaymentId && realBillId) {
      const key = `${realPaymentId}_${realBillId}`;
      if (!existingAllocSet.has(key)) {
        allocationsToInsert.push({
          payment_id: realPaymentId,
          bill_id: realBillId,
          allocated_amount: a.allocated_amount
        });
        existingAllocSet.add(key);
      }
    }
  });

  console.log('Allocations to insert:', allocationsToInsert.length);
  for (let i = 0; i < allocationsToInsert.length; i += 200) {
    const batch = allocationsToInsert.slice(i, i + 200);
    const { error } = await sb.from('payment_allocations').insert(batch);
    if (error) {
      console.error('Error inserting allocations batch:', error);
      throw error;
    }
    console.log(`Inserted ${Math.min(i + 200, allocationsToInsert.length)}/${allocationsToInsert.length} allocations`);
  }

  console.log('=== FULL SEED COMPLETED SUCCESSFULLY! ===');
}

main().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
