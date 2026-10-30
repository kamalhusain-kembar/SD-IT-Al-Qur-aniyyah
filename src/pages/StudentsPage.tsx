import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Edit2,
  Eye,
  Trash2,
  Phone,
  MessageCircle,
  CheckCircle,
  X,
  FileSpreadsheet,
  Download,
  AlertCircle,
  UserX
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentService, StudentFilter } from '../services/studentService';
import { Student, UnitType, AdministrativeStatus, StudentStatus, Gender, formatGradeDisplay, TK_GRADES, SDIT_GRADES } from '../types/database';
import { billingService } from '../services/billingService';
import * as XLSX from 'xlsx';

export const StudentsPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey } = useApp();

  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<UnitType | 'ALL'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<AdministrativeStatus | 'ALL'>('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentStatus | 'ALL'>('aktif');

  // Modal Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    nis: '',
    full_name: '',
    gender: 'Laki-laki' as Gender,
    phone: '',
    student_status: 'aktif' as StudentStatus,
    unit: 'SD IT' as UnitType,
    grade: 'I',
    administrative_status: 'Mampu' as AdministrativeStatus,
    spp_nominal: '1335000',
    notes: '',
  });

  // Modal Santri Berhenti / Nonaktif
  const [dropoutStudent, setDropoutStudent] = useState<Student | null>(null);
  const [dropoutMonth, setDropoutMonth] = useState('November');
  const [dropoutStatus, setDropoutStatus] = useState<'nonaktif' | 'pindah'>('nonaktif');
  const [dropoutAction, setDropoutAction] = useState<'bebas' | 'delete'>('bebas');
  const [isDropoutSubmitting, setIsDropoutSubmitting] = useState(false);

  // Modal Student Detail / Profile
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [detailBills, setDetailBills] = useState<any[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const filters: StudentFilter = {
        academicYearId: selectedAcademicYearId || undefined,
        unit: unitFilter,
        grade: gradeFilter,
        administrativeStatus: statusFilter,
        studentStatus: studentStatusFilter,
        search: search.trim() || undefined,
      };

      const data = await studentService.getAllWithEnrollment(filters);
      setStudents(data);
    } catch (err: any) {
      console.error('Error loading students:', err);
      showToast('Gagal memuat data siswa: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [selectedAcademicYearId, unitFilter, gradeFilter, statusFilter, studentStatusFilter, search, refreshKey]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormData({
      nis: '',
      full_name: '',
      gender: 'Laki-laki',
      phone: '',
      student_status: 'aktif',
      unit: unitFilter !== 'ALL' ? unitFilter : 'SD IT',
      grade: gradeFilter !== 'ALL' ? gradeFilter : (unitFilter === 'TK IT' ? 'Kelompok A' : 'I'),
      administrative_status: 'Mampu',
      spp_nominal: '1335000',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    const enr = student.current_enrollment;
    setFormData({
      nis: student.nis || '',
      full_name: student.full_name,
      gender: student.gender,
      phone: student.phone || '',
      student_status: student.student_status,
      unit: enr?.unit || 'SD IT',
      grade: enr?.grade || 'I',
      administrative_status: enr?.administrative_status || 'Mampu',
      spp_nominal: '1335000',
      notes: student.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      showToast('Nama siswa wajib diisi', 'error');
      return;
    }

    try {
      if (editingStudent) {
        // Update existing student
        await studentService.update(editingStudent.id, {
          nis: formData.nis.trim() || null,
          full_name: formData.full_name.trim(),
          gender: formData.gender,
          phone: formData.phone.trim() || null,
          student_status: formData.student_status,
          notes: formData.notes.trim() || null,
        });

        // Update or insert enrollment for this academic year
        if (selectedAcademicYearId) {
          await studentService.upsertEnrollment({
            student_id: editingStudent.id,
            academic_year_id: selectedAcademicYearId,
            unit: formData.unit,
            grade: formData.grade,
            administrative_status: formData.administrative_status,
          });
        }

        showToast('Data siswa berhasil diperbarui', 'success');
      } else {
        // Create new student
        const created = await studentService.create({
          nis: formData.nis.trim() || null,
          full_name: formData.full_name.trim(),
          gender: formData.gender,
          phone: formData.phone.trim() || null,
          student_status: formData.student_status,
          notes: formData.notes.trim() || null,
          enrollment: selectedAcademicYearId
            ? {
                academic_year_id: selectedAcademicYearId,
                unit: formData.unit,
                grade: formData.grade,
                administrative_status: formData.administrative_status,
              }
            : undefined,
        });

        // Generate 12 months SPP if academic year selected
        if (selectedAcademicYearId && Number(formData.spp_nominal) >= 0) {
          const categories = await billingService.getCategories();
          const sppCat = categories.find((c) => c.name === 'SPP') || categories[0];
          if (sppCat) {
            const isFree = formData.administrative_status === 'Yatim' || formData.administrative_status === 'Beasiswa';
            await billingService.generateMonthlySPPForStudent(
              created.id,
              selectedAcademicYearId,
              sppCat.id,
              Number(formData.spp_nominal),
              isFree
            );
          }
        }

        showToast('Siswa baru berhasil ditambahkan beserta tagihan SPP', 'success');
      }

      setIsModalOpen(false);
      loadStudents();
    } catch (err: any) {
      showToast('Gagal menyimpan siswa: ' + err.message, 'error');
    }
  };

  const handleViewDetail = async (student: Student) => {
    setDetailStudent(student);
    setIsLoadingDetail(true);
    try {
      const bills = await billingService.getBillsByStudent(student.id);
      setDetailBills(bills);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleExportExcel = () => {
    if (students.length === 0) {
      showToast('Tidak ada data siswa untuk diexport', 'error');
      return;
    }

    const exportRows = students.map((s, idx) => ({
      'NO': idx + 1,
      'NIS / REKENING': s.nis || '-',
      'NAMA LENGKAP': s.full_name,
      'JENIS KELAMIN': s.gender,
      'JENJANG': s.current_enrollment?.unit || '-',
      'KELAS': s.current_enrollment?.grade || '-',
      'STATUS ADMINISTRASI': s.current_enrollment?.administrative_status || 'Mampu',
      'STATUS SISWA': s.student_status,
      'NO. TELEPON': s.phone || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Siswa');
    XLSX.writeFile(workbook, `Data_Siswa_${selectedAcademicYear?.name.replace('/', '-') || 'Export'}.xlsx`);
    showToast('Data siswa berhasil diexport ke Excel', 'success');
  };

  const SPP_MONTHS = [
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
  ];

  const handleDeleteStudent = async (student: Student) => {
    if (
      !window.confirm(
        `PERINGATAN: Apakah Anda yakin ingin menghapus data siswa "${student.full_name}" (NIS: ${student.nis || '-'}) secara permanen?\n\nSemua riwayat kelas, tagihan, dan pembayaran siswa ini akan ikut terhapus dari sistem.`
      )
    ) {
      return;
    }

    try {
      await studentService.delete(student.id);
      showToast(`Data siswa "${student.full_name}" berhasil dihapus`, 'success');
      loadStudents();
    } catch (err: any) {
      showToast('Gagal menghapus data siswa: ' + err.message, 'error');
    }
  };

  const handleOpenDropout = (student: Student) => {
    setDropoutStudent(student);
    setDropoutMonth('November');
    setDropoutStatus(student.student_status === 'aktif' ? 'nonaktif' : (student.student_status as any));
    setDropoutAction('bebas');
  };

  const handleApplyDropout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropoutStudent || !selectedAcademicYearId) {
      showToast('Pilih tahun ajaran aktif terlebih dahulu', 'error');
      return;
    }

    setIsDropoutSubmitting(true);
    try {
      const res = await billingService.handleStudentDropout(
        dropoutStudent.id,
        selectedAcademicYearId,
        dropoutMonth,
        dropoutAction,
        dropoutStatus
      );

      const actionMsg =
        dropoutAction === 'delete'
          ? 'dihapus'
          : 'dibebaskan (tidak tercatat sebagai tunggakan)';

      showToast(
        `Santri ${dropoutStudent.full_name} diatur menjadi ${dropoutStatus}. Sebanyak ${res.affectedBillsCount} tagihan mendatang berhasil ${actionMsg}.`,
        'success'
      );

      setDropoutStudent(null);
      loadStudents();
    } catch (err: any) {
      showToast('Gagal memproses santri berhenti: ' + err.message, 'error');
    } finally {
      setIsDropoutSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Unified Compact Control Panel */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-800 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-800">Master Data Siswa</h3>
            <span className="text-xs text-slate-400 hidden md:inline">· Identitas permanen lintas tahun ajaran</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Filter Status Siswa */}
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs mr-1">
              <button
                type="button"
                onClick={() => setStudentStatusFilter('aktif')}
                className={`px-2.5 py-1 rounded-md font-bold text-xs transition ${
                  studentStatusFilter === 'aktif'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🟢 Aktif
              </button>
              <button
                type="button"
                onClick={() => setStudentStatusFilter('nonaktif')}
                className={`px-2.5 py-1 rounded-md font-bold text-xs transition ${
                  studentStatusFilter === 'nonaktif'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🔴 Nonaktif
              </button>
              <button
                type="button"
                onClick={() => setStudentStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-md font-bold text-xs transition ${
                  studentStatusFilter === 'ALL'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
            </div>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg sm:rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Siswa</span>
            </button>
          </div>
        </div>

        {/* Search & Compact Responsive Filters */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Search */}
          <div className="relative col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIS, no HP..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-slate-50/50"
            />
          </div>

          {/* Jenjang */}
          <div>
            <select
              value={unitFilter}
              onChange={(e) => {
                const u = e.target.value as any;
                setUnitFilter(u);
                setGradeFilter('ALL');
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Jenjang</option>
              <option value="TK IT">TK IT</option>
              <option value="SD IT">SD IT</option>
            </select>
          </div>

          {/* Kelas */}
          <div>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">
                {unitFilter === 'TK IT' ? 'Semua Kelas TK' : unitFilter === 'SD IT' ? 'Semua Kelas SD' : 'Semua Kelas'}
              </option>
              {unitFilter === 'TK IT' && (
                <>
                  <option value="Kelompok A">Kelompok A</option>
                  <option value="Kelompok B">Kelompok B</option>
                </>
              )}
              {unitFilter === 'SD IT' && (
                <>
                  {SDIT_GRADES.map((g) => (
                    <option key={g} value={g}>Kelas {g}</option>
                  ))}
                </>
              )}
              {unitFilter === 'ALL' && (
                <>
                  <optgroup label="TK IT">
                    <option value="Kelompok A">Kelompok A</option>
                    <option value="Kelompok B">Kelompok B</option>
                  </optgroup>
                  <optgroup label="SD IT">
                    {SDIT_GRADES.map((g) => (
                      <option key={g} value={g}>Kelas {g}</option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
          </div>

          {/* Status Administrasi */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full py-1.5 px-2.5 text-xs font-medium rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="Mampu">Mampu</option>
              <option value="Yatim">Yatim</option>
              <option value="Dhuafa">Dhuafa</option>
              <option value="Beasiswa">Beasiswa</option>
              <option value="Rekomendasi">Rekomendasi</option>
            </select>
          </div>

          {/* Status Siswa (Aktif / Nonaktif / Pindah / Lulus) */}
          <div>
            <select
              value={studentStatusFilter}
              onChange={(e) => setStudentStatusFilter(e.target.value as any)}
              className="w-full py-1.5 px-2.5 text-xs font-semibold rounded-lg sm:rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
            >
              <option value="aktif">🟢 Siswa Aktif</option>
              <option value="nonaktif">🔴 Siswa Nonaktif</option>
              <option value="pindah">🟠 Siswa Pindah</option>
              <option value="lulus">🎓 Siswa Lulus</option>
              <option value="ALL">Semua Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Table with Sticky Pinned Headers */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-210px)] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-2.5 px-3 w-10 text-center sticky left-0 z-30 bg-slate-50 border-r border-slate-200">No</th>
                <th className="py-2.5 px-3.5 sticky left-10 z-30 bg-slate-50 min-w-[170px] border-r border-slate-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">Nama Lengkap</th>
                <th className="py-2.5 px-3">NIS / No Rekening</th>
                <th className="py-2.5 px-2.5 text-center">JK</th>
                <th className="py-2.5 px-3">Jenjang & Kelas</th>
                <th className="py-2.5 px-3">Kategori Administrasi</th>
                <th className="py-2.5 px-3">Kontak / WhatsApp</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Memuat data siswa...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Tidak ditemukan data siswa yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                students.map((student, idx) => {
                  const enr = student.current_enrollment;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {student.full_name}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {student.nis || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {student.gender === 'Laki-laki' ? 'L' : 'P'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">
                        {enr ? `${enr.unit} · ${formatGradeDisplay(enr.grade, enr.unit)}` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            enr?.administrative_status === 'Yatim'
                              ? 'bg-purple-100 text-purple-800'
                              : enr?.administrative_status === 'Beasiswa'
                              ? 'bg-blue-100 text-blue-800'
                              : enr?.administrative_status === 'Dhuafa'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {enr?.administrative_status || 'Mampu'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {student.phone ? (
                          <a
                            href={`https://wa.me/${student.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{student.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            student.student_status === 'aktif'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {student.student_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleViewDetail(student)}
                            title="Lihat Profil & Tagihan"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(student)}
                            title="Edit Data Siswa"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDropout(student)}
                            title="Atur Santri Berhenti / Nonaktif"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-800 hover:bg-amber-50 transition"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            title="Hapus Siswa Permanen"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Student */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h4 className="text-base font-bold text-slate-800">
                {editingStudent ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Contoh: Muhammad Amar"
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    NIS / No Rekening
                  </label>
                  <input
                    type="text"
                    value={formData.nis}
                    onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                    placeholder="Contoh: 00110100518"
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    No. HP / WhatsApp Wali
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Contoh: 628123456789"
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Siswa
                  </label>
                  <select
                    value={formData.student_status}
                    onChange={(e) => setFormData({ ...formData, student_status: e.target.value as StudentStatus })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="lulus">Lulus</option>
                    <option value="pindah">Pindah</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              {/* Enrollment Info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                  Penempatan Tahun Ajaran {selectedAcademicYear?.name || '2026/2027'}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Jenjang</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => {
                        const newUnit = e.target.value as UnitType;
                        const defaultGrade = newUnit === 'TK IT' ? 'Kelompok A' : 'I';
                        setFormData({ ...formData, unit: newUnit, grade: defaultGrade });
                      }}
                      className="w-full text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="TK IT">TK IT</option>
                      <option value="SD IT">SD IT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kelas</label>
                    <select
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      className="w-full text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                      {formData.unit === 'TK IT' ? (
                        <>
                          <option value="Kelompok A">Kelompok A</option>
                          <option value="Kelompok B">Kelompok B</option>
                        </>
                      ) : (
                        <>
                          <option value="I">Kelas I</option>
                          <option value="II">Kelas II</option>
                          <option value="III">Kelas III</option>
                          <option value="IV">Kelas IV</option>
                          <option value="V">Kelas V</option>
                          <option value="VI">Kelas VI</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kategori</label>
                    <select
                      value={formData.administrative_status}
                      onChange={(e) => setFormData({ ...formData, administrative_status: e.target.value as AdministrativeStatus })}
                      className="w-full text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="Mampu">Mampu</option>
                      <option value="Yatim">Yatim</option>
                      <option value="Dhuafa">Dhuafa</option>
                      <option value="Beasiswa">Beasiswa</option>
                      <option value="Rekomendasi">Rekomendasi</option>
                    </select>
                  </div>
                </div>

                {!editingStudent && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tarif SPP Bulanan (Disesuaikan per siswa)
                    </label>
                    <input
                      type="number"
                      value={formData.spp_nominal}
                      onChange={(e) => setFormData({ ...formData, spp_nominal: e.target.value })}
                      placeholder="1335000"
                      className="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Otomatis membuat tagihan 12 bulan (Juli-Juni) untuk tahun ajaran aktif.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Keterangan khusus siswa..."
                  className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Profile / Detail Siswa (Multi-Year View) */}
      {detailStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  {detailStudent.full_name}
                </h4>
                <p className="text-xs text-slate-500">
                  NIS: {detailStudent.nis || '-'} · {detailStudent.current_enrollment?.unit || 'SD IT'} · {formatGradeDisplay(detailStudent.current_enrollment?.grade, detailStudent.current_enrollment?.unit)}
                </p>
              </div>
              <button
                onClick={() => setDetailStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* WhatsApp Quick Button */}
              {detailStudent.phone && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <div className="text-xs">
                    <p className="font-bold text-emerald-900">Kontak Orang Tua / Wali</p>
                    <p className="text-emerald-700">{detailStudent.phone}</p>
                  </div>
                  <a
                    href={`https://wa.me/${detailStudent.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-800 transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Chat WhatsApp</span>
                  </a>
                </div>
              )}

              {/* Bills List */}
              <div>
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Daftar Tagihan & Status Pembayaran
                </h5>

                {isLoadingDetail ? (
                  <p className="text-xs text-slate-400 py-4 text-center">Memuat rincian tagihan...</p>
                ) : detailBills.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">Belum ada tagihan tercatat untuk siswa ini.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Tahun Ajaran</th>
                          <th className="py-2 px-3">Tagihan</th>
                          <th className="py-2 px-3 text-right">Nominal</th>
                          <th className="py-2 px-3 text-right">Terbayar</th>
                          <th className="py-2 px-3 text-right">Sisa</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailBills.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 text-slate-500">{b.academic_year?.name || '-'}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {b.category?.name} {b.billing_period ? `(${b.billing_period})` : ''}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-700">
                              Rp{Number(b.amount).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                              Rp{Number(b.total_paid || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-rose-600 font-bold">
                              Rp{Number(b.remaining_amount || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  b.calculated_status === 'Lunas' || b.calculated_status === 'Bebas'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : b.calculated_status === 'Belum Lunas'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {b.calculated_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDetailStudent(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Santri Berhenti / Nonaktif */}
      {dropoutStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <UserX className="w-4 h-4" />
                </div>
                <h4 className="text-base font-bold text-slate-800">
                  Atur Santri Berhenti / Pindah
                </h4>
              </div>
              <button
                onClick={() => setDropoutStudent(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyDropout} className="space-y-4">
              <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                <p className="text-xs font-bold text-amber-900">
                  {dropoutStudent.full_name}
                </p>
                <p className="text-[11px] text-amber-700">
                  NIS: {dropoutStudent.nis || '-'} • Status Saat Ini:{' '}
                  <span className="font-semibold uppercase">{dropoutStudent.student_status}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ubah Status Siswa Menjadi
                </label>
                <select
                  value={dropoutStatus}
                  onChange={(e) => setDropoutStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="nonaktif">Non-Aktif (Berhenti / Drop Out)</option>
                  <option value="pindah">Pindah Sekolah</option>
                  <option value="lulus">Lulus</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Berlaku Mulai Bulan Tagihan
                </label>
                <select
                  value={dropoutMonth}
                  onChange={(e) => setDropoutMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {SPP_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      Mulai Bulan {m}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Bulan {dropoutMonth} sampai bulan berikutnya di tahun ajaran ini akan disesuaikan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tindakan Terhadap Tagihan Mendatang
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="dropoutAction"
                      value="bebas"
                      checked={dropoutAction === 'bebas'}
                      onChange={() => setDropoutAction('bebas')}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Bebaskan Tagihan (Rekomendasi)</p>
                      <p className="text-[11px] text-slate-500">
                        Status tagihan diubah menjadi &ldquo;Bebas&rdquo; sehingga sisa tunggakan menjadi Rp 0 dan tidak tertagih lagi.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="dropoutAction"
                      value="delete"
                      checked={dropoutAction === 'delete'}
                      onChange={() => setDropoutAction('delete')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Hapus Baris Tagihan Mendatang</p>
                      <p className="text-[11px] text-slate-500">
                        Menghapus data baris tagihan yang belum dibayar mulai bulan tersebut.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDropoutStudent(null)}
                  disabled={isDropoutSubmitting}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isDropoutSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50"
                >
                  {isDropoutSubmitting ? 'Memproses...' : 'Simpan & Terapkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
