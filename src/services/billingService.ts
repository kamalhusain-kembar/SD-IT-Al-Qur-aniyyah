import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Bill, BillingCategory, BillStatus } from '../types/database';
import { localStore } from './dataStore';

export const SPP_MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

export function getCurrentActiveSPPMonth(): string {
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const now = new Date();
  return monthNames[now.getMonth()] || 'Oktober';
}

export function isUpcomingSPPMonth(
  billingPeriod: string | null | undefined,
  academicYearOrStatus?: { status?: string; name?: string } | string | null,
  activeMonth?: string
): boolean {
  if (!billingPeriod) return false;

  let effectiveActiveMonth = getCurrentActiveSPPMonth();
  let effectiveYearStatus: string | null = null;

  if (typeof academicYearOrStatus === 'string') {
    // If it's a known month name, it was passed as activeMonth
    if (SPP_MONTHS.some(m => m.toLowerCase() === academicYearOrStatus.toLowerCase())) {
      effectiveActiveMonth = academicYearOrStatus;
    } else {
      effectiveYearStatus = academicYearOrStatus;
    }
  } else if (academicYearOrStatus && typeof academicYearOrStatus === 'object') {
    effectiveYearStatus = academicYearOrStatus.status || null;
  }

  if (activeMonth) {
    effectiveActiveMonth = activeMonth;
  }

  // If the academic year is explicitly NOT active (e.g. 'archived'), it is in the past!
  // No month in a past/archived academic year is upcoming; all 12 months have elapsed.
  if (effectiveYearStatus && effectiveYearStatus !== 'active') {
    return false;
  }

  const periodIndex = SPP_MONTHS.findIndex(m => m.toLowerCase() === billingPeriod.trim().toLowerCase());
  if (periodIndex === -1) return false;
  const activeIndex = SPP_MONTHS.findIndex(m => m.toLowerCase() === effectiveActiveMonth.trim().toLowerCase());
  if (activeIndex === -1) return false;
  return periodIndex > activeIndex;
}

export const billingService = {
  async getCategories(): Promise<BillingCategory[]> {
    if (!isSupabaseConfigured) {
      return localStore.getCategories();
    }
    try {
      const { data, error } = await supabase
        .from('billing_categories')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch {
      return localStore.getCategories();
    }
  },

  async addCategory(name: string, categoryType: 'monthly' | 'one_time', orderIndex: number = 0): Promise<BillingCategory> {
    if (!isSupabaseConfigured) {
      const newCat: BillingCategory = {
        id: `cat-${Date.now()}`,
        name,
        category_type: categoryType,
        order_index: orderIndex,
        is_active: true,
      };
      localStore.addCategory(newCat);
      return newCat;
    }

    const { data, error } = await supabase
      .from('billing_categories')
      .insert([{
        name,
        category_type: categoryType,
        order_index: orderIndex,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getBillsByStudent(studentId: string, academicYearId?: string): Promise<Bill[]> {
    if (!isSupabaseConfigured) {
      const allBills = localStore.getBills().filter((b) => b.student_id === studentId);
      const filtered = academicYearId ? allBills.filter((b) => b.academic_year_id === academicYearId) : allBills;
      const categories = localStore.getCategories();
      const years = localStore.getAcademicYears();
      const payments = localStore.getPayments();
      const allocations = localStore.getAllocations();

      return filtered.map((b) => {
        const cat = categories.find((c) => c.id === b.category_id);
        const yr = years.find((y) => y.id === b.academic_year_id);
        const bAllocs = allocations.filter((a) => a.bill_id === b.id);
        const validPaid = bAllocs
          .filter((a) => payments.find((p) => p.id === a.payment_id)?.status === 'valid')
          .reduce((sum, a) => sum + Number(a.allocated_amount), 0);

        let lastDate: string | null = null;
        if (bAllocs.length > 0) {
          const matchPmts = payments.filter((p) => bAllocs.some((a) => a.payment_id === p.id && p.status === 'valid'));
          if (matchPmts.length > 0) {
            matchPmts.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            lastDate = matchPmts[0].payment_date;
          }
        }

        const catName = cat?.name || '';
        const isSpp = catName.toLowerCase().includes('spp') || catName.toLowerCase().includes('syahriyyah');
        const isUpcoming = isSpp && isUpcomingSPPMonth(b.billing_period, yr);

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (b.status === 'Bebas') calculatedStatus = 'Bebas';
        else if (validPaid >= Number(b.amount) && Number(b.amount) > 0) calculatedStatus = 'Lunas';
        else if (validPaid > 0) calculatedStatus = 'Belum Lunas';
        else if (isUpcoming) calculatedStatus = 'Akan Berlangsung';

        return {
          ...b,
          category: cat,
          academic_year: yr,
          total_paid: validPaid,
          remaining_amount: Math.max(0, Number(b.amount) - validPaid),
          calculated_status: calculatedStatus,
          last_payment_date: lastDate,
        };
      });
    }

    try {
      let query = supabase
        .from('bills')
        .select(`
          *,
          category:billing_categories(*),
          academic_year:academic_years(*),
          allocations:payment_allocations(
            id,
            allocated_amount,
            payment:payments(
              id,
              transaction_number,
              payment_date,
              status
            )
          )
        `)
        .eq('student_id', studentId);

      if (academicYearId) {
        query = query.eq('academic_year_id', academicYearId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((bill: any) => {
        const validAllocations = (bill.allocations || []).filter(
          (a: any) => a.payment && a.payment.status === 'valid'
        );
        const totalPaid = validAllocations.reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);
        const remainingAmount = Math.max(0, Number(bill.amount) - totalPaid);

        let lastPaymentDate: string | null = null;
        if (validAllocations.length > 0) {
          const sorted = [...validAllocations].sort((a: any, b: any) => 
            new Date(b.payment.payment_date).getTime() - new Date(a.payment.payment_date).getTime()
          );
          lastPaymentDate = sorted[0].payment.payment_date;
        }

        const catName = bill.category?.name || '';
        const isSpp = catName.toLowerCase().includes('spp') || catName.toLowerCase().includes('syahriyyah');
        const isUpcoming = isSpp && isUpcomingSPPMonth(bill.billing_period, bill.academic_year);

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (bill.status === 'Bebas') {
          calculatedStatus = 'Bebas';
        } else if (totalPaid >= Number(bill.amount) && Number(bill.amount) > 0) {
          calculatedStatus = 'Lunas';
        } else if (totalPaid > 0) {
          calculatedStatus = 'Belum Lunas';
        } else if (isUpcoming) {
          calculatedStatus = 'Akan Berlangsung';
        }

        return {
          ...bill,
          total_paid: totalPaid,
          remaining_amount: remainingAmount,
          calculated_status: calculatedStatus,
          last_payment_date: lastPaymentDate
        };
      });
    } catch {
      return this.getBillsByStudent(studentId, academicYearId);
    }
  },

  async getBillsForAcademicYear(academicYearId: string): Promise<Bill[]> {
    if (!isSupabaseConfigured) {
      const allBills = localStore.getBills().filter((b) => b.academic_year_id === academicYearId);
      const categories = localStore.getCategories();
      const students = localStore.getStudents();
      const payments = localStore.getPayments();
      const allocations = localStore.getAllocations();

      return allBills.map((b) => {
        const cat = categories.find((c) => c.id === b.category_id);
        const std = students.find((s) => s.id === b.student_id);
        const bAllocs = allocations.filter((a) => a.bill_id === b.id);
        const validPaid = bAllocs
          .filter((a) => payments.find((p) => p.id === a.payment_id)?.status === 'valid')
          .reduce((sum, a) => sum + Number(a.allocated_amount), 0);

        let lastDate: string | null = null;
        if (bAllocs.length > 0) {
          const matchPmts = payments.filter((p) => bAllocs.some((a) => a.payment_id === p.id && p.status === 'valid'));
          if (matchPmts.length > 0) {
            matchPmts.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            lastDate = matchPmts[0].payment_date;
          }
        }

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (b.status === 'Bebas') calculatedStatus = 'Bebas';
        else if (validPaid >= Number(b.amount) && Number(b.amount) > 0) calculatedStatus = 'Lunas';
        else if (validPaid > 0) calculatedStatus = 'Belum Lunas';

        return {
          ...b,
          category: cat,
          student: std,
          total_paid: validPaid,
          remaining_amount: Math.max(0, Number(b.amount) - validPaid),
          calculated_status: calculatedStatus,
          last_payment_date: lastDate,
        };
      });
    }

    try {
      let allBillsData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('bills')
          .select(`
            *,
            category:billing_categories(*),
            academic_year:academic_years(*),
            student:students(*),
            allocations:payment_allocations(
              id,
              allocated_amount,
              payment:payments(
                id,
                transaction_number,
                payment_date,
                status
              )
            )
          `)
          .eq('academic_year_id', academicYearId)
          .range(from, to);

        if (error) throw error;

        if (data && data.length > 0) {
          allBillsData = allBillsData.concat(data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      return allBillsData.map((bill: any) => {
        const validAllocations = (bill.allocations || []).filter(
          (a: any) => a.payment && a.payment.status === 'valid'
        );
        const totalPaid = validAllocations.reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);
        const remainingAmount = Math.max(0, Number(bill.amount) - totalPaid);

        let lastPaymentDate: string | null = null;
        if (validAllocations.length > 0) {
          const sorted = [...validAllocations].sort((a: any, b: any) => 
            new Date(b.payment.payment_date).getTime() - new Date(a.payment.payment_date).getTime()
          );
          lastPaymentDate = sorted[0].payment.payment_date;
        }

        const catName = bill.category?.name || '';
        const isSpp = catName.toLowerCase().includes('spp') || catName.toLowerCase().includes('syahriyyah');
        const isUpcoming = isSpp && isUpcomingSPPMonth(bill.billing_period, bill.academic_year);

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (bill.status === 'Bebas') {
          calculatedStatus = 'Bebas';
        } else if (totalPaid >= Number(bill.amount) && Number(bill.amount) > 0) {
          calculatedStatus = 'Lunas';
        } else if (totalPaid > 0) {
          calculatedStatus = 'Belum Lunas';
        } else if (isUpcoming) {
          calculatedStatus = 'Akan Berlangsung';
        }

        return {
          ...bill,
          total_paid: totalPaid,
          remaining_amount: remainingAmount,
          calculated_status: calculatedStatus,
          last_payment_date: lastPaymentDate
        };
      });
    } catch {
      return this.getBillsForAcademicYear(academicYearId);
    }
  },

  async createBill(billData: Omit<Bill, 'id' | 'created_at' | 'updated_at'>): Promise<Bill> {
    if (!isSupabaseConfigured) {
      const newBill: Bill = {
        id: `bill-${Date.now()}`,
        ...billData,
        created_at: new Date().toISOString(),
      };
      localStore.saveBill(newBill);
      return newBill;
    }

    const { data, error } = await supabase
      .from('bills')
      .insert([billData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async generateMonthlySPPForStudent(
    studentId: string,
    academicYearId: string,
    categoryId: string,
    monthlyAmount: number,
    isFree: boolean = false
  ): Promise<void> {
    const bills = SPP_MONTHS.map((month) => ({
      student_id: studentId,
      academic_year_id: academicYearId,
      category_id: categoryId,
      billing_period: month,
      amount: monthlyAmount,
      status: isFree ? ('Bebas' as BillStatus) : ('Belum Dibayar' as BillStatus),
      description: `SPP Bulan ${month}`,
    }));

    if (!isSupabaseConfigured) {
      const created = bills.map((b) => ({
        id: `bill-${Math.random().toString(36).substring(2, 9)}`,
        ...b,
        created_at: new Date().toISOString(),
      }));
      localStore.saveBills(created);
      return;
    }

    const { error } = await supabase.from('bills').insert(bills);
    if (error) throw error;
  },

  async updateBill(
    id: string,
    updates: {
      amount?: number;
      billing_period?: string | null;
      due_date?: string | null;
      description?: string | null;
      status?: BillStatus;
    }
  ): Promise<Bill> {
    if (!isSupabaseConfigured) {
      const existing = localStore.getBills().find((b) => b.id === id);
      if (!existing) throw new Error('Tagihan tidak ditemukan');
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      localStore.saveBills([updated]);
      return updated;
    }

    const { data, error } = await supabase
      .from('bills')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteBill(id: string): Promise<void> {
    if (!isSupabaseConfigured) {
      localStore.deleteBill(id);
      return;
    }

    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async reviseStudentSPP(
    studentId: string,
    academicYearId: string,
    newAmount: number,
    fromMonth: string = 'Juli'
  ): Promise<{ updatedCount: number }> {
    const fromIndex = SPP_MONTHS.findIndex(m => m.toLowerCase() === fromMonth.toLowerCase());
    const validMonths = fromIndex === -1 ? SPP_MONTHS : SPP_MONTHS.slice(fromIndex);

    if (!isSupabaseConfigured) {
      const bills = localStore.getBills().filter(b => 
        b.student_id === studentId &&
        b.academic_year_id === academicYearId &&
        b.billing_period &&
        validMonths.includes(b.billing_period) &&
        b.status !== 'Lunas'
      );
      bills.forEach(b => {
        b.amount = newAmount;
        b.updated_at = new Date().toISOString();
      });
      localStore.saveBills(bills);
      return { updatedCount: bills.length };
    }

    const cats = await this.getCategories();
    const sppCat = cats.find(c => c.name.toLowerCase().includes('spp')) || cats[0];
    if (!sppCat) throw new Error('Kategori SPP tidak ditemukan');

    const { data: billsToUpdate, error: fetchErr } = await supabase
      .from('bills')
      .select('id')
      .eq('student_id', studentId)
      .eq('academic_year_id', academicYearId)
      .eq('category_id', sppCat.id)
      .in('billing_period', validMonths)
      .neq('status', 'Lunas');

    if (fetchErr) throw fetchErr;
    if (!billsToUpdate || billsToUpdate.length === 0) return { updatedCount: 0 };

    const ids = billsToUpdate.map(b => b.id);
    const { error: updateErr } = await supabase
      .from('bills')
      .update({ amount: newAmount, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateErr) throw updateErr;
    return { updatedCount: ids.length };
  },

  async handleStudentDropout(
    studentId: string,
    academicYearId: string,
    effectiveMonth: string,
    action: 'bebas' | 'delete' = 'bebas',
    newStudentStatus: 'nonaktif' | 'pindah' = 'nonaktif'
  ): Promise<{ affectedBillsCount: number }> {
    const fromIndex = SPP_MONTHS.findIndex(m => m.toLowerCase() === effectiveMonth.toLowerCase());
    const futureMonths = fromIndex === -1 ? [] : SPP_MONTHS.slice(fromIndex);

    if (!isSupabaseConfigured) {
      const student = localStore.getStudents().find(s => s.id === studentId);
      if (student) {
        student.student_status = newStudentStatus;
      }
      const targetBills = localStore.getBills().filter(b => 
        b.student_id === studentId &&
        b.academic_year_id === academicYearId &&
        b.billing_period &&
        futureMonths.includes(b.billing_period) &&
        b.status !== 'Lunas'
      );

      if (action === 'delete') {
        targetBills.forEach(b => localStore.deleteBill(b.id));
      } else {
        targetBills.forEach(b => {
          b.status = 'Bebas';
          b.description = `Dibebaskan (Santri Berhenti per ${effectiveMonth})`;
          b.updated_at = new Date().toISOString();
        });
        localStore.saveBills(targetBills);
      }
      return { affectedBillsCount: targetBills.length };
    }

    // 1. Update student status in students table
    await supabase.from('students').update({
      student_status: newStudentStatus,
      updated_at: new Date().toISOString()
    }).eq('id', studentId);

    // 2. Add note to enrollment
    await supabase.from('student_enrollments').update({
      notes: `Berhenti/Pindah sejak ${effectiveMonth}`,
      updated_at: new Date().toISOString()
    }).eq('student_id', studentId).eq('academic_year_id', academicYearId);

    // 3. Find future unpaid monthly SPP bills
    const cats = await this.getCategories();
    const sppCat = cats.find(c => c.name.toLowerCase().includes('spp')) || cats[0];
    if (!sppCat) return { affectedBillsCount: 0 };

    const { data: targetBills, error: bErr } = await supabase
      .from('bills')
      .select('id, status')
      .eq('student_id', studentId)
      .eq('academic_year_id', academicYearId)
      .eq('category_id', sppCat.id)
      .in('billing_period', futureMonths)
      .neq('status', 'Lunas');

    if (bErr) throw bErr;
    if (!targetBills || targetBills.length === 0) return { affectedBillsCount: 0 };

    const billIds = targetBills.map(b => b.id);

    if (action === 'delete') {
      const { error: delErr } = await supabase
        .from('bills')
        .delete()
        .in('id', billIds);
      if (delErr) throw delErr;
    } else {
      const { error: updErr } = await supabase
        .from('bills')
        .update({
          status: 'Bebas',
          description: `Dibebaskan (Santri Berhenti per ${effectiveMonth})`,
          updated_at: new Date().toISOString()
        })
        .in('id', billIds);
      if (updErr) throw updErr;
    }

    return { affectedBillsCount: billIds.length };
  }
};
