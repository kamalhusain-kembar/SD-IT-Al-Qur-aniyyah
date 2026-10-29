import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Payment, PaymentAllocation, BillStatus } from '../types/database';
import { localStore } from './dataStore';

export interface CreatePaymentInput {
  student_id: string;
  payment_date: string;
  amount: number;
  payment_method?: string;
  notes?: string;
  created_by?: string;
  allocations: {
    bill_id: string;
    allocated_amount: number;
  }[];
}

export const paymentService = {
  async recordPayment(input: CreatePaymentInput): Promise<Payment> {
    const totalAllocated = input.allocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
    if (totalAllocated > input.amount) {
      throw new Error(`Total alokasi (Rp${totalAllocated.toLocaleString('id-ID')}) melebihi nominal pembayaran (Rp${input.amount.toLocaleString('id-ID')})`);
    }

    const dateStr = input.payment_date.replace(/-/g, '');
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transactionNumber = `TRX-${dateStr}-${randomHex}`;

    if (!isSupabaseConfigured) {
      const newPayment: Payment = {
        id: `pmt-${Date.now()}`,
        transaction_number: transactionNumber,
        student_id: input.student_id,
        payment_date: input.payment_date,
        amount: input.amount,
        payment_method: input.payment_method || 'Tunai',
        notes: input.notes || null,
        created_by: input.created_by || 'Petugas Keuangan',
        status: 'valid',
        created_at: new Date().toISOString(),
      };

      const newAllocations: PaymentAllocation[] = input.allocations.map((a) => ({
        id: `pa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        payment_id: newPayment.id,
        bill_id: a.bill_id,
        allocated_amount: a.allocated_amount,
        created_at: new Date().toISOString(),
      }));

      localStore.recordPayment(newPayment, newAllocations);
      return newPayment;
    }

    try {
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          transaction_number: transactionNumber,
          student_id: input.student_id,
          payment_date: input.payment_date,
          amount: input.amount,
          payment_method: input.payment_method || 'Tunai',
          notes: input.notes || null,
          created_by: input.created_by || 'Petugas Keuangan',
          status: 'valid'
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;

      const allocationRows = input.allocations.map((a) => ({
        payment_id: payment.id,
        bill_id: a.bill_id,
        allocated_amount: a.allocated_amount
      }));

      const { error: allocError } = await supabase
        .from('payment_allocations')
        .insert(allocationRows);

      if (allocError) throw allocError;

      for (const alloc of input.allocations) {
        const { data: allBillAllocations } = await supabase
          .from('payment_allocations')
          .select(`
            allocated_amount,
            payment:payments(status)
          `)
          .eq('bill_id', alloc.bill_id);

        const validPaid = (allBillAllocations || [])
          .filter((a: any) => a.payment?.status === 'valid')
          .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        const { data: bill } = await supabase
          .from('bills')
          .select('amount, status')
          .eq('id', alloc.bill_id)
          .single();

        if (bill) {
          let newStatus: BillStatus = 'Belum Dibayar';
          if (bill.status === 'Bebas') {
            newStatus = 'Bebas';
          } else if (validPaid >= Number(bill.amount)) {
            newStatus = 'Lunas';
          } else if (validPaid > 0) {
            newStatus = 'Belum Lunas';
          }

          await supabase
            .from('bills')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', alloc.bill_id);
        }
      }

      return payment;
    } catch {
      return this.recordPayment(input);
    }
  },

  async cancelPayment(paymentId: string, reason: string, cancelledBy?: string): Promise<void> {
    if (!isSupabaseConfigured) {
      localStore.cancelPayment(paymentId, reason);
      return;
    }

    try {
      const { data: payment, error: pError } = await supabase
        .from('payments')
        .select('*, allocations:payment_allocations(*)')
        .eq('id', paymentId)
        .single();

      if (pError || !payment) throw new Error('Pembayaran tidak ditemukan');

      const { error: cancelError } = await supabase
        .from('payments')
        .update({
          status: 'cancelled',
          notes: payment.notes ? `${payment.notes} [Dibatalkan: ${reason}]` : `[Dibatalkan: ${reason}]`,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId);

      if (cancelError) throw cancelError;

      for (const alloc of payment.allocations || []) {
        const { data: allBillAllocations } = await supabase
          .from('payment_allocations')
          .select(`
            allocated_amount,
            payment:payments(status)
          `)
          .eq('bill_id', alloc.bill_id);

        const validPaid = (allBillAllocations || [])
          .filter((a: any) => a.payment?.status === 'valid')
          .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        const { data: bill } = await supabase
          .from('bills')
          .select('amount, status')
          .eq('id', alloc.bill_id)
          .single();

        if (bill && bill.status !== 'Bebas') {
          let newStatus: BillStatus = 'Belum Dibayar';
          if (validPaid >= Number(bill.amount)) {
            newStatus = 'Lunas';
          } else if (validPaid > 0) {
            newStatus = 'Belum Lunas';
          }

          await supabase
            .from('bills')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', alloc.bill_id);
        }
      }
    } catch {
      localStore.cancelPayment(paymentId, reason);
    }
  },

  async getRecentPayments(limit: number = 20, academicYearId?: string): Promise<Payment[]> {
    if (!isSupabaseConfigured) {
      const allPmts = localStore.getPayments();
      const allStudents = localStore.getStudents();
      const allBills = localStore.getBills();
      const allCategories = localStore.getCategories();
      const allAllocations = localStore.getAllocations();

      const mapped = allPmts.slice(0, limit).map((p) => {
        const std = allStudents.find((s) => s.id === p.student_id);
        const allocs = allAllocations.filter((a) => a.payment_id === p.id).map((a) => {
          const b = allBills.find((bill) => bill.id === a.bill_id);
          const cat = allCategories.find((c) => c.id === b?.category_id);
          return {
            ...a,
            bill: b ? { ...b, category: cat } : undefined,
          };
        });

        return {
          ...p,
          student: std,
          allocations: allocs,
        };
      });

      return mapped;
    }

    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          student:students(
            id,
            nis,
            full_name,
            student_enrollments(
              unit,
              grade,
              academic_year_id
            )
          ),
          allocations:payment_allocations(
            id,
            allocated_amount,
            bill:bills(
              id,
              billing_period,
              academic_year_id,
              category:billing_categories(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch {
      return this.getRecentPayments(limit, academicYearId);
    }
  },

  async updateSppCell(
    studentId: string,
    academicYearId: string,
    month: string,
    data: {
      status: BillStatus;
      paymentDate?: string;
      amount?: number;
      paymentMethod?: string;
      notes?: string;
    }
  ): Promise<void> {
    // 1. Sync localStore
    localStore.updateSppCell(studentId, academicYearId, month, data);

    if (!isSupabaseConfigured) return;

    try {
      // 2. Find or create SPP category
      let sppCatId: string;
      const { data: cats } = await supabase.from('billing_categories').select('id, name').ilike('name', '%spp%').limit(1);
      if (cats && cats.length > 0) {
        sppCatId = cats[0].id;
      } else {
        const { data: newCat } = await supabase.from('billing_categories').insert([{
          name: 'SPP',
          category_type: 'monthly',
          is_active: true
        }]).select().single();
        sppCatId = newCat.id;
      }

      // 3. Find or create bill for this student, month, and academic year
      let billId: string;
      let billAmount: number = data.amount || 1335000;

      const { data: existingBill } = await supabase
        .from('bills')
        .select('id, amount, status')
        .eq('student_id', studentId)
        .eq('academic_year_id', academicYearId)
        .eq('category_id', sppCatId)
        .eq('billing_period', month)
        .maybeSingle();

      if (existingBill) {
        billId = existingBill.id;
        billAmount = Number(existingBill.amount);
      } else {
        const { data: newBill, error: bErr } = await supabase
          .from('bills')
          .insert([{
            student_id: studentId,
            academic_year_id: academicYearId,
            category_id: sppCatId,
            billing_period: month,
            amount: billAmount,
            status: data.status,
            description: `SPP Bulan ${month}`
          }])
          .select()
          .single();

        if (bErr) throw bErr;
        billId = newBill.id;
      }

      // 4. Delete existing payment allocations for this bill
      const { data: existingAllocs } = await supabase
        .from('payment_allocations')
        .select('id, payment_id')
        .eq('bill_id', billId);

      if (existingAllocs && existingAllocs.length > 0) {
        const pmtIds = existingAllocs.map((a: any) => a.payment_id);
        await supabase.from('payment_allocations').delete().eq('bill_id', billId);
        await supabase.from('payments').delete().in('id', pmtIds);
      }

      // 5. Apply new status
      if ((data.status === 'Lunas' || data.status === 'Belum Lunas') && data.paymentDate) {
        const payAmount = data.amount || billAmount;
        const dateStr = data.paymentDate.replace(/-/g, '');
        const trxNum = `TRX-${dateStr}-SPP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const { data: pmt, error: pErr } = await supabase
          .from('payments')
          .insert([{
            transaction_number: trxNum,
            student_id: studentId,
            payment_date: data.paymentDate,
            amount: payAmount,
            payment_method: data.paymentMethod || 'Tunai',
            notes: data.notes || (payAmount < billAmount ? `ACC Sebagian SPP ${month} (Cicilan/Dispensasi)` : `Pembayaran SPP ${month} (Edit Langsung)`),
            created_by: 'Petugas Keuangan',
            status: 'valid'
          }])
          .select()
          .single();

        if (pErr) throw pErr;

        await supabase.from('payment_allocations').insert([{
          payment_id: pmt.id,
          bill_id: billId,
          allocated_amount: payAmount
        }]);

        const finalStatus = payAmount >= billAmount ? 'Lunas' : 'Belum Lunas';
        await supabase.from('bills').update({
          status: finalStatus,
          updated_at: new Date().toISOString()
        }).eq('id', billId);
      } else {
        await supabase.from('bills').update({
          status: data.status,
          updated_at: new Date().toISOString()
        }).eq('id', billId);
      }
    } catch (err) {
      console.error('Error in paymentService.updateSppCell for Supabase:', err);
      throw err;
    }
  },

  async updateNonSppCell(
    studentId: string,
    academicYearId: string,
    categoryName: string,
    paidAmount: number,
    paymentDate: string = new Date().toISOString().split('T')[0]
  ): Promise<void> {
    // 1. Sync localStore
    localStore.updateNonSppCell(studentId, academicYearId, categoryName, paidAmount, paymentDate);

    if (!isSupabaseConfigured) return;

    try {
      // 2. Find or create category
      let catId: string;
      const { data: cats } = await supabase.from('billing_categories').select('id, name').ilike('name', `%${categoryName}%`).limit(1);
      if (cats && cats.length > 0) {
        catId = cats[0].id;
      } else {
        const { data: newCat } = await supabase.from('billing_categories').insert([{
          name: categoryName,
          category_type: 'one_time',
          is_active: true
        }]).select().single();
        catId = newCat.id;
      }

      // 3. Find or create bill
      let billId: string;
      let billAmount: number = paidAmount > 0 ? paidAmount : 1000000;

      const { data: existingBill } = await supabase
        .from('bills')
        .select('id, amount, status')
        .eq('student_id', studentId)
        .eq('academic_year_id', academicYearId)
        .eq('category_id', catId)
        .maybeSingle();

      if (existingBill) {
        billId = existingBill.id;
        billAmount = Number(existingBill.amount);
      } else {
        const { data: newBill, error: bErr } = await supabase
          .from('bills')
          .insert([{
            student_id: studentId,
            academic_year_id: academicYearId,
            category_id: catId,
            billing_period: null,
            amount: billAmount,
            status: 'Belum Dibayar',
            description: `Tagihan ${categoryName}`
          }])
          .select()
          .single();

        if (bErr) throw bErr;
        billId = newBill.id;
      }

      // 4. Delete old allocations for this bill
      const { data: existingAllocs } = await supabase
        .from('payment_allocations')
        .select('id, payment_id')
        .eq('bill_id', billId);

      if (existingAllocs && existingAllocs.length > 0) {
        const pmtIds = existingAllocs.map((a: any) => a.payment_id);
        await supabase.from('payment_allocations').delete().eq('bill_id', billId);
        await supabase.from('payments').delete().in('id', pmtIds);
      }

      // 5. If paidAmount > 0, insert new payment
      if (paidAmount > 0) {
        const dateStr = paymentDate.replace(/-/g, '');
        const trxNum = `TRX-${dateStr}-${categoryName.substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const { data: pmt, error: pErr } = await supabase
          .from('payments')
          .insert([{
            transaction_number: trxNum,
            student_id: studentId,
            payment_date: paymentDate,
            amount: paidAmount,
            payment_method: 'Tunai',
            notes: `Pembayaran ${categoryName} (Edit Langsung)`,
            created_by: 'Petugas Keuangan',
            status: 'valid'
          }])
          .select()
          .single();

        if (pErr) throw pErr;

        await supabase.from('payment_allocations').insert([{
          payment_id: pmt.id,
          bill_id: billId,
          allocated_amount: paidAmount
        }]);

        const finalStatus = paidAmount >= billAmount ? 'Lunas' : 'Belum Lunas';
        await supabase.from('bills').update({
          status: finalStatus,
          updated_at: new Date().toISOString()
        }).eq('id', billId);
      } else {
        await supabase.from('bills').update({
          status: 'Belum Dibayar',
          updated_at: new Date().toISOString()
        }).eq('id', billId);
      }
    } catch (err) {
      console.error('Error in paymentService.updateNonSppCell for Supabase:', err);
      throw err;
    }
  },

  async batchApplyPayments(
    academicYearId: string,
    items: {
      studentId: string;
      itemType: 'SPP' | 'Non-SPP';
      categoryOrMonth: string;
      paymentDate: string;
      amount: number;
      paymentMethod?: string;
    }[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ successCount: number; failCount: number }> {
    let successCount = 0;
    let failCount = 0;
    const total = items.length;

    const batchSize = 5;
    for (let i = 0; i < total; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            if (item.itemType === 'SPP') {
              await this.updateSppCell(item.studentId, academicYearId, item.categoryOrMonth, {
                status: 'Lunas',
                paymentDate: item.paymentDate,
                amount: item.amount,
                paymentMethod: item.paymentMethod || 'Tunai',
              });
            } else {
              await this.updateNonSppCell(
                item.studentId,
                academicYearId,
                item.categoryOrMonth,
                item.amount,
                item.paymentDate
              );
            }
            successCount++;
          } catch (e) {
            console.error('Failed to apply payment item:', item, e);
            failCount++;
          }
        })
      );
      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total);
      }
    }

    return { successCount, failCount };
  }
};

