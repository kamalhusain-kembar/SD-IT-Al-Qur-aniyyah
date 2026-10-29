import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { UnitType, AdministrativeStatus, Gender } from '../types/database';
import { SPP_MONTHS } from './billingService';

export interface ImportPreviewItem {
  no: number;
  nis: string | null;
  name: string;
  gender: Gender;
  phone: string | null;
  unit: UnitType;
  grade: string;
  status: AdministrativeStatus;
  sppNominal: number;
  isFreeSPP: boolean;
  otherBills: {
    categoryName: string;
    amount: number;
  }[];
  sppPayments: {
    month: string;
    paidDate: string | null; // YYYY-MM-DD
    isPaid: boolean;
    isFree: boolean;
  }[];
  otherPayments: {
    categoryName: string;
    paidAmount: number;
  }[];
}

export interface ImportResult {
  totalProcessed: number;
  studentsCreated: number;
  enrollmentsCreated: number;
  billsCreated: number;
  paymentsCreated: number;
  errors: string[];
}

export const excelService = {
  // Parse Excel workbook from buffer or array
  parseAcuanWorkbook(workbook: XLSX.WorkBook): ImportPreviewItem[] {
    const tagihanSheet = workbook.Sheets['TAGIHAN'];
    const pembayaranSheet = workbook.Sheets['PEMBAYARAN'];

    if (!tagihanSheet) {
      throw new Error("Sheet 'TAGIHAN' tidak ditemukan pada file Excel acuan.");
    }

    const tagihanRows: any[] = XLSX.utils.sheet_to_json(tagihanSheet, { header: 1, defval: null });
    const bayarRows: any[] = pembayaranSheet 
      ? XLSX.utils.sheet_to_json(pembayaranSheet, { header: 1, defval: null }) 
      : [];

    if (tagihanRows.length < 2) {
      throw new Error("Sheet 'TAGIHAN' kosong atau tidak memiliki data.");
    }

    // Map header columns of TAGIHAN
    const tagihanHeader = (tagihanRows[0] || []).map((h: any) => String(h || '').trim().toUpperCase());
    const colIdx = {
      no: tagihanHeader.indexOf('NO'),
      name: tagihanHeader.findIndex((h: string) => h.includes('NAMA')),
      gender: tagihanHeader.indexOf('JK'),
      status: tagihanHeader.indexOf('STATUS'),
      phone: tagihanHeader.findIndex((h: string) => h.includes('TELPON')),
      nis: tagihanHeader.findIndex((h: string) => h.includes('REKENING') || h.includes('NIS')),
      unit: tagihanHeader.indexOf('JENJANG'),
      grade: tagihanHeader.indexOf('KELAS'),
      spp: tagihanHeader.indexOf('SPP'),
      perlengkapan: tagihanHeader.indexOf('PERLENGKAPAN'),
      peralatan: tagihanHeader.indexOf('PERALATAN'),
      kegiatan: tagihanHeader.indexOf('KEGIATAN'),
      pembangunan: tagihanHeader.indexOf('PEMBANGUNAN'),
      ujian: tagihanHeader.indexOf('UJIAN'),
      lainnya: tagihanHeader.findIndex((h: string) => h.includes('LAINNYA')),
    };

    // Build lookup for PEMBAYARAN sheet by student name
    const bayarHeader = bayarRows.length > 0 
      ? (bayarRows[0] || []).map((h: any) => String(h || '').trim())
      : [];

    const bayarLookupByName = new Map<string, any[]>();
    for (let r = 1; r < bayarRows.length; r++) {
      const row = bayarRows[r];
      const name = String(row[1] || '').trim().toLowerCase();
      if (name) {
        bayarLookupByName.set(name, row);
      }
    }

    // Auto-detect if non-SPP columns in PEMBAYARAN sheet are rotated/shifted
    // In legacy workbooks, the physical order of columns was: Peralatan (Buku), Kegiatan, Pembangunan, Perlengkapan,
    // but the header was labeled: PERLENGKAPAN, PERALATAN, KEGIATAN, PEMBANGUNAN.
    let isNonSppShifted = false;
    const idxBayarPerl = bayarHeader.findIndex((h: string) => h.toUpperCase().includes('PERLENGKAPAN'));
    const idxBayarPera = bayarHeader.findIndex((h: string) => h.toUpperCase().includes('PERALATAN'));
    const idxBayarKegi = bayarHeader.findIndex((h: string) => h.toUpperCase().includes('KEGIATAN'));
    const idxBayarPemb = bayarHeader.findIndex((h: string) => h.toUpperCase().includes('PEMBANGUNAN'));

    if (idxBayarPerl !== -1 && idxBayarPera !== -1 && idxBayarPemb !== -1) {
      let shiftedVotes = 0;
      let normalVotes = 0;
      for (let r = 1; r < Math.min(tagihanRows.length, 40); r++) {
        const tRow = tagihanRows[r];
        const sName = String(tRow[colIdx.name] || '').trim().toLowerCase();
        if (!sName) continue;
        const bRow = bayarLookupByName.get(sName);
        if (!bRow) continue;

        const tPera = Number(tRow[colIdx.peralatan] || 0);
        const tPerl = Number(tRow[colIdx.perlengkapan] || 0);
        const tPemb = Number(tRow[colIdx.pembangunan] || 0);

        const bPerlCol = Number(bRow[idxBayarPerl] || 0);
        const bPembCol = Number(bRow[idxBayarPemb] || 0);

        if (bPerlCol > 0 && tPera > 0 && bPerlCol === tPera) shiftedVotes++;
        if (bPembCol > 0 && tPerl > 0 && bPembCol === tPerl) shiftedVotes++;

        if (bPerlCol > 0 && tPerl > 0 && bPerlCol === tPerl) normalVotes++;
        if (bPembCol > 0 && tPemb > 0 && bPembCol === tPemb) normalVotes++;
      }
      isNonSppShifted = shiftedVotes > normalVotes;
    }

    const previewList: ImportPreviewItem[] = [];

    // Process each student row in TAGIHAN
    for (let r = 1; r < tagihanRows.length; r++) {
      const row = tagihanRows[r];
      const rawName = row[colIdx.name];
      if (!rawName || String(rawName).trim() === '') continue;

      const name = String(rawName).trim();
      const rawGender = String(row[colIdx.gender] || '').trim().toLowerCase();
      const gender: Gender = (rawGender.startsWith('p') || rawGender.includes('perempuan')) ? 'Perempuan' : 'Laki-laki';

      let rawStatus = String(row[colIdx.status] || 'Mampu').trim();
      let status: AdministrativeStatus = 'Mampu';
      if (/yatim/i.test(rawStatus)) status = 'Yatim';
      else if (/dhuafa/i.test(rawStatus)) status = 'Dhuafa';
      else if (/beasiswa/i.test(rawStatus)) status = 'Beasiswa';
      else if (/rekomendasi/i.test(rawStatus)) status = 'Rekomendasi';

      let phone = row[colIdx.phone] ? String(row[colIdx.phone]).replace(/\D/g, '') : null;
      if (phone && !phone.startsWith('62') && phone.startsWith('0')) {
        phone = '62' + phone.substring(1);
      }

      let rawNis = row[colIdx.nis] ? String(row[colIdx.nis]).trim() : null;
      if (rawNis && (rawNis.toLowerCase() === 'kosong' || rawNis === '-')) {
        rawNis = null;
      }

      const unit: UnitType = 'SD IT';
      const grade = String(row[colIdx.grade] || 'I').trim();

      const sppNominal = Number(row[colIdx.spp] || 0);
      const isFreeSPP = status === 'Yatim' || status === 'Beasiswa' || sppNominal === 0;

      // Non-SPP bills
      const otherBills = [
        { categoryName: 'Perlengkapan', amount: Number(row[colIdx.perlengkapan] || 0) },
        { categoryName: 'Peralatan', amount: Number(row[colIdx.peralatan] || 0) },
        { categoryName: 'Kegiatan', amount: Number(row[colIdx.kegiatan] || 0) },
        { categoryName: 'Pembangunan', amount: Number(row[colIdx.pembangunan] || 0) },
        { categoryName: 'Ujian', amount: Number(row[colIdx.ujian] || 0) },
        { categoryName: 'Lainnya', amount: Number(row[colIdx.lainnya] || 0) },
      ].filter((b) => b.amount > 0);

      // Match with PEMBAYARAN sheet
      const bayarRow = bayarLookupByName.get(name.toLowerCase());
      const sppPayments: { month: string; paidDate: string | null; isPaid: boolean; isFree: boolean }[] = [];
      const otherPayments: { categoryName: string; paidAmount: number }[] = [];

      if (bayarRow) {
        // Find indices of months in PEMBAYARAN header
        SPP_MONTHS.forEach((month) => {
          const mIdx = bayarHeader.findIndex((h: string) => h.toLowerCase() === month.toLowerCase());
          if (mIdx !== -1) {
            const cellVal = bayarRow[mIdx];
            if (cellVal === 'Free' || isFreeSPP) {
              sppPayments.push({ month, paidDate: null, isPaid: true, isFree: true });
            } else if (cellVal && typeof cellVal === 'number' && cellVal > 10000) {
              // Excel date serial number
              const d = XLSX.SSF.parse_date_code(cellVal);
              const dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
              sppPayments.push({ month, paidDate: dateStr, isPaid: true, isFree: false });
            } else if (cellVal instanceof Date) {
              const dateStr = cellVal.toISOString().split('T')[0];
              sppPayments.push({ month, paidDate: dateStr, isPaid: true, isFree: false });
            } else if (typeof cellVal === 'string' && /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(cellVal)) {
              // Parsed date string
              const parts = cellVal.split(/[-/.]/);
              let dateStr = cellVal;
              if (parts.length === 3) {
                if (parts[2].length === 4) {
                  dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else if (parts[0].length === 4) {
                  dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                }
              }
              sppPayments.push({ month, paidDate: dateStr, isPaid: true, isFree: false });
            } else {
              sppPayments.push({ month, paidDate: null, isPaid: false, isFree: false });
            }
          } else {
            sppPayments.push({ month, paidDate: null, isPaid: false, isFree: false });
          }
        });

        // Other payments in PEMBAYARAN sheet
        if (isNonSppShifted) {
          // Shifted mapping:
          // Col labeled PERLENGKAPAN -> Peralatan
          // Col labeled PERALATAN -> Kegiatan
          // Col labeled KEGIATAN -> Pembangunan
          // Col labeled PEMBANGUNAN -> Perlengkapan
          if (idxBayarPerl !== -1 && Number(bayarRow[idxBayarPerl] || 0) > 0) {
            otherPayments.push({ categoryName: 'Peralatan', paidAmount: Number(bayarRow[idxBayarPerl]) });
          }
          if (idxBayarPera !== -1 && Number(bayarRow[idxBayarPera] || 0) > 0) {
            otherPayments.push({ categoryName: 'Kegiatan', paidAmount: Number(bayarRow[idxBayarPera]) });
          }
          if (idxBayarKegi !== -1 && Number(bayarRow[idxBayarKegi] || 0) > 0) {
            otherPayments.push({ categoryName: 'Pembangunan', paidAmount: Number(bayarRow[idxBayarKegi]) });
          }
          if (idxBayarPemb !== -1 && Number(bayarRow[idxBayarPemb] || 0) > 0) {
            otherPayments.push({ categoryName: 'Perlengkapan', paidAmount: Number(bayarRow[idxBayarPemb]) });
          }
          const uIdx = bayarHeader.findIndex((h: string) => h.toUpperCase().includes('UJIAN'));
          if (uIdx !== -1 && Number(bayarRow[uIdx] || 0) > 0) {
            otherPayments.push({ categoryName: 'Ujian', paidAmount: Number(bayarRow[uIdx]) });
          }
          const lIdx = bayarHeader.findIndex((h: string) => h.toUpperCase().includes('LAINNYA'));
          if (lIdx !== -1 && Number(bayarRow[lIdx] || 0) > 0) {
            otherPayments.push({ categoryName: 'Lainnya', paidAmount: Number(bayarRow[lIdx]) });
          }
        } else {
          // Normal mapping by header name
          const catCols = ['PERLENGKAPAN', 'PERALATAN', 'KEGIATAN', 'PEMBANGUNAN', 'UJIAN', 'LAINNYA'];
          catCols.forEach((cat) => {
            const cIdx = bayarHeader.findIndex((h: string) => h.toUpperCase().includes(cat));
            if (cIdx !== -1) {
              const pVal = Number(bayarRow[cIdx] || 0);
              if (pVal > 0) {
                const properName = cat === 'LAINNYA' ? 'Lainnya' : (cat.charAt(0) + cat.slice(1).toLowerCase());
                otherPayments.push({ categoryName: properName, paidAmount: pVal });
              }
            }
          });
        }
      } else {
        SPP_MONTHS.forEach((month) => {
          sppPayments.push({ month, paidDate: null, isPaid: isFreeSPP, isFree: isFreeSPP });
        });
      }

      previewList.push({
        no: Number(row[colIdx.no] || r),
        nis: rawNis,
        name,
        gender,
        phone,
        unit,
        grade,
        status,
        sppNominal,
        isFreeSPP,
        otherBills,
        sppPayments,
        otherPayments,
      });
    }

    return previewList;
  },

  // Save imported preview into Supabase
  async executeImport(
    previewList: ImportPreviewItem[],
    academicYearId: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<ImportResult> {
    const result: ImportResult = {
      totalProcessed: 0,
      studentsCreated: 0,
      enrollmentsCreated: 0,
      billsCreated: 0,
      paymentsCreated: 0,
      errors: [],
    };

    // 1. Fetch or create categories
    const { data: categories } = await supabase.from('billing_categories').select('*');
    const catMap = new Map<string, string>();
    (categories || []).forEach((c) => catMap.set(c.name.toLowerCase(), c.id));

    // Ensure standard categories exist
    const standardCategories = ['SPP', 'Perlengkapan', 'Peralatan', 'Kegiatan', 'Pembangunan', 'Ujian', 'Lainnya'];
    for (const catName of standardCategories) {
      if (!catMap.has(catName.toLowerCase())) {
        const { data: newCat } = await supabase
          .from('billing_categories')
          .insert([{
            name: catName,
            category_type: catName === 'SPP' ? 'monthly' : 'one_time',
            is_active: true
          }])
          .select()
          .single();
        if (newCat) catMap.set(catName.toLowerCase(), newCat.id);
      }
    }

    const total = previewList.length;

    for (let i = 0; i < previewList.length; i++) {
      const item = previewList[i];
      try {
        // A. Find or create student
        let studentId: string;
        let existingStudentQuery = supabase.from('students').select('id, full_name, nis');
        if (item.nis) {
          existingStudentQuery = existingStudentQuery.or(`nis.eq.${item.nis},full_name.ilike.${item.name}`);
        } else {
          existingStudentQuery = existingStudentQuery.ilike('full_name', item.name);
        }

        const { data: existingStudents } = await existingStudentQuery.limit(1);

        if (existingStudents && existingStudents.length > 0) {
          studentId = existingStudents[0].id;
          // Update phone / nis if needed
          await supabase.from('students').update({
            gender: item.gender,
            phone: item.phone || undefined,
            nis: item.nis || existingStudents[0].nis,
            updated_at: new Date().toISOString()
          }).eq('id', studentId);
        } else {
          const { data: newStudent, error: sErr } = await supabase
            .from('students')
            .insert([{
              full_name: item.name,
              nis: item.nis,
              gender: item.gender,
              phone: item.phone,
              student_status: 'aktif'
            }])
            .select()
            .single();

          if (sErr) throw sErr;
          studentId = newStudent.id;
          result.studentsCreated++;
        }

        // B. Upsert enrollment for this academic year
        const { error: enrErr } = await supabase
          .from('student_enrollments')
          .upsert([{
            student_id: studentId,
            academic_year_id: academicYearId,
            unit: item.unit,
            grade: item.grade,
            administrative_status: item.status,
          }], { onConflict: 'student_id,academic_year_id' });

        if (enrErr) throw enrErr;
        result.enrollmentsCreated++;

        // C. Create SPP bills (12 months)
        const sppCatId = catMap.get('spp')!;
        for (const sppPay of item.sppPayments) {
          // Check if bill exists
          const { data: existingBill } = await supabase
            .from('bills')
            .select('id, status')
            .eq('student_id', studentId)
            .eq('academic_year_id', academicYearId)
            .eq('category_id', sppCatId)
            .eq('billing_period', sppPay.month)
            .maybeSingle();

          let billId: string;
          const initialStatus = sppPay.isFree ? 'Bebas' : (sppPay.isPaid ? 'Lunas' : 'Belum Dibayar');

          if (existingBill) {
            billId = existingBill.id;
            await supabase.from('bills').update({
              amount: item.sppNominal,
              status: sppPay.isFree ? 'Bebas' : existingBill.status,
              updated_at: new Date().toISOString()
            }).eq('id', billId);
          } else {
            const { data: newBill, error: bErr } = await supabase
              .from('bills')
              .insert([{
                student_id: studentId,
                academic_year_id: academicYearId,
                category_id: sppCatId,
                billing_period: sppPay.month,
                amount: item.sppNominal,
                status: initialStatus,
                description: `SPP Bulan ${sppPay.month}`
              }])
              .select()
              .single();

            if (bErr) throw bErr;
            billId = newBill.id;
            result.billsCreated++;
          }

          // If paid and not free, create payment & allocation if not already recorded
          if (sppPay.isPaid && !sppPay.isFree && sppPay.paidDate && item.sppNominal > 0) {
            const { data: existingAlloc } = await supabase
              .from('payment_allocations')
              .select('id')
              .eq('bill_id', billId)
              .limit(1);

            if (!existingAlloc || existingAlloc.length === 0) {
              const trxNum = `TRX-${sppPay.paidDate.replace(/-/g, '')}-SPP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              const { data: pmt, error: pErr } = await supabase
                .from('payments')
                .insert([{
                  transaction_number: trxNum,
                  student_id: studentId,
                  payment_date: sppPay.paidDate,
                  amount: item.sppNominal,
                  payment_method: 'Import Excel',
                  notes: `Pembayaran SPP ${sppPay.month} via Import Excel`,
                  created_by: 'Import Excel',
                  status: 'valid'
                }])
                .select()
                .single();

              if (!pErr && pmt) {
                await supabase.from('payment_allocations').insert([{
                  payment_id: pmt.id,
                  bill_id: billId,
                  allocated_amount: item.sppNominal
                }]);
                await supabase.from('bills').update({ status: 'Lunas' }).eq('id', billId);
                result.paymentsCreated++;
              }
            }
          }
        }

        // D. Create other bills & payments
        for (const oBill of item.otherBills) {
          const catId = catMap.get(oBill.categoryName.toLowerCase());
          if (!catId) continue;

          const { data: existingBill } = await supabase
            .from('bills')
            .select('id, status')
            .eq('student_id', studentId)
            .eq('academic_year_id', academicYearId)
            .eq('category_id', catId)
            .maybeSingle();

          let billId: string;
          if (existingBill) {
            billId = existingBill.id;
            await supabase.from('bills').update({
              amount: oBill.amount,
              updated_at: new Date().toISOString()
            }).eq('id', billId);
          } else {
            const { data: newBill, error: obErr } = await supabase
              .from('bills')
              .insert([{
                student_id: studentId,
                academic_year_id: academicYearId,
                category_id: catId,
                billing_period: null,
                amount: oBill.amount,
                status: 'Belum Dibayar',
                description: `Tagihan ${oBill.categoryName}`
              }])
              .select()
              .single();

            if (obErr) throw obErr;
            billId = newBill.id;
            result.billsCreated++;
          }

          // Check if there is paid amount for this category
          const matchingPaid = item.otherPayments.find(
            (p) => p.categoryName.toLowerCase() === oBill.categoryName.toLowerCase()
          );

          if (matchingPaid && matchingPaid.paidAmount > 0) {
            const { data: existingAlloc } = await supabase
              .from('payment_allocations')
              .select('id')
              .eq('bill_id', billId)
              .limit(1);

            if (!existingAlloc || existingAlloc.length === 0) {
              const todayStr = new Date().toISOString().split('T')[0];
              const trxNum = `TRX-${todayStr.replace(/-/g, '')}-${oBill.categoryName.substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              const { data: pmt, error: pErr } = await supabase
                .from('payments')
                .insert([{
                  transaction_number: trxNum,
                  student_id: studentId,
                  payment_date: todayStr,
                  amount: matchingPaid.paidAmount,
                  payment_method: 'Import Excel',
                  notes: `Pembayaran ${oBill.categoryName} via Import Excel`,
                  created_by: 'Import Excel',
                  status: 'valid'
                }])
                .select()
                .single();

              if (!pErr && pmt) {
                await supabase.from('payment_allocations').insert([{
                  payment_id: pmt.id,
                  bill_id: billId,
                  allocated_amount: matchingPaid.paidAmount
                }]);

                const newStatus = matchingPaid.paidAmount >= oBill.amount ? 'Lunas' : 'Belum Lunas';
                await supabase.from('bills').update({ status: newStatus }).eq('id', billId);
                result.paymentsCreated++;
              }
            }
          }
        }

        result.totalProcessed++;
        if (onProgress) onProgress(i + 1, total);
      } catch (err: any) {
        result.errors.push(`Gagal memproses siswa ${item.name}: ${err.message || String(err)}`);
      }
    }

    return result;
  },

  // Export Rekap Pembayaran to Excel (Matching sheet PEMBAYARAN layout)
  exportRekapPembayaran(data: any[], academicYearName: string) {
    const rows = data.map((item, idx) => ({
      'NO': idx + 1,
      'NAMA': item.student_name,
      'JENJANG': item.unit,
      'KELAS': item.grade,
      'STATUS': item.administrative_status,
      'SPP': item.spp_nominal,
      'Juli': item.spp_juli,
      'Agustus': item.spp_agustus,
      'September': item.spp_september,
      'Oktober': item.spp_oktober,
      'November': item.spp_november,
      'Desember': item.spp_desember,
      'Januari': item.spp_januari,
      'Februari': item.spp_februari,
      'Maret': item.spp_maret,
      'April': item.spp_april,
      'Mei': item.spp_mei,
      'Juni': item.spp_juni,
      'PERLENGKAPAN': item.paid_perlengkapan || 0,
      'PERALATAN': item.paid_peralatan || 0,
      'KEGIATAN': item.paid_kegiatan || 0,
      'PEMBANGUNAN': item.paid_pembangunan || 0,
      'UJIAN': item.paid_ujian || 0,
      'LAINNYA': item.paid_lainnya || 0,
      'NO. TELPON': item.phone || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PEMBAYARAN');
    XLSX.writeFile(workbook, `Rekap_Pembayaran_${academicYearName.replace('/', '-')}.xlsx`);
  },

  // Export Rekap Tunggakan to Excel
  exportRekapTunggakan(data: any[], title: string = 'Rekap_Tunggakan') {
    const rows = data.map((item, idx) => ({
      'NO': idx + 1,
      'NIS': item.nis || '-',
      'NAMA SISWA': item.student_name,
      'JENJANG': item.unit,
      'KELAS': item.grade,
      'TAHUN AJARAN': item.academic_years,
      'TOTAL TAGIHAN (Rp)': item.total_bills,
      'TOTAL PEMBAYARAN (Rp)': item.total_paid,
      'TOTAL TUNGGAKAN (Rp)': item.total_arrears,
      'STATUS': item.total_arrears === 0 ? 'Lunas' : 'Menunggak',
      'RINCIAN TUNGGAKAN': item.details || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TUNGGAKAN');
    XLSX.writeFile(workbook, `${title}_${new Date().toISOString().split('T')[0]}.xlsx`);
  },

  // Export List of Unpaid Students for a Specific SPP Month (with Accumulated Arrears & Professional Theme)
  exportUnpaidSppExcel(
    students: {
      name: string;
      nis?: string | null;
      unit: string;
      grade: string;
      phone: string | null;
      spp_nominal: number;
      unpaid_months?: string[];
      unpaid_count?: number;
      total_arrears?: number;
      month?: string;
    }[],
    targetMonth: string,
    academicYearName: string
  ) {
    const now = new Date();
    const monthsIndo = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const dateFormatted = `${now.getDate()} ${monthsIndo[now.getMonth()]} ${now.getFullYear()}`;

    const totalArrearsSum = students.reduce((sum, s) => sum + (s.total_arrears || s.spp_nominal || 0), 0);
    const totalMonthsSum = students.reduce((sum, s) => sum + (s.unpaid_count || 1), 0);

    const sheetData: any[][] = [
      ["YAYASAN PENDIDIKAN ISLAM PONDOK PESANTREN AL-QUR'ANIYYAH"],
      ["SMP IT & SMA IT AL-QUR'ANIYYAH · PONDOK AREN TANGERANG SELATAN"],
      ["REKAPITULASI DAFTAR TAGIHAN TUNGGAKAN SPP SISWA"],
      [`Tahun Ajaran: ${academicYearName}  |  Posisi Tagihan s.d. Bulan: SPP ${targetMonth}  |  Tanggal Cetak: ${dateFormatted}`],
      ["Rekening Resmi: Bank Syariah Indonesia (BSI) 7110256118 a.n. Yayasan Al-Qur'aniyyah | Konfirmasi WA: 0857-1723-5374 (Bendahara: Nasrulloh)"],
      [], // Empty row separator
      [
        'NO',
        'NAMA SISWA',
        'NIS',
        'JENJANG',
        'KELAS',
        'NO. WHATSAPP WALI',
        'TARIF SPP/BLN (Rp)',
        `BULAN TERTUNGGAK (S.D. ${targetMonth.toUpperCase()})`,
        'JML BLN',
        'TOTAL TAGIHAN SPP (Rp)',
        'STATUS & TINDAK LANJUT'
      ]
    ];

    students.forEach((s, idx) => {
      const monthsStr = s.unpaid_months && s.unpaid_months.length > 0
        ? s.unpaid_months.join(', ')
        : `SPP ${s.month || targetMonth}`;
      const monthsCount = s.unpaid_count || (s.unpaid_months ? s.unpaid_months.length : 1);
      const totalAmount = s.total_arrears || (s.spp_nominal * monthsCount);
      const statusNote = monthsCount > 1
        ? `Tertunggak ${monthsCount} Bulan (Perlu Segera Ditagih)`
        : 'Belum Bayar';

      sheetData.push([
        idx + 1,
        s.name,
        s.nis || '-',
        s.unit,
        s.grade,
        s.phone || '-',
        s.spp_nominal,
        monthsStr,
        monthsCount,
        totalAmount,
        statusNote
      ]);
    });

    // Summary row
    sheetData.push([
      '',
      'TOTAL AKUMULASI TAGIHAN SPP',
      '',
      '',
      '',
      '',
      '',
      `${totalMonthsSum} Bulan Tunggakan`,
      `${students.length} Siswa`,
      totalArrearsSum,
      'Perlu Ditindaklanjuti'
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Merge header banner rows across columns A to K (columns 0 to 10)
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 10 } },
      { s: { r: sheetData.length - 1, c: 1 }, e: { r: sheetData.length - 1, c: 6 } }
    ];

    // Column widths
    worksheet['!cols'] = [
      { wch: 6 },   // NO
      { wch: 32 },  // NAMA SISWA
      { wch: 15 },  // NIS
      { wch: 12 },  // JENJANG
      { wch: 10 },  // KELAS
      { wch: 20 },  // NO. WHATSAPP WALI
      { wch: 18 },  // TARIF SPP
      { wch: 38 },  // BULAN TERTUNGGAK
      { wch: 12 },  // JML BLN
      { wch: 24 },  // TOTAL TAGIHAN SPP
      { wch: 32 },  // STATUS & TINDAK LANJUT
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Tagihan SPP sd ${targetMonth}`);
    XLSX.writeFile(workbook, `Tagihan_Tunggakan_SPP_sd_${targetMonth}_${academicYearName.replace('/', '-')}.xlsx`);
  },

  // Download official Template Excel for initial database upload
  downloadTemplateAcuanExcel() {
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

    const petunjukData = [
      { "BAGIAN": "SHEET TAGIHAN", "KETERANGAN": "Menentukan data master siswa dan tarif kewajiban tagihan tahun ajaran terkait." },
      { "BAGIAN": "NO", "KETERANGAN": "Nomor urut siswa." },
      { "BAGIAN": "NAMA", "KETERANGAN": "Nama lengkap siswa (Wajib unik/sesuai identitas)." },
      { "BAGIAN": "JK", "KETERANGAN": "Jenis kelamin: L (Laki-laki) atau P (Perempuan)." },
      { "BAGIAN": "STATUS", "KETERANGAN": "Status administrasi: Mampu, Yatim, Dhuafa, Beasiswa, atau Rekomendasi." },
      { "BAGIAN": "NO TELPON", "KETERANGAN": "Nomor WhatsApp aktif orang tua / wali." },
      { "BAGIAN": "NO REKENING / NIS", "KETERANGAN": "Nomor Induk Siswa (NIS) atau No Rekening virtual account." },
      { "BAGIAN": "JENJANG", "KETERANGAN": "Jenjang pendidikan: TK IT, SD IT, SMP IT, atau SMA IT." },
      { "BAGIAN": "KELAS", "KETERANGAN": "Tingkat kelas (contoh: VII A, VIII, IX, X, XI, XII)." },
      { "BAGIAN": "SPP", "KETERANGAN": "Tarif SPP bulanan siswa (contoh: 1335000). Jika gratis isi 0." },
      { "BAGIAN": "PERLENGKAPAN dll", "KETERANGAN": "Nominal kewajiban tagihan non-SPP selama 1 tahun ajaran." },
      { "BAGIAN": "-----------------", "KETERANGAN": "------------------------------------------------------------------" },
      { "BAGIAN": "SHEET PEMBAYARAN", "KETERANGAN": "Menyimpan data riwayat pembayaran tanggal SPP dan nominal Non-SPP." },
      { "BAGIAN": "Bulan SPP (Juli s.d Juni)", "KETERANGAN": "Isi dengan TANGGAL pembayaran (contoh: 2026-07-25 atau 25/07/2026). Jika gratis isi 'Free'. Jika belum bayar, KOSONGKAN." },
      { "BAGIAN": "Kategori Non-SPP", "KETERANGAN": "Isi dengan akumulasi NOMINAL rupiah yang sudah dibayarkan oleh siswa (contoh: 500000)." }
    ];

    const wb = XLSX.utils.book_new();
    const wsTagihan = XLSX.utils.json_to_sheet(tagihanData);
    const wsPembayaran = XLSX.utils.json_to_sheet(pembayaranData);
    const wsPetunjuk = XLSX.utils.json_to_sheet(petunjukData);

    XLSX.utils.book_append_sheet(wb, wsTagihan, 'TAGIHAN');
    XLSX.utils.book_append_sheet(wb, wsPembayaran, 'PEMBAYARAN');
    XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'PETUNJUK PENGISIAN');

    XLSX.writeFile(wb, 'Format_Template_Administrasi_AlQuraniyyah.xlsx');
  }
};
