import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Student, StudentEnrollment, UnitType, AdministrativeStatus, StudentStatus } from '../types/database';
import { localStore } from './dataStore';

export interface StudentFilter {
  academicYearId?: string;
  unit?: UnitType | 'ALL';
  grade?: string | 'ALL';
  studentStatus?: StudentStatus | 'ALL';
  administrativeStatus?: AdministrativeStatus | 'ALL';
  search?: string;
}

function getLocalStudentsWithEnrollment(filters: StudentFilter = {}): Student[] {
  const allStudents = localStore.getStudents();
  const allEnrollments = localStore.getEnrollments();
  const allYears = localStore.getAcademicYears();

  let mapped: Student[] = allStudents.map((s) => {
    let current_enrollment: StudentEnrollment | undefined;
    const enrollments = allEnrollments.filter((e) => e.student_id === s.id);

    if (filters.academicYearId) {
      current_enrollment = enrollments.find(
        (e) => e.academic_year_id === filters.academicYearId
      );
    } else {
      current_enrollment = enrollments.find(
        (e) => allYears.find((y) => y.id === e.academic_year_id)?.status === 'active'
      ) || enrollments[0];
    }

    return {
      ...s,
      current_enrollment,
    };
  });

  if (filters.studentStatus && filters.studentStatus !== 'ALL') {
    mapped = mapped.filter((s) => s.student_status === filters.studentStatus);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    mapped = mapped.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.nis && s.nis.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
  }

  if (filters.academicYearId) {
    mapped = mapped.filter((s) => s.current_enrollment !== undefined);
  }

  if (filters.unit && filters.unit !== 'ALL') {
    mapped = mapped.filter((s) => s.current_enrollment?.unit === filters.unit);
  }

  if (filters.grade && filters.grade !== 'ALL') {
    mapped = mapped.filter((s) => s.current_enrollment?.grade === filters.grade);
  }

  if (filters.administrativeStatus && filters.administrativeStatus !== 'ALL') {
    mapped = mapped.filter(
      (s) => s.current_enrollment?.administrative_status === filters.administrativeStatus
    );
  }

  return mapped;
}

export const studentService = {
  async getAllWithEnrollment(filters: StudentFilter = {}): Promise<Student[]> {
    if (!isSupabaseConfigured) {
      return getLocalStudentsWithEnrollment(filters);
    }

    try {
      let allStudentsData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
          .from('students')
          .select(`
            *,
            student_enrollments (
              id,
              student_id,
              academic_year_id,
              unit,
              grade,
              administrative_status,
              notes,
              academic_years (
                id,
                name,
                status
              )
            )
          `)
          .order('full_name', { ascending: true });

        if (filters.studentStatus && filters.studentStatus !== 'ALL') {
          query = query.eq('student_status', filters.studentStatus);
        }

        if (filters.search) {
          const term = `%${filters.search}%`;
          query = query.or(`full_name.ilike.${term},nis.ilike.${term},phone.ilike.${term}`);
        }

        query = query.range(from, to);

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allStudentsData = allStudentsData.concat(data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      let students: Student[] = allStudentsData.map((s: any) => {
        let current_enrollment: StudentEnrollment | undefined;
        const enrollments = s.student_enrollments || [];

        if (filters.academicYearId) {
          current_enrollment = enrollments.find(
            (e: any) => e.academic_year_id === filters.academicYearId
          );
        } else {
          current_enrollment = enrollments.find(
            (e: any) => e.academic_years?.status === 'active'
          ) || enrollments[0];
        }

        return {
          ...s,
          current_enrollment,
        };
      });

      if (filters.academicYearId) {
        students = students.filter((s) => s.current_enrollment !== undefined);
      }

      if (filters.unit && filters.unit !== 'ALL') {
        students = students.filter((s) => s.current_enrollment?.unit === filters.unit);
      }

      if (filters.grade && filters.grade !== 'ALL') {
        students = students.filter((s) => s.current_enrollment?.grade === filters.grade);
      }

      if (filters.administrativeStatus && filters.administrativeStatus !== 'ALL') {
        students = students.filter(
          (s) => s.current_enrollment?.administrative_status === filters.administrativeStatus
        );
      }

      return students;
    } catch (err) {
      console.warn('Supabase fetch failed, using local store:', err);
      return getLocalStudentsWithEnrollment(filters);
    }
  },

  async getById(id: string): Promise<Student | null> {
    if (!isSupabaseConfigured) {
      const s = localStore.getStudents().find((st) => st.id === id);
      if (!s) return null;
      const enrollments = localStore.getEnrollments().filter((e) => e.student_id === id);
      return {
        ...s,
        current_enrollment: enrollments[0],
      };
    }

    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          student_enrollments (
            id,
            student_id,
            academic_year_id,
            unit,
            grade,
            administrative_status,
            notes,
            academic_years (
              id,
              name,
              status
            )
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      const s = localStore.getStudents().find((st) => st.id === id);
      return s || null;
    }
  },

  async create(studentData: {
    nis?: string | null;
    full_name: string;
    gender: 'Laki-laki' | 'Perempuan';
    phone?: string | null;
    student_status?: StudentStatus;
    notes?: string | null;
    enrollment?: {
      academic_year_id: string;
      unit: UnitType;
      grade: string;
      administrative_status: AdministrativeStatus;
      notes?: string | null;
    };
  }): Promise<Student> {
    if (!isSupabaseConfigured) {
      const newStudent: Student = {
        id: `std-${Date.now()}`,
        nis: studentData.nis || null,
        full_name: studentData.full_name,
        gender: studentData.gender,
        phone: studentData.phone || null,
        student_status: studentData.student_status || 'aktif',
        notes: studentData.notes || null,
        created_at: new Date().toISOString(),
      };

      let newEnr: StudentEnrollment | undefined;
      if (studentData.enrollment) {
        newEnr = {
          id: `enr-${Date.now()}`,
          student_id: newStudent.id,
          academic_year_id: studentData.enrollment.academic_year_id,
          unit: studentData.enrollment.unit,
          grade: studentData.enrollment.grade,
          administrative_status: studentData.enrollment.administrative_status,
          notes: studentData.enrollment.notes || null,
        };
      }

      localStore.saveStudent(newStudent, newEnr);
      return { ...newStudent, current_enrollment: newEnr };
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert([{
        nis: studentData.nis || null,
        full_name: studentData.full_name,
        gender: studentData.gender,
        phone: studentData.phone || null,
        student_status: studentData.student_status || 'aktif',
        notes: studentData.notes || null,
      }])
      .select()
      .single();

    if (studentError) throw studentError;

    if (studentData.enrollment) {
      const { error: enrollError } = await supabase
        .from('student_enrollments')
        .insert([{
          student_id: student.id,
          academic_year_id: studentData.enrollment.academic_year_id,
          unit: studentData.enrollment.unit,
          grade: studentData.enrollment.grade,
          administrative_status: studentData.enrollment.administrative_status,
          notes: studentData.enrollment.notes || null,
        }]);

      if (enrollError) throw enrollError;
    }

    return student;
  },

  async update(id: string, updates: Partial<Student>): Promise<Student> {
    if (!isSupabaseConfigured) {
      const existing = localStore.getStudents().find((s) => s.id === id);
      if (!existing) throw new Error('Student not found');
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      localStore.saveStudent(updated);
      return updated;
    }

    const { data, error } = await supabase
      .from('students')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async upsertEnrollment(enrollment: {
    student_id: string;
    academic_year_id: string;
    unit: UnitType;
    grade: string;
    administrative_status: AdministrativeStatus;
    notes?: string | null;
  }): Promise<StudentEnrollment> {
    if (!isSupabaseConfigured) {
      const newEnr: StudentEnrollment = {
        id: `enr-${Date.now()}`,
        ...enrollment,
      };
      const student = localStore.getStudents().find((s) => s.id === enrollment.student_id);
      if (student) {
        localStore.saveStudent(student, newEnr);
      }
      return newEnr;
    }

    const { data, error } = await supabase
      .from('student_enrollments')
      .upsert([enrollment], { onConflict: 'student_id,academic_year_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    if (!isSupabaseConfigured) {
      localStore.deleteStudent(id);
      return;
    }

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async setStudentStatus(id: string, status: StudentStatus): Promise<void> {
    if (!isSupabaseConfigured) {
      const student = localStore.getStudents().find(s => s.id === id);
      if (student) student.student_status = status;
      return;
    }

    const { error } = await supabase
      .from('students')
      .update({ student_status: status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }
};
