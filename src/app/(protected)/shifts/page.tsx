'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, Store, User, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

type Shift = {
  id: string
  branch_id: string
  cashier_id: string
  opening_balance: number
  closing_balance_expected: number | null
  closing_balance_actual: number | null
  difference: number | null
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  branches: { name: string }
  profiles: { full_name: string | null, email: string }
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase
      .from('profiles')
      .select('role, id')
      .eq('id', user.id)
      .single()

    setProfile(prof)

    // Fetch shifts. RLS will ensure Kasir only sees theirs. Owner sees all.
    const { data: shiftsData, error } = await supabase
      .from('shifts')
      .select(`
        *,
        branches(name),
        profiles(full_name, email)
      `)
      .order('opened_at', { ascending: false })
      .limit(50)

    if (error) {
      toast.error('Gagal memuat histori shift')
    } else {
      setShifts(shiftsData as any)
    }
    
    setIsLoading(false)
  }

  const formatRp = (num: number | null) => {
    if (num === null) return '-'
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num)
  }

  const handleForceClose = async (shiftId: string, expected: number) => {
    if (!window.confirm('Tutup paksa shift ini? (Hanya dilakukan jika kasir lupa menutup shift dan sudah pulang)')) return

    try {
      const { data, error } = await supabase.rpc('fn_close_shift', {
        p_shift_id: shiftId,
        p_closing_balance_actual: expected // Asumsikan aktual = expected jika force close
      })

      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Gagal menutup shift')

      toast.success('Shift berhasil ditutup paksa')
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            Riwayat Shift Kasir
          </h1>
          <p className="text-gray-500 mt-1">
            {profile?.role === 'owner' ? 'Memantau seluruh aktivitas shift kasir dari semua cabang.' : 'Histori buka-tutup shift Anda.'}
          </p>
        </div>
        
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 text-xs uppercase font-semibold border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">Status & Waktu</th>
                {profile?.role === 'owner' && <th className="px-6 py-4">Kasir & Cabang</th>}
                <th className="px-6 py-4">Modal Awal</th>
                <th className="px-6 py-4">Kas Aktual</th>
                <th className="px-6 py-4">Selisih</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Memuat riwayat shift...
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Belum ada riwayat shift ditemukan.
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        {shift.status === 'open' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Sedang Berjalan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Selesai
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>Buka: {new Date(shift.opened_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        {shift.closed_at && (
                          <p>Tutup: {new Date(shift.closed_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        )}
                      </div>
                    </td>
                    
                    {profile?.role === 'owner' && (
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {shift.profiles.full_name || shift.profiles.email}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                          <Store className="w-3.5 h-3.5 text-gray-400" />
                          {shift.branches.name}
                        </div>
                      </td>
                    )}
                    
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {formatRp(shift.opening_balance)}
                    </td>
                    
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {shift.status === 'open' ? (
                        <span className="text-gray-400 italic">Menunggu tutup...</span>
                      ) : (
                        formatRp(shift.closing_balance_actual)
                      )}
                    </td>
                    
                    <td className="px-6 py-4">
                      {shift.status === 'open' ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {shift.difference === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded text-xs">
                              <CheckCircle2 className="w-3 h-3" /> Pas
                            </span>
                          ) : (shift.difference || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded text-xs">
                              <AlertCircle className="w-3 h-3" /> Lebih {formatRp(shift.difference)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded text-xs">
                              <AlertTriangle className="w-3 h-3" /> Kurang {formatRp(Math.abs(shift.difference || 0))}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 text-right">
                      {profile?.role === 'owner' && shift.status === 'open' && (
                        <button
                          onClick={() => handleForceClose(shift.id, shift.opening_balance)} // Simplified expected
                          className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors"
                        >
                          Force Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
