'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Store, Calendar, TrendingUp, TrendingDown, ArrowLeft, BarChart3, Package, DollarSign } from 'lucide-react'
import { getLocalISODate } from '@/lib/date-utils'

export default function ReportsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [availableBranches, setAvailableBranches] = useState<{id: string, name: string}[]>([])
  
  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  
  const [isLoading, setIsLoading] = useState(true)
  const [profitLoss, setProfitLoss] = useState<any>(null)
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [bottomProducts, setBottomProducts] = useState<any[]>([])

  useEffect(() => {
    // Set default dates to current month
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    
    setStartDate(getLocalISODate(firstDay))
    setEndDate(getLocalISODate(now))
    
    checkAuthAndFetchData()
  }, [])

  const checkAuthAndFetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!prof || prof.role !== 'owner') {
      alert('Hanya Owner yang dapat mengakses Laporan Analisis.')
      router.push('/dashboard')
      return
    }

    const { data: branches } = await supabase.from('branches').select('id, name').order('created_at', { ascending: true })
    if (branches && branches.length > 0) {
      setAvailableBranches(branches)
      setSelectedBranch(branches[0].id)
      setProfile(prof)
      
      // Delay fetching until states are set, we will rely on a separate useEffect or direct call
      const sDate = startDate || getLocalISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
      const eDate = endDate || getLocalISODate(new Date())
      fetchReportData(branches[0].id, sDate, eDate)
    }
  }

  const fetchReportData = async (branchId: string, start: string, end: string) => {
    if (!start || !end) return
    setIsLoading(true)
    
    // Profit & Loss
    const { data: plData } = await supabase.rpc('fn_get_profit_loss', {
      p_branch_id: branchId || null,
      p_start_date: start,
      p_end_date: end
    })
    if (plData) setProfitLoss(plData)

    // Top Products
    const { data: topProd } = await supabase.rpc('fn_get_top_products', {
      p_branch_id: branchId || null,
      p_start_date: start,
      p_end_date: end,
      p_limit: 10,
      p_sort_by: 'omzet'
    })
    if (topProd) setTopProducts(topProd)

    // Bottom Products (Same RPC but sort ascending - we can do it by fetching more and reversing, or add p_sort_dir to RPC)
    // For now, since we didn't add p_sort_dir, let's just fetch bottom by modifying the RPC or doing it client side.
    // Wait, we didn't add ASC/DESC to fn_get_top_products. 
    // Let's just fetch all products in the period and slice them.
    const { data: allProd } = await supabase.rpc('fn_get_top_products', {
      p_branch_id: branchId || null,
      p_start_date: start,
      p_end_date: end,
      p_limit: 1000,
      p_sort_by: 'quantity'
    })
    
    if (allProd) {
      const sortedByQtyAsc = [...allProd].sort((a, b) => a.total_quantity_base - b.total_quantity_base)
      setBottomProducts(sortedByQtyAsc.slice(0, 10))
    }

    setIsLoading(false)
  }

  const handleApplyFilter = () => {
    fetchReportData(selectedBranch, startDate, endDate)
  }

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0)
  }

  if (!profile) return (
    <div className="flex flex-col h-screen items-center justify-center bg-slate-50 text-slate-500">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="font-medium animate-pulse">Memeriksa Akses...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20">
      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 md:py-8">
        
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 size={24} className="text-blue-600"/>
            Analisis & Laporan
          </h1>
        </div>
        {/* Filter Section */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-5 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Cabang</label>
            <select 
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all cursor-pointer"
            >
              <option value="">Semua Cabang (Gabungan)</option>
              {availableBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Dari Tanggal</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sampai Tanggal</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <button 
            onClick={handleApplyFilter}
            disabled={isLoading}
            className="w-full md:w-auto px-6 py-2.5 h-[42px] bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center shadow-sm shadow-slate-900/20"
          >
            {isLoading ? 'Memuat...' : 'Terapkan Filter'}
          </button>
        </div>

        {/* Laba Rugi Section */}
        <div className="mb-8">
          <h2 className="text-xl font-extrabold text-slate-900 mb-5 flex items-center gap-2">
            <DollarSign size={20} className="text-blue-500"/>
            Ringkasan Laba Rugi
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-l-[6px] border-l-blue-500 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute right-0 bottom-0 opacity-[0.03] text-blue-900 -mr-4 -mb-4 transition-transform group-hover:scale-110"><DollarSign size={80} /></div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 relative z-10">Total Omzet Penjualan</h3>
              <p className="text-2xl font-black text-slate-900 tracking-tight relative z-10">{formatRp(profitLoss?.total_omzet)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-l-[6px] border-l-amber-500 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute right-0 bottom-0 opacity-[0.03] text-amber-900 -mr-4 -mb-4 transition-transform group-hover:scale-110"><Package size={80} /></div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 relative z-10">Estimasi Modal (HPP)</h3>
              <p className="text-2xl font-black text-slate-900 tracking-tight relative z-10">{formatRp(profitLoss?.total_cogs)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-l-[6px] border-l-rose-500 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute right-0 bottom-0 opacity-[0.03] text-rose-900 -mr-4 -mb-4 transition-transform group-hover:scale-110"><TrendingDown size={80} /></div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 relative z-10">Pengeluaran Toko</h3>
              <p className="text-2xl font-black text-slate-900 tracking-tight relative z-10">{formatRp(profitLoss?.total_expenses)}</p>
              <p className="text-[10px] font-medium text-slate-400 mt-1 relative z-10">*Dari pencatatan pengeluaran</p>
            </div>
            <div className="bg-emerald-50 p-5 rounded-2xl shadow-sm border border-emerald-100 border-l-[6px] border-l-emerald-500 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute right-0 bottom-0 opacity-5 text-emerald-900 -mr-4 -mb-4 transition-transform group-hover:scale-110"><TrendingUp size={80} /></div>
              <h3 className="text-xs font-bold text-emerald-800/70 uppercase tracking-wider mb-2 relative z-10">Laba Bersih Estimasi</h3>
              <p className="text-2xl font-black text-emerald-700 tracking-tight relative z-10">{formatRp(profitLoss?.net_profit)}</p>
            </div>
          </div>
        </div>

        {/* Product Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Top 10 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center gap-3">
              <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                <TrendingUp size={20} strokeWidth={2.5} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">10 Produk Terlaris</h3>
            </div>
            <div className="p-0 overflow-x-auto flex-1">
              <table className="w-full text-left text-sm min-w-full">
                <thead className="bg-white text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">Produk</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-right">Terjual</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-right">Omzet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topProducts.map((p, i) => (
                    <tr key={p.product_id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3.5 text-slate-800 font-bold flex items-center">
                        <span className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black mr-3 ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {i+1}
                        </span>
                        <span className="truncate max-w-[180px] sm:max-w-[250px]">{p.product_name}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-600">{p.total_quantity_base}</td>
                      <td className="px-5 py-3.5 text-right font-black text-green-600">{formatRp(p.total_omzet)}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-12 text-slate-400">
                        <Package size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="font-medium">Tidak ada data penjualan</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom 10 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center gap-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                <TrendingDown size={20} strokeWidth={2.5} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">10 Produk Kurang Laku</h3>
            </div>
            <div className="p-0 overflow-x-auto flex-1">
              <table className="w-full text-left text-sm min-w-full">
                <thead className="bg-white text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">Produk</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-right">Terjual</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-right">Omzet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bottomProducts.map((p, i) => (
                    <tr key={p.product_id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3.5 text-slate-800 font-bold flex items-center">
                        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black mr-3 bg-slate-100 text-slate-500">
                          {i+1}
                        </span>
                        <span className="truncate max-w-[180px] sm:max-w-[250px]">{p.product_name}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-600">{p.total_quantity_base}</td>
                      <td className="px-5 py-3.5 text-right font-black text-slate-700">{formatRp(p.total_omzet)}</td>
                    </tr>
                  ))}
                  {bottomProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-12 text-slate-400">
                        <Package size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="font-medium">Tidak ada data penjualan</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </main>
    </div>
  )
}
