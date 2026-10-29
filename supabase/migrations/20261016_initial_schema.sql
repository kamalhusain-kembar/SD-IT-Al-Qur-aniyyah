-- ==============================================================================
-- SISTEM ADMINISTRASI KEUANGAN SISWA AL-QUR'ANIYYAH
-- SQL Schema Migration: Initial Database Structure
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ACADEMIC YEARS
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE, -- e.g. '2026/2027'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. STUDENTS (Permanent identity across all academic years)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nis VARCHAR(50),
    full_name VARCHAR(255) NOT NULL,
    gender VARCHAR(20) CHECK (gender IN ('Laki-laki', 'Perempuan', 'L', 'P')),
    phone VARCHAR(50),
    student_status VARCHAR(30) NOT NULL DEFAULT 'aktif' CHECK (student_status IN ('aktif', 'lulus', 'pindah', 'nonaktif')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_nis ON students(nis);
CREATE INDEX IF NOT EXISTS idx_students_full_name ON students(full_name);

-- 3. STUDENT ENROLLMENTS (Class, Unit, and Status per Academic Year)
CREATE TABLE IF NOT EXISTS student_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    unit VARCHAR(50) NOT NULL, -- 'TK IT', 'SD IT', 'SMP IT', 'SMA IT'
    grade VARCHAR(20) NOT NULL, -- 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', etc.
    administrative_status VARCHAR(50) NOT NULL DEFAULT 'Mampu', -- 'Mampu', 'Yatim', 'Dhuafa', 'Beasiswa', 'Rekomendasi'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_student_academic_year UNIQUE (student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_year ON student_enrollments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_unit_grade ON student_enrollments(unit, grade);

-- 4. BILLING CATEGORIES
CREATE TABLE IF NOT EXISTS billing_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 'SPP', 'Perlengkapan', 'Peralatan', 'Kegiatan', 'Pembangunan', 'Ujian', 'Buku Paket', 'Lainnya'
    category_type VARCHAR(30) NOT NULL DEFAULT 'one_time' CHECK (category_type IN ('monthly', 'one_time')),
    order_index INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Billing Categories
INSERT INTO billing_categories (name, category_type, order_index, is_active)
VALUES
    ('SPP', 'monthly', 1, true),
    ('Perlengkapan', 'one_time', 2, true),
    ('Peralatan', 'one_time', 3, true),
    ('Kegiatan', 'one_time', 4, true),
    ('Pembangunan', 'one_time', 5, true),
    ('Ujian', 'one_time', 6, true),
    ('Buku Paket', 'one_time', 7, true),
    ('Lainnya', 'one_time', 8, true)
ON CONFLICT (name) DO NOTHING;

-- 5. BILLS
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES billing_categories(id) ON DELETE RESTRICT,
    billing_period VARCHAR(50), -- 'Juli', 'Agustus', ..., 'Juni' for monthly SPP, NULL for one_time
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Belum Dibayar' CHECK (status IN ('Belum Dibayar', 'Belum Lunas', 'Lunas', 'Bebas')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_student ON bills(student_id);
CREATE INDEX IF NOT EXISTS idx_bills_academic_year ON bills(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(billing_period);

-- 6. PAYMENTS (Header transaction)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(100) NOT NULL UNIQUE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) DEFAULT 'Tunai',
    notes TEXT,
    created_by TEXT, -- Auth user ID or display name
    status VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 7. PAYMENT ALLOCATIONS (Item allocation linking payment to specific bill)
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(14, 2) NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_bill ON payment_allocations(bill_id);

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'IMPORT'
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- 9. VIEW FOR BILL SUMMARY (Calculates total paid and remaining balance)
CREATE OR REPLACE VIEW view_bill_details AS
SELECT 
    b.id AS bill_id,
    b.student_id,
    b.academic_year_id,
    b.category_id,
    b.billing_period,
    b.amount AS bill_amount,
    b.due_date,
    b.description,
    b.status AS raw_status,
    COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0) AS total_paid,
    (b.amount - COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0)) AS remaining_amount,
    CASE 
        WHEN b.status = 'Bebas' THEN 'Bebas'
        WHEN COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0) >= b.amount AND b.amount > 0 THEN 'Lunas'
        WHEN COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0) > 0 THEN 'Belum Lunas'
        ELSE 'Belum Dibayar'
    END AS calculated_status
FROM bills b
LEFT JOIN payment_allocations pa ON b.id = pa.bill_id
LEFT JOIN payments p ON pa.payment_id = p.id
GROUP BY b.id;

-- 10. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full read/write access
CREATE POLICY "Allow authenticated full access to academic_years" ON academic_years FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to students" ON students FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to student_enrollments" ON student_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to billing_categories" ON billing_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to bills" ON bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to payments" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to payment_allocations" ON payment_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to audit_logs" ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon read/write if project enables anon key (configurable)
CREATE POLICY "Allow anon read to academic_years" ON academic_years FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read to students" ON students FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read to student_enrollments" ON student_enrollments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read to billing_categories" ON billing_categories FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read to bills" ON bills FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read to payments" ON payments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read to payment_allocations" ON payment_allocations FOR SELECT TO anon USING (true);
