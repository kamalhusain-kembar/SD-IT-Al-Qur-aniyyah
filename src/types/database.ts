// ==============================================================================
// TIPE DATA DATABASE TK IT & SD IT AL-QUR'ANIYYAH
// ==============================================================================

export type Gender = 'Laki-laki' | 'Perempuan';
export type StudentStatus = 'aktif' | 'lulus' | 'pindah' | 'nonaktif';
export type UnitType = 'TK IT' | 'SD IT';
export type GradeType = 'Kelompok A' | 'Kelompok B' | 'Kel. A' | 'Kel. B' | 'TK A' | 'TK B' | 'A' | 'B' | 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
export type AdministrativeStatus = 'Mampu' | 'Yatim' | 'Dhuafa' | 'Beasiswa' | 'Rekomendasi';
export type BillStatus = 'Belum Dibayar' | 'Belum Lunas' | 'Lunas' | 'Bebas' | 'Akan Berlangsung';
export type PaymentStatus = 'valid' | 'cancelled';
export type AcademicYearStatus = 'active' | 'archived';
export type CategoryType = 'monthly' | 'one_time';

export const TK_GRADES: string[] = ['Kelompok A', 'Kelompok B'];
export const SDIT_GRADES: string[] = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const ALL_UNIT_GRADES: Record<UnitType, string[]> = {
  'TK IT': ['Kelompok A', 'Kelompok B'],
  'SD IT': ['I', 'II', 'III', 'IV', 'V', 'VI']
};

/**
 * Normalisasi parameter kelas agar kompatibel antara 'Kelompok A', 'Kel. A', 'TK A', dan 'A'
 */
export function normalizeGrade(grade?: string | null, unit?: string | null): string {
  if (!grade) return '-';
  const g = grade.trim();
  const isTK = unit === 'TK IT' || /^(kel|tk)/i.test(g) || g === 'A' || g === 'B';
  if (isTK) {
    if (/^(kelompok\s*a|kel\.?\s*a|tk\s*a|^a$)/i.test(g)) return 'Kelompok A';
    if (/^(kelompok\s*b|kel\.?\s*b|tk\s*b|^b$)/i.test(g)) return 'Kelompok B';
  }
  return g;
}

/**
 * Format label tampilan kelas untuk UI:
 * TK IT -> "Kelompok A"
 * SD IT -> "Kelas I"
 */
export function formatGradeDisplay(grade?: string | null, unit?: string | null): string {
  if (!grade || grade === '-') return '-';
  const norm = normalizeGrade(grade, unit);
  if (unit === 'TK IT' || norm.startsWith('Kelompok')) {
    return norm;
  }
  return `Kelas ${norm}`;
}

/**
 * Cek apakah kelas siswa cocok dengan filter pencarian
 */
export function isGradeMatch(studentGrade?: string | null, filterGrade?: string, unit?: string | null): boolean {
  if (!filterGrade || filterGrade === 'ALL') return true;
  if (!studentGrade) return false;
  
  const normStudent = normalizeGrade(studentGrade, unit);
  const normFilter = normalizeGrade(filterGrade, unit);
  
  if (normStudent.toLowerCase() === normFilter.toLowerCase()) return true;
  if (studentGrade.trim().toLowerCase() === filterGrade.trim().toLowerCase()) return true;
  return false;
}

export interface AcademicYear {
  id: string;
  name: string; // e.g. "2026/2027"
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Student {
  id: string;
  nis: string | null;
  full_name: string;
  gender: Gender;
  phone: string | null;
  student_status: StudentStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  current_enrollment?: StudentEnrollment;
}

export interface StudentEnrollment {
  id: string;
  student_id: string;
  academic_year_id: string;
  unit: UnitType;
  grade: GradeType | string;
  administrative_status: AdministrativeStatus;
  notes?: string | null;
  created_at?: string;
  academic_year?: AcademicYear;
  student?: Student;
}

export interface BillingCategory {
  id: string;
  name: string;
  category_type: CategoryType;
  order_index: number;
  is_active: boolean;
  created_at?: string;
}

export interface Bill {
  id: string;
  student_id: string;
  academic_year_id: string;
  category_id: string;
  billing_period: string | null; // e.g. "Juli", "Agustus" ... "Juni"
  amount: number;
  due_date?: string | null;
  status: BillStatus;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  category?: BillingCategory;
  student?: Student;
  academic_year?: AcademicYear;
  total_paid?: number;
  remaining_amount?: number;
  calculated_status?: BillStatus;
  last_payment_date?: string | null;
}

export interface Payment {
  id: string;
  transaction_number: string;
  student_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  notes?: string | null;
  created_by?: string | null;
  status: PaymentStatus;
  created_at?: string;
  updated_at?: string;
  student?: Student;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  bill_id: string;
  allocated_amount: number;
  created_at?: string;
  bill?: Bill;
}

export interface StudentYearlyArrears {
  academic_year_id: string;
  academic_year_name: string;
  grade: string;
  unit: string;
  total_bills: number;
  total_paid: number;
  remaining_arrears: number;
  unpaid_bills_count: number;
  bills_detail: {
    bill_id: string;
    category_name: string;
    billing_period: string | null;
    amount: number;
    paid: number;
    remaining: number;
    status: BillStatus;
  }[];
}

export interface StudentCrossYearArrears {
  student: Student;
  current_unit?: string;
  current_grade?: string;
  years: StudentYearlyArrears[];
  grand_total_bills: number;
  grand_total_paid: number;
  grand_total_arrears: number;
}
