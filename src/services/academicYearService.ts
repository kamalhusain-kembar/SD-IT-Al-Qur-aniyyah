import { supabase } from '../lib/supabase';
import { AcademicYear } from '../types/database';

export const academicYearService = {
  async getAll(): Promise<AcademicYear[]> {
    const { data, error } = await supabase
      .from('academic_years')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getActive(): Promise<AcademicYear | null> {
    const { data, error } = await supabase
      .from('academic_years')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async create(year: Omit<AcademicYear, 'id' | 'created_at' | 'updated_at'>): Promise<AcademicYear> {
    const { data, error } = await supabase
      .from('academic_years')
      .insert([year])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<AcademicYear>): Promise<AcademicYear> {
    const { data, error } = await supabase
      .from('academic_years')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async setActive(id: string): Promise<void> {
    // Set all to archived or keep them, but ensure this one is active
    await supabase
      .from('academic_years')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .neq('id', id);

    const { error } = await supabase
      .from('academic_years')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }
};
