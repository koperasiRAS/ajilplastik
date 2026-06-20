'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Store, Calendar, ArrowLeft, Plus, Edit2, Trash2, TrendingUp, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function IncomesPage() {
  const [profile, setProfile] = useState<any>(null)
  const [branches, setBranches] = useState<any[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  
  const [incomes, setIncomes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: '',
    description: '',
    branch_id: ''
  })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/login')

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!prof || prof.role !== 'owner') {
      toast.error('Akses ditolak. Halaman ini khusus Owner.')
      return router.push('/dashboard')
    }
    setProfile(prof)

    const { data: branchesData } = await supabase.from('branches').select('id, name').order('created_at', { ascending: true })
    if (branchesData && branchesData.length > 0) {
      setBranches(branchesData)
      setSelectedBranch(branchesData[0].id)
      setFormData(prev => ({ ...prev, branch_id: branchesData[0].id }))
      await fetchIncomes(branchesData[0].id, startDate, endDate)
    } else {
      setIsLoading(false)
    }
  }

  const fetchIncomes = async (branchId: string, start: string, end: string) => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('incomes')
      .select('*, profiles(full_name)')
      .eq('branch_id', branchId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) setIncomes(data)
    setIsLoading(false)
  }

  const handleFilter = () => {
    if (selectedBranch) fetchIncomes(selectedBranch, startDate, endDate)
  }

  const handleOpenModal = (income: any = null) => {
    setErrorMsg('')
    if (income) {
      setEditingId(income.id)
      setFormData({
        date: income.date,
        category: income.category,
        amount: income.amount.toString(),
        description: income.description || '',
        branch_id: income.branch_id
      })
    } else {
      setEditingId(null)
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '',
        amount: '',
        description: '',
        branch_id: selectedBranch
      })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSaving(true)

    try {
      if (!formData.category || !formData.amount || !formData.date || !formData.branch_id) {
        throw new Error('Mohon lengkapi field yang wajib')
      }

      const payload: any = {
        branch_id: formData.branch_id,
        category: formData.category,
        amount: Number(formData.amount),
        description: formData.description,
        date: formData.date
      }

      if (editingId) {
        const { error } = await supabase.from('incomes').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        payload.created_by = profile.id
        const { error } = await supabase.from('incomes').insert(payload)
        if (error) throw error
      }

      setIsModalOpen(false)
      fetchIncomes(selectedBranch, startDate, endDate)
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus pemasukan ini?')) return
    const { error } = await supabase.from('incomes').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      fetchIncomes(selectedBranch, startDate, endDate)
    }
  }

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num)
  }

  // Cek apakah data kurang dari 24 jam untuk membolehkan Edit/Delete
  const isEditable = (createdAt: string) => {
    const diff = new Date().getTime() - new Date(createdAt).getTime()
    return diff <= 24 * 60 * 60 * 1000 // 24 jam
  }

  const totalAmount = incomes.reduce((sum, item) => sum + Number(item.amount), 0)

  if (isLoading && !profile) return (
    <div className="flex flex-col h-screen items-center justify-center bg-slate-50 text-slate-500">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="font-medium animate-pulse">Memuat data pemasukan...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20">
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp size={24} className="text-blue-600"/>
            Pemasukan Non-Transaksi
          </h1>
        </div>
        {/* Controls */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-5 justify-between items-center mb-6">
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Cabang</label>
              <select 
                className="p-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all cursor-pointer min-w-[150px]"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Dari Tanggal</label>
              <div className="relative group">
                <Calendar size={16} className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10 p-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sampai Tanggal</label>
              <div className="relative group">
                <Calendar size={16} className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10 p-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button 
                onClick={handleFilter}
                className="bg-slate-100 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all active:scale-95 h-[42px] w-full md:w-auto"
              >
                Filter
              </button>
            </div>
          </div>
          <div className="flex items-end h-full mt-4 md:mt-0 w-full md:w-auto">
            <button 
              onClick={() => handleOpenModal()}
              className="w-full md:w-auto bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 h-[42px] shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 active:scale-95"
            >
              <Plus size={18} strokeWidth={3} />
              Catat Pemasukan
            </button>
          </div>
        </div>

        {/* Total Summary */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 text-green-500/10 pointer-events-none">
            <TrendingUp size={120} />
          </div>
          <div className="relative z-10">
            <h2 className="text-sm font-black text-green-800 uppercase tracking-widest">Total Pemasukan Tambahan</h2>
            <p className="text-xs font-semibold text-green-600/80 mt-1">Di luar transaksi penjualan dari sistem POS.</p>
          </div>
          <div className="text-3xl md:text-4xl font-black text-green-700 tracking-tight relative z-10">
            {formatRp(totalAmount)}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Kategori</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Deskripsi</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Jumlah</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      <div className="flex justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div></div>
                    </td>
                  </tr>
                ) : incomes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center">
                        <div className="bg-slate-50 p-4 rounded-full mb-3">
                          <TrendingUp size={32} className="text-slate-300" />
                        </div>
                        <p className="font-medium text-slate-500">Tidak ada data pemasukan tambahan.</p>
                      </div>
                    </td>
                  </tr>
                ) : incomes.map((item, index) => (
                  <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-green-50/50 transition-colors`}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700">
                      {new Date(item.date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-block bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-md font-bold text-[11px]">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium max-w-[300px] truncate" title={item.description}>
                      {item.description || '-'}
                    </td>
                    <td className="px-6 py-4 font-black text-green-600 text-right whitespace-nowrap">
                      +{formatRp(item.amount)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {isEditable(item.created_at) ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleOpenModal(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-lg transition-colors active:scale-90" title="Edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors active:scale-90" title="Hapus">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-2 py-1 rounded" title="Melewati batas 24 jam">Terkunci</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-extrabold text-slate-900">
                {editingId ? 'Edit Pemasukan' : 'Catat Pemasukan Baru'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {errorMsg && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl flex items-center gap-2 text-sm font-semibold border border-red-100">
                  <AlertCircle size={16} /> {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm font-semibold text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Kategori</label>
                  <input
                    type="text"
                    required
                    list="income-categories"
                    placeholder="Pilih / Ketik..."
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm font-semibold text-slate-700"
                  />
                  <datalist id="income-categories">
                    <option value="Suntikan Modal" />
                    <option value="Pengembalian Supplier" />
                    <option value="Pendapatan Jasa" />
                    <option value="Lain-lain" />
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Jumlah (Rp)</label>
                <div className="relative group">
                  <span className="absolute left-3 top-3 text-slate-400 font-bold group-focus-within:text-blue-500 transition-colors">Rp</span>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="0"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full pl-10 p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Deskripsi (Opsional)</label>
                <input
                  type="text"
                  placeholder="Catatan tambahan..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm font-medium text-slate-700"
                />
              </div>

              <div className="flex gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
