-- ==============================================================================
-- IZINKAN ANON / PUBLIC WRITE AKSES DI SUPABASE
-- Jalankan query ini di Supabase SQL Editor jika aplikasi web diakses tanpa login
-- ==============================================================================

-- 1. Berikan hak akses penuh kepada role anon & authenticated
GRANT ALL ON TABLE academic_years TO anon, authenticated;
GRANT ALL ON TABLE students TO anon, authenticated;
GRANT ALL ON TABLE student_enrollments TO anon, authenticated;
GRANT ALL ON TABLE billing_categories TO anon, authenticated;
GRANT ALL ON TABLE bills TO anon, authenticated;
GRANT ALL ON TABLE payments TO anon, authenticated;
GRANT ALL ON TABLE payment_allocations TO anon, authenticated;
GRANT ALL ON TABLE audit_logs TO anon, authenticated;

-- 2. Kebijakan RLS untuk publik (anon & authenticated)
DROP POLICY IF EXISTS "Allow anon read to academic_years" ON academic_years;
DROP POLICY IF EXISTS "Allow anon read to students" ON students;
DROP POLICY IF EXISTS "Allow anon read to student_enrollments" ON student_enrollments;
DROP POLICY IF EXISTS "Allow anon read to billing_categories" ON billing_categories;
DROP POLICY IF EXISTS "Allow anon read to bills" ON bills;
DROP POLICY IF EXISTS "Allow anon read to payments" ON payments;
DROP POLICY IF EXISTS "Allow anon read to payment_allocations" ON payment_allocations;

CREATE POLICY "Allow public all access to academic_years" ON academic_years FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to students" ON students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to student_enrollments" ON student_enrollments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to billing_categories" ON billing_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to bills" ON bills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to payments" ON payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to payment_allocations" ON payment_allocations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to audit_logs" ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
