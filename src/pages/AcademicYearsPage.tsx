import React, { useState } from 'react';
import { Calendar, Plus, CheckCircle2, Archive, Edit2, X, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { academicYearService } from '../services/academicYearService';
import { AcademicYear } from '../types/database';

export const AcademicYearsPage: React.FC = () => {
  const { academicYears, selectedAcademicYearId, setSelectedAcademicYearId, refreshAcademicYears, showToast } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    start_date: '2026-07-01',
    end_date: '2027-06-30',
    status: 'active' as 'active' | 'archived',
  });

  const handleOpenAdd = () => {
    setEditingYear(null);
    setFormData({
      name: '',
      start_date: '2026-07-01',
      end_date: '2027-06-30',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (year: AcademicYear) => {
    setEditingYear(year);
    setFormData({
      name: year.name,
      start_date: year.start_date,
      end_date: year.end_date,
      status: year.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Nama tahun ajaran wajib diisi', 'error');
      return;
    }

    try {
      if (editingYear) {
        await academicYearService.update(editingYear.id, {
          name: formData.name.trim(),
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status,
        });
        showToast('Tahun ajaran berhasil diperbarui', 'success');
      } else {
        await academicYearService.create({
          name: formData.name.trim(),
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status,
        });
        showToast('Tahun ajaran baru berhasil ditambahkan', 'success');
      }
      setIsModalOpen(false);
      refreshAcademicYears();
    } catch (err: any) {
      showToast('Gagal menyimpan tahun ajaran: ' + err.message, 'error');
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await academicYearService.setActive(id);
      setSelectedAcademicYearId(id);
      refreshAcademicYears();
      showToast('Tahun ajaran aktif berhasil diubah', 'success');
    } catch (err: any) {
      showToast('Gagal mengaktifkan tahun ajaran: ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Manajemen Tahun Ajaran</h3>
          <p className="text-xs text-slate-500">
            Kelola periode tahun ajaran aktif dan arsip. Data transaksi lama tetap tersimpan aman.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Tahun Ajaran</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {academicYears.map((year) => {
          const isActive = year.status === 'active';
          const isSelected = year.id === selectedAcademicYearId;

          return (
            <div
              key={year.id}
              className={`rounded-2xl p-5 border transition-all ${
                isSelected
                  ? 'bg-emerald-50/50 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                  : 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {isActive ? 'Aktif' : 'Arsip'}
                  </span>
                  <h4 className="text-xl font-black text-slate-800">
                    T.A. {year.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {year.start_date} s/d {year.end_date}
                  </p>
                </div>

                <button
                  onClick={() => handleOpenEdit(year)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                  title="Edit Periode"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                {isActive ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Tahun Ajaran Aktif Saat Ini</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSetActive(year.id)}
                    className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-2"
                  >
                    Jadikan Aktif
                  </button>
                )}

                {!isSelected && (
                  <button
                    onClick={() => setSelectedAcademicYearId(year.id)}
                    className="text-xs font-semibold px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
                  >
                    Pilih Tampilan
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit Academic Year */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h4 className="text-base font-bold text-slate-800">
                {editingYear ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran Baru'}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Tahun Ajaran *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 2027/2028"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="active">Aktif</option>
                  <option value="archived">Arsip</option>
                </select>
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
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
