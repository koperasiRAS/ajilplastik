import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { X, Loader2, Calculator, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react'

type CloseShiftModalProps = {
  shiftId: string
  openingBalance: number
  branchId: string
  shiftOpenedAt: string
  onClose: () => void
  onClosed: () => void
}

type Summary = {
  total_cash: number
  total_transfer: number
  total_qris: number
  total_voids: number
  total_transactions: number
  total_expenses: number
}

export default function CloseShiftModal({ shiftId, openingBalance, branchId, shiftOpenedAt, onClose, onClosed }: CloseShiftModalProps) {
  const [actualBalance, setActualBalance] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    try {
      // Fetch transactions for this shift
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('payment_method, total_amount, status')
        .eq('shift_id', shiftId)

      if (error) throw error

      // Fetch expenses during shift period
      const { data: exps, error: expError } = await supabase
        .from('expenses')
        .select('amount')
        .eq('branch_id', branchId)
        .gte('created_at', shiftOpenedAt)

      if (expError) throw expError

      let sum = {
        total_cash: 0,
        total_transfer: 0,
        total_qris: 0,
        total_voids: 0,
        total_transactions: 0,
        total_expenses: 0
      }

      txs?.forEach(tx => {
        if (tx.status === 'void') {
          sum.total_voids++
        } else if (tx.status === 'completed') {
          sum.total_transactions++
          if (tx.payment_method === 'cash') sum.total_cash += Number(tx.total_amount)
          if (tx.payment_method === 'transfer') sum.total_transfer += Number(tx.total_amount)
          if (tx.payment_method === 'qris') sum.total_qris += Number(tx.total_amount)
        }
      })

      exps?.forEach(exp => {
        sum.total_expenses += Number(exp.amount)
      })

      setSummary(sum)
    } catch (err: any) {
      toast.error('Gagal memuat ringkasan shift: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const expectedBalance = openingBalance + (summary?.total_cash || 0) - (summary?.total_expenses || 0)
  const actualVal = actualBalance === '' ? 0 : parseInt(actualBalance)
  const difference = actualVal - expectedBalance

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (isNaN(actualVal) || actualVal < 0) {
      toast.error('Uang fisik aktual tidak valid')
      return
    }

    // Peringatan jika selisih terlalu besar (opsional, UX aja)
    if (Math.abs(difference) > 50000 && !window.confirm(`Perhatian: Ada selisih sebesar Rp ${Math.abs(difference).toLocaleString('id-ID')}. Anda yakin ingin menutup shift ini?`)) {
      return
    }

    setIsSubmitting(true)
    const { data, error } = await supabase.rpc('fn_close_shift', {
      p_shift_id: shiftId,
      p_closing_balance_actual: actualVal
    })

    if (error || !data?.success) {
      toast.error(error?.message || data?.error || 'Gagal menutup shift')
      setIsSubmitting(false)
      return
    }

    // Jika berhasil tutup
    setIsSubmitting(false)
    onClosed()
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calculator className="w-5 h-5 text-gray-500" />
            Tutup Shift Kasir
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-800 mb-3 uppercase tracking-wider">Ringkasan Transaksi</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Transaksi</p>
                <p className="font-bold">{summary?.total_transactions}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Void</p>
                <p className="font-bold text-red-600">{summary?.total_voids}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Transfer</p>
                <p className="font-bold text-emerald-600">Rp {summary?.total_transfer.toLocaleString('id-ID')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total QRIS</p>
                <p className="font-bold text-sky-600">Rp {summary?.total_qris.toLocaleString('id-ID')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Perhitungan Kas Fisik
            </h3>
            
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Modal Awal</span>
              <span className="font-medium">Rp {openingBalance.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Penjualan Tunai (Cash)</span>
              <span className="font-medium text-blue-600">+ Rp {summary?.total_cash.toLocaleString('id-ID')}</span>
            </div>
            {(summary?.total_expenses || 0) > 0 && (
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600">Pengeluaran (diambil dari laci)</span>
                <span className="font-medium text-red-600">- Rp {summary?.total_expenses.toLocaleString('id-ID')}</span>
              </div>
            )}
            
            <div className="border-t border-gray-200 pt-3 pb-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-800">Ekspektasi Kas Akhir</span>
                <span className="text-xl font-bold">Rp {expectedBalance.toLocaleString('id-ID')}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Sistem mencatat seharusnya ada uang sejumlah ini di laci kasir.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-2">
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Uang Fisik Aktual di Laci Saat Ini
              </label>
              <div className="relative mb-3">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp</span>
                <input
                  type="number"
                  required
                  min="0"
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-bold text-lg"
                  placeholder="0"
                  autoFocus
                />
              </div>

              {actualBalance !== '' && (
                <div className={`p-3 rounded-lg flex items-start gap-3 ${difference === 0 ? 'bg-emerald-50 border border-emerald-100' : difference > 0 ? 'bg-blue-50 border border-blue-100' : 'bg-red-50 border border-red-100'}`}>
                  {difference === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                  ) : difference > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-bold ${difference === 0 ? 'text-emerald-700' : difference > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {difference === 0 ? 'KAS BALANCE (PAS)' : difference > 0 ? `LEBIH Rp ${difference.toLocaleString('id-ID')}` : `KURANG Rp ${Math.abs(difference).toLocaleString('id-ID')}`}
                    </p>
                    <p className={`text-xs mt-0.5 ${difference === 0 ? 'text-emerald-600' : difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {difference === 0 
                        ? 'Jumlah uang fisik sesuai dengan catatan sistem.' 
                        : difference > 0 
                          ? 'Ada uang lebih di laci dibandingkan catatan sistem.' 
                          : 'Ada uang yang kurang di laci dibandingkan catatan sistem!'}
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || actualBalance === ''}
                className="w-full mt-6 bg-gray-900 text-white font-semibold py-3 rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Menutup Shift...
                  </>
                ) : (
                  'Konfirmasi & Tutup Shift'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
