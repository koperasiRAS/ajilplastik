'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Store, TrendingUp, AlertCircle, Package, Receipt, ShoppingCart, LogOut, ChartLine, CheckCircle2, Printer } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint'
import { getLocalISODate } from '@/lib/date-utils'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [availableBranches, setAvailableBranches] = useState<{id: string, name: string}[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  
  const [isLoading, setIsLoading] = useState(true)
  const [summary, setSummary] = useState<any>(null)
  const [branchSummary, setBranchSummary] = useState<any>(null)
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [stockAlerts, setStockAlerts] = useState<any[]>([])
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [reprintModal, setReprintModal] = useState<ReceiptData | null>(null)

  useEffect(() => {
    checkAuthAndFetchData()
  }, [])

  const checkAuthAndFetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: prof } = await supabase.from('profiles').select('id, role, branch_id, branches(name)').eq('id', user.id).single()
    if (!prof) return

    let targetBranch = prof.branch_id

    if (prof.role === 'owner') {
      const { data: branches } = await supabase.from('branches').select('id, name').order('created_at', { ascending: true })
      if (branches && branches.length > 0) {
        setAvailableBranches(branches)
        if (!targetBranch) {
          targetBranch = branches[0].id
        }
      }
    }

    setProfile(prof)
    setSelectedBranch(targetBranch || '')
    
    // Fetch dashboard data
    await fetchDashboardData(prof.role, targetBranch, prof.id)
  }

  const fetchDashboardData = async (role: string, branchId: string, cashierId: string) => {
    setIsLoading(true)
    
    // Default to last 7 days including today
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - 6)

    const startStr = getLocalISODate(startDate)
    const endStr = getLocalISODate(endDate)

    // Fetch Summary (Owner: All cashiers, Cashier: Only self, for today only if cashier)
    const summaryStart = role === 'owner' ? startStr : endStr // Cashier only today
    
    const { data: sumData } = await supabase.rpc('fn_get_dashboard_summary', {
      p_branch_id: branchId || null,
      p_start_date: summaryStart,
      p_end_date: endStr,
      p_cashier_id: role === 'kasir' ? cashierId : null
    })
    
    if (sumData) setSummary(sumData)

    if (role === 'kasir') {
      const { data: branchSumData } = await supabase.rpc('fn_get_dashboard_summary', {
        p_branch_id: branchId || null,
        p_start_date: summaryStart,
        p_end_date: endStr,
        p_cashier_id: null
      })
      if (branchSumData) setBranchSummary(branchSumData)

      // Fetch recent transactions for this cashier today
      const { data: recentTrx } = await supabase.from('transactions')
         .select('id, transaction_number, total_amount, created_at')
         .eq('cashier_id', cashierId)
         .gte('created_at', summaryStart + 'T00:00:00.000Z')
         .order('created_at', { ascending: false })
         .limit(5)
      if (recentTrx) setRecentTransactions(recentTrx)
    }

    // Fetch stock alerts for both owner and cashier (cashier only sees their branch due to RLS/query)
    let stockQuery = supabase.from('product_stock')
      .select('id, quantity, products(name), branches(name)')
      .lte('quantity', 10) // Threshold
      
    if (branchId) stockQuery = stockQuery.eq('branch_id', branchId)
    
    const { data: alerts } = await stockQuery.limit(10)
    if (alerts) setStockAlerts(alerts)

    if (role === 'owner') {
      // Fetch top products
      const { data: topProd } = await supabase.rpc('fn_get_top_products', {
        p_branch_id: branchId || null,
        p_start_date: startStr,
        p_end_date: endStr,
        p_limit: 5,
        p_sort_by: 'omzet'
      })
      if (topProd) setTopProducts(topProd)
    }

    setIsLoading(false)
  }

  const handleBranchChange = async (newBranchId: string) => {
    setSelectedBranch(newBranchId)
    await fetchDashboardData(profile.role, newBranchId, profile.id)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handlePrintRequest = () => {
    setTimeout(() => {
      window.print()
    }, 100)
  }

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num)
  }

  if (isLoading && !profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="font-medium animate-pulse">Memuat Dashboard...</p>
    </div>
  )

  const handleReprint = async (transaction_id: string) => {
    try {
      const { data: trx, error: trxError } = await supabase
        .from('transactions')
        .select(`
          *,
          cashier:profiles!transactions_cashier_id_fkey(role),
          branch:branches(name),
          items:transaction_items(
            *,
            products(name)
          )
        `)
        .eq('id', transaction_id)
        .single()

      if (trxError) throw trxError

      const receiptData: ReceiptData = {
        transaction_number: trx.transaction_number,
        items: trx.items.map((i: any) => ({
          product_name: i.products.name,
          quantity: i.quantity,
          unit_name: i.unit_name_snapshot,
          price: i.price_snapshot,
          subtotal: i.subtotal
        })),
        total: trx.total_amount,
        discount: trx.discount_amount,
        paymentMethod: trx.payment_method,
        amountPaid: trx.total_amount, // Fallback karena tidak menyimpan uang tunai diterima
        change: 0, 
        date: new Date(trx.created_at),
        branchName: trx.branch?.name || 'Cabang Utama',
        cashierName: trx.cashier?.role.toUpperCase() || 'KASIR'
      }
      setReprintModal(receiptData)
    } catch (err) {
      console.error(err)
      alert('Gagal mengambil detail struk.')
    }
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex flex-col print:hidden">
      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Branch Filter & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {profile?.role === 'owner' ? 'Ringkasan Bisnis' : 'Ringkasan Shift Anda'}
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              {profile?.role === 'owner' ? 'Perkembangan 7 hari terakhir' : 'Penjualan hari ini'}
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            {profile?.role === 'owner' && availableBranches.length > 0 && (
              <select 
                value={selectedBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer"
              >
                <option value="">Semua Cabang</option>
                {availableBranches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {profile?.role === 'owner' && (
              <Link href="/pos" className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-sm hover:bg-blue-700 hover:shadow active:scale-95 transition-all">
                <ShoppingCart size={18} />
                Buka POS
              </Link>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS */}
        {profile?.role === 'owner' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform"><Receipt size={22}/></div>
                <h3 className="text-sm font-bold text-slate-500">Total Omzet</h3>
              </div>
              <p className="text-3xl font-black text-slate-800 tracking-tight">{formatRp(summary?.total_omzet || 0)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-green-50 text-green-600 rounded-xl group-hover:scale-110 transition-transform"><ShoppingCart size={22}/></div>
                <h3 className="text-sm font-bold text-slate-500">Transaksi Berhasil</h3>
              </div>
              <p className="text-3xl font-black text-slate-800 tracking-tight">{summary?.transaction_count || 0}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl group-hover:scale-110 transition-transform"><TrendingUp size={22}/></div>
                <h3 className="text-sm font-bold text-slate-500">Rata-rata Transaksi</h3>
              </div>
              <p className="text-3xl font-black text-slate-800 tracking-tight">
                {summary?.transaction_count > 0 ? formatRp(summary.total_omzet / summary.transaction_count) : 'Rp 0'}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl"><Store size={22}/></div>
                  <h3 className="text-sm font-extrabold text-blue-900">Total Fisik Laci (Omzet Toko)</h3>
                </div>
                <p className="text-3xl font-black text-slate-800 tracking-tight">{formatRp(branchSummary?.total_omzet || 0)}</p>
                <p className="text-xs font-medium text-blue-600 mt-2 bg-blue-100/50 inline-block px-2.5 py-1 rounded-md">Gabungan seluruh kasir. Cocokkan laci dengan angka ini.</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-200 bg-gradient-to-br from-green-50/50 to-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-green-100 text-green-600 rounded-xl"><Receipt size={22}/></div>
                  <h3 className="text-sm font-extrabold text-green-900">Penjualan Shift Anda</h3>
                </div>
                <p className="text-3xl font-black text-slate-800 tracking-tight">{formatRp(summary?.total_omzet || 0)}</p>
                <p className="text-xs font-medium text-green-600 mt-2 bg-green-100/50 inline-block px-2.5 py-1 rounded-md">Total dari {summary?.transaction_count || 0} transaksi Anda.</p>
              </div>
            </div>

            {/* QUICK ACTIONS FOR KASIR */}
            <div className="grid grid-cols-2 gap-4 md:gap-6 mb-8">
              <Link href="/pos" className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center transition-all shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-1 active:scale-95 group">
                <ShoppingCart size={36} className="mb-4 group-hover:scale-110 transition-transform" />
                <span className="font-extrabold text-lg md:text-xl">Buka Kasir (POS)</span>
              </Link>
              <Link href="/inventory" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center transition-all shadow-lg shadow-indigo-600/20 hover:shadow-xl hover:shadow-indigo-600/30 hover:-translate-y-1 active:scale-95 group">
                <Package size={36} className="mb-4 group-hover:scale-110 transition-transform" />
                <span className="font-extrabold text-lg md:text-xl">Cek Stok Barang</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* RECENT TRANSACTIONS */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-gray-900 font-bold">
                    <Receipt size={20} className="text-blue-500"/>
                    5 Transaksi Terakhir Anda
                  </div>
                </div>
                <div className="space-y-4">
                  {recentTransactions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Belum ada transaksi hari ini.</p>
                  ) : recentTransactions.map((trx) => (
                    <div key={trx.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors border border-gray-50">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{trx.transaction_number}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(trx.created_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})} WIB</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="font-bold text-green-600 bg-green-50 px-3 py-1 rounded-lg">
                          {formatRp(trx.total_amount)}
                        </div>
                        <button 
                          onClick={() => handleReprint(trx.id)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                          title="Cetak Ulang Struk"
                        >
                          <Printer size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STOCK ALERTS FOR KASIR */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-gray-900 font-bold">
                    <AlertCircle size={20} className="text-red-500"/>
                    Peringatan Stok Menipis
                  </div>
                </div>
                <div className="space-y-4">
                  {stockAlerts.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Stok barang di etalase aman.</p>
                  ) : stockAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-3 hover:bg-red-50 rounded-xl transition-colors border border-red-50">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{alert.products?.name}</p>
                        <p className="text-xs text-red-500 mt-0.5 font-medium">Sisa {alert.quantity} pcs</p>
                      </div>
                      <Link href="/inventory" className="text-xs font-bold text-red-600 bg-red-100 px-3 py-1.5 rounded-lg hover:bg-red-200">
                        Cek Rak
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OWNER SPECIFIC CONTENT */}
        {profile?.role === 'owner' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <ChartLine size={20} className="text-blue-500"/>
                  Tren Penjualan (7 Hari)
                </h3>
              </div>
              <div className="h-72">
                {summary?.daily_trend && summary.daily_trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 12, fill: '#6B7280'}}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          return `${d.getDate()}/${d.getMonth()+1}`;
                        }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 12, fill: '#6B7280'}}
                        tickFormatter={(val) => `Rp${val / 1000}k`}
                      />
                      <Tooltip 
                        formatter={(value: any) => formatRp(Number(value))}
                        labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="omzet" stroke="#2563EB" strokeWidth={3} dot={{r: 4, fill: '#2563EB', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">Belum ada data penjualan</div>
                )}
              </div>
            </div>

            {/* Sidebar Data */}
            <div className="space-y-8">
              
              {/* Top Products */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <Package size={20} className="text-purple-500"/>
                  Produk Terlaris
                </h3>
                {topProducts.length > 0 ? (
                  <div className="space-y-4">
                    {topProducts.map((p, i) => (
                      <div key={p.product_id} className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">{i + 1}</div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 line-clamp-1">{p.product_name}</p>
                            <p className="text-xs text-gray-500">{p.total_quantity_base} terjual</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-green-600">{formatRp(p.total_omzet)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">Belum ada data penjualan</p>
                )}
              </div>

              {/* Stock Alerts */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <AlertCircle size={20} className="text-red-500"/>
                  Stok Menipis
                </h3>
                {stockAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {stockAlerts.map((s) => (
                      <div key={s.id} className="flex justify-between items-start border-b border-red-50 pb-3 last:border-0 last:pb-0">
                        <div>
                          <p className="text-sm font-semibold text-gray-800 line-clamp-1">{s.products?.name}</p>
                          <p className="text-xs text-red-500 mt-0.5">{s.branches?.name}</p>
                        </div>
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">
                          Sisa {s.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="inline-flex w-12 h-12 bg-green-50 text-green-500 rounded-full items-center justify-center mb-2">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="text-sm text-gray-500">Semua stok aman!</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </main>
      </div>
      {/* REPRINT MODAL */}
      {reprintModal && (
        <ReceiptPrint 
          data={reprintModal}
          onClose={() => setReprintModal(null)}
          onPrintRequest={handlePrintRequest}
          isReprint={true}
        />
      )}
    </>
  )
}
