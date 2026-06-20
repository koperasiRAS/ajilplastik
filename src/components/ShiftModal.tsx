import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Store, Loader2 } from 'lucide-react'

type ShiftModalProps = {
  branchId: string
  onShiftOpened: (shiftId: string, openingBalance: number) => void
}

export default function ShiftModal({ branchId, onShiftOpened }: ShiftModalProps) {
  const [openingBalance, setOpeningBalance] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const balance = parseInt(openingBalance)
    if (isNaN(balance) || balance < 0) {
      toast.error('Modal awal tidak valid')
      return
    }

    setIsSubmitting(true)
    const { data, error } = await supabase.rpc('fn_open_shift', {
      p_branch_id: branchId,
      p_opening_balance: balance
    })

    setIsSubmitting(false)

    if (error || !data?.success) {
      toast.error(error?.message || data?.error || 'Gagal membuka shift')
      return
    }

    toast.success('Shift berhasil dibuka')
    onShiftOpened(data.shift_id, balance)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-blue-600 p-6 text-white text-center">
          <Store className="w-12 h-12 mx-auto mb-2 opacity-90" />
          <h2 className="text-2xl font-bold">Buka Shift Kasir</h2>
          <p className="text-blue-100 text-sm mt-1">Anda harus membuka shift sebelum dapat melayani transaksi.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modal Awal Kas (Laci Fisik)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp</span>
              <input
                type="number"
                required
                min="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-lg"
                placeholder="0"
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Masukkan jumlah uang tunai yang ada di laci saat ini. Masukkan 0 jika laci kosong.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || openingBalance === ''}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Membuka Shift...
              </>
            ) : (
              'Buka Shift & Mulai Transaksi'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
