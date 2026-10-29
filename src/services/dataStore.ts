import initialData from '../data/initialExcelData.json';
import {
  Student,
  StudentEnrollment,
  AcademicYear,
  BillingCategory,
  Bill,
  Payment,
  PaymentAllocation,
  BillStatus
} from '../types/database';

const STORAGE_KEY = 'al_quraniyyah_sdit_finance_v1';

interface LocalState {
  academic_years: AcademicYear[];
  categories: BillingCategory[];
  students: Student[];
  enrollments: StudentEnrollment[];
  bills: Bill[];
  payments: Payment[];
  payment_allocations: PaymentAllocation[];
}

function loadState(): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load from localStorage', e);
  }

  // Initial state from real Excel parsed data!
  const state: LocalState = {
    academic_years: initialData.academic_years as AcademicYear[],
    categories: initialData.categories as BillingCategory[],
    students: initialData.students as Student[],
    enrollments: initialData.enrollments as StudentEnrollment[],
    bills: initialData.bills as Bill[],
    payments: initialData.payments as Payment[],
    payment_allocations: initialData.payment_allocations as PaymentAllocation[],
  };

  saveState(state);
  return state;
}

function saveState(state: LocalState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
}

let currentState: LocalState = loadState();

export const localStore = {
  getState(): LocalState {
    return currentState;
  },

  getAcademicYears(): AcademicYear[] {
    return currentState.academic_years;
  },

  saveAcademicYear(year: AcademicYear) {
    const idx = currentState.academic_years.findIndex((y) => y.id === year.id);
    if (idx >= 0) {
      currentState.academic_years[idx] = year;
    } else {
      currentState.academic_years.push(year);
    }
    saveState(currentState);
  },

  getCategories(): BillingCategory[] {
    return currentState.categories;
  },

  addCategory(cat: BillingCategory) {
    currentState.categories.push(cat);
    saveState(currentState);
  },

  getStudents(): Student[] {
    return currentState.students;
  },

  getEnrollments(): StudentEnrollment[] {
    return currentState.enrollments;
  },

  saveStudent(student: Student, enrollment?: StudentEnrollment) {
    const sIdx = currentState.students.findIndex((s) => s.id === student.id);
    if (sIdx >= 0) {
      currentState.students[sIdx] = student;
    } else {
      currentState.students.push(student);
    }

    if (enrollment) {
      const eIdx = currentState.enrollments.findIndex(
        (e) => e.student_id === enrollment.student_id && e.academic_year_id === enrollment.academic_year_id
      );
      if (eIdx >= 0) {
        currentState.enrollments[eIdx] = enrollment;
      } else {
        currentState.enrollments.push(enrollment);
      }
    }
    saveState(currentState);
  },

  getBills(): Bill[] {
    return currentState.bills;
  },

  saveBill(bill: Bill) {
    const idx = currentState.bills.findIndex((b) => b.id === bill.id);
    if (idx >= 0) {
      currentState.bills[idx] = bill;
    } else {
      currentState.bills.push(bill);
    }
    saveState(currentState);
  },

  saveBills(newBills: Bill[]) {
    currentState.bills.push(...newBills);
    saveState(currentState);
  },

  deleteBill(id: string) {
    currentState.bills = currentState.bills.filter((b) => b.id !== id);
    currentState.payment_allocations = currentState.payment_allocations.filter((a) => a.bill_id !== id);
    saveState(currentState);
  },

  deleteStudent(id: string) {
    currentState.students = currentState.students.filter((s) => s.id !== id);
    currentState.enrollments = currentState.enrollments.filter((e) => e.student_id !== id);
    currentState.bills = currentState.bills.filter((b) => b.student_id !== id);
    currentState.payments = currentState.payments.filter((p) => p.student_id !== id);
    saveState(currentState);
  },

  getPayments(): Payment[] {
    return currentState.payments;
  },

  getAllocations(): PaymentAllocation[] {
    return currentState.payment_allocations;
  },

  recordPayment(payment: Payment, allocations: PaymentAllocation[]) {
    currentState.payments.unshift(payment);
    currentState.payment_allocations.push(...allocations);

    // Update bill statuses
    for (const alloc of allocations) {
      const bIdx = currentState.bills.findIndex((b) => b.id === alloc.bill_id);
      if (bIdx >= 0) {
        const b = currentState.bills[bIdx];
        const validAllocations = currentState.payment_allocations.filter(
          (a) => a.bill_id === b.id && currentState.payments.find((p) => p.id === a.payment_id)?.status === 'valid'
        );
        const totalPaid = validAllocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
        if (b.status !== 'Bebas') {
          if (totalPaid >= Number(b.amount)) {
            b.status = 'Lunas';
          } else if (totalPaid > 0) {
            b.status = 'Belum Lunas';
          } else {
            b.status = 'Belum Dibayar';
          }
        }
      }
    }
    saveState(currentState);
  },

  // Direct In-Cell Update for SPP month like Excel!
  updateSppCell(
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
  ) {
    let bill = currentState.bills.find(
      (b) =>
        b.student_id === studentId &&
        b.academic_year_id === academicYearId &&
        b.category_id === 'cat-spp' &&
        b.billing_period?.toLowerCase() === month.toLowerCase()
    );

    if (!bill) {
      // Find default SPP amount for this student
      const existingSpp = currentState.bills.find(
        (b) => b.student_id === studentId && b.category_id === 'cat-spp'
      );
      const defaultAmount = existingSpp ? existingSpp.amount : 1335000;

      bill = {
        id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        student_id: studentId,
        academic_year_id: academicYearId,
        category_id: 'cat-spp',
        billing_period: month,
        amount: defaultAmount,
        status: data.status,
        description: `SPP Bulan ${month}`,
        created_at: new Date().toISOString(),
      };
      currentState.bills.push(bill);
    }

    // Remove existing valid allocations for this bill
    const oldAllocations = currentState.payment_allocations.filter((a) => a.bill_id === bill!.id);
    const oldPaymentIds = new Set(oldAllocations.map((a) => a.payment_id));

    currentState.payment_allocations = currentState.payment_allocations.filter((a) => a.bill_id !== bill!.id);
    // Mark old payments cancelled
    currentState.payments.forEach((p) => {
      if (oldPaymentIds.has(p.id)) {
        p.status = 'cancelled';
      }
    });

    bill.status = data.status;

    if ((data.status === 'Lunas' || data.status === 'Belum Lunas') && data.paymentDate) {
      const payAmount = data.amount || bill.amount;
      const dateStr = data.paymentDate.replace(/-/g, '');
      const trxNum = `TRX-${dateStr}-SPP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newPmt: Payment = {
        id: `pmt-${Date.now()}`,
        transaction_number: trxNum,
        student_id: studentId,
        payment_date: data.paymentDate,
        amount: payAmount,
        payment_method: data.paymentMethod || 'Tunai',
        notes: data.notes || (payAmount < bill.amount ? `ACC Sebagian SPP ${month} (Cicilan/Dispensasi)` : `Pembayaran SPP ${month} (Edit Langsung)`),
        created_by: 'Petugas Keuangan',
        status: 'valid',
        created_at: new Date().toISOString(),
      };

      const newAlloc: PaymentAllocation = {
        id: `pa-${Date.now()}`,
        payment_id: newPmt.id,
        bill_id: bill.id,
        allocated_amount: payAmount,
        created_at: new Date().toISOString(),
      };

      currentState.payments.unshift(newPmt);
      currentState.payment_allocations.push(newAlloc);

      if (payAmount >= bill.amount) {
        bill.status = 'Lunas';
      } else {
        bill.status = 'Belum Lunas';
      }
    }

    saveState(currentState);
  },

  // Direct In-Cell Update for Non-SPP (Perlengkapan, Peralatan, Kegiatan, Pembangunan, Ujian, Lainnya)
  updateNonSppCell(
    studentId: string,
    academicYearId: string,
    categoryName: string,
    paidAmount: number,
    paymentDate: string = new Date().toISOString().split('T')[0]
  ) {
    let cat = currentState.categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!cat) {
      cat = {
        id: `cat-${categoryName.toLowerCase()}`,
        name: categoryName,
        category_type: 'one_time',
        order_index: currentState.categories.length + 1,
        is_active: true,
      };
      currentState.categories.push(cat);
    }

    let bill = currentState.bills.find(
      (b) =>
        b.student_id === studentId &&
        b.academic_year_id === academicYearId &&
        b.category_id === cat!.id
    );

    if (!bill) {
      bill = {
        id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        student_id: studentId,
        academic_year_id: academicYearId,
        category_id: cat.id,
        billing_period: null,
        amount: paidAmount > 0 ? paidAmount : 1000000,
        status: 'Belum Dibayar',
        description: `Tagihan ${categoryName}`,
        created_at: new Date().toISOString(),
      };
      currentState.bills.push(bill);
    }

    // Remove old allocations for this bill
    const oldAllocations = currentState.payment_allocations.filter((a) => a.bill_id === bill!.id);
    const oldPaymentIds = new Set(oldAllocations.map((a) => a.payment_id));
    currentState.payment_allocations = currentState.payment_allocations.filter((a) => a.bill_id !== bill!.id);
    currentState.payments.forEach((p) => {
      if (oldPaymentIds.has(p.id)) p.status = 'cancelled';
    });

    if (paidAmount > 0) {
      const dateStr = paymentDate.replace(/-/g, '');
      const trxNum = `TRX-${dateStr}-${categoryName.substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newPmt: Payment = {
        id: `pmt-${Date.now()}`,
        transaction_number: trxNum,
        student_id: studentId,
        payment_date: paymentDate,
        amount: paidAmount,
        payment_method: 'Tunai',
        notes: `Pembayaran ${categoryName} (Edit Langsung)`,
        created_by: 'Petugas Keuangan',
        status: 'valid',
        created_at: new Date().toISOString(),
      };

      const newAlloc: PaymentAllocation = {
        id: `pa-${Date.now()}`,
        payment_id: newPmt.id,
        bill_id: bill.id,
        allocated_amount: paidAmount,
        created_at: new Date().toISOString(),
      };

      currentState.payments.unshift(newPmt);
      currentState.payment_allocations.push(newAlloc);

      bill.status = paidAmount >= bill.amount ? 'Lunas' : 'Belum Lunas';
    } else {
      bill.status = 'Belum Dibayar';
    }

    saveState(currentState);
  },

  cancelPayment(paymentId: string, reason: string) {
    const pIdx = currentState.payments.findIndex((p) => p.id === paymentId);
    if (pIdx >= 0) {
      currentState.payments[pIdx].status = 'cancelled';
      currentState.payments[pIdx].notes = `[Dibatalkan: ${reason}] ${currentState.payments[pIdx].notes || ''}`;

      const affectedAllocations = currentState.payment_allocations.filter((a) => a.payment_id === paymentId);
      for (const alloc of affectedAllocations) {
        const bIdx = currentState.bills.findIndex((b) => b.id === alloc.bill_id);
        if (bIdx >= 0) {
          const b = currentState.bills[bIdx];
          const validAllocations = currentState.payment_allocations.filter(
            (a) => a.bill_id === b.id && currentState.payments.find((p) => p.id === a.payment_id)?.status === 'valid'
          );
          const totalPaid = validAllocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
          if (b.status !== 'Bebas') {
            if (totalPaid >= Number(b.amount)) {
              b.status = 'Lunas';
            } else if (totalPaid > 0) {
              b.status = 'Belum Lunas';
            } else {
              b.status = 'Belum Dibayar';
            }
          }
        }
      }
      saveState(currentState);
    }
  },

  resetToInitialExcel() {
    currentState = {
      academic_years: initialData.academic_years as AcademicYear[],
      categories: initialData.categories as BillingCategory[],
      students: initialData.students as Student[],
      enrollments: initialData.enrollments as StudentEnrollment[],
      bills: initialData.bills as Bill[],
      payments: initialData.payments as Payment[],
      payment_allocations: initialData.payment_allocations as PaymentAllocation[],
    };
    saveState(currentState);
  }
};
