'use client'

import { useState } from 'react'
import { X, AlertCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Product } from '../page'

type Props = {
  product: Product
  branchId: string
  userId: string
  onClose: () => void
  onSuccess: () => void
}

export default function AdjustStockModal({ product, branchId, userId, onClose, onSuccess }: Props) {
  const supabase = createClient()
  
  const [newQuantity, setNewQuantity] = useState<number>(product.stock)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diff = newQuantity - product.stock

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newQuantity < 0) return setError('Stok fisik tidak boleh negatif.')
    if (diff === 0) return setError('Tidak ada perubahan kuantitas.')
    if (!reason.trim()) return setError('Alasan koreksi wajib diisi.')

    setIsSubmitting(true)

    const { data, error: errRpc } = await supabase.rpc('fn_adjust_stock_manual', {
      p_branch_id: branchId,
      p_product_id: product.id,
      p_new_quantity: newQuantity,
      p_reason: reason,
      p_user_id: userId
    })

    setIsSubmitting(false)

    if (errRpc || (data && !data.success)) {
      setError(errRpc?.message || data?.error || 'Gagal melakukan koreksi stok.')
      return
    }

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-orange-50">
          <h3 className="font-bold text-xl text-orange-800 flex items-center gap-2"><RefreshCw size={20}/> Koreksi Stok Manual</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white rounded-full p-1"><X size={20}/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <h4 className="font-bold text-gray-900 text-lg mb-1">{product.name}</h4>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-3 py-2 rounded border border-red-200 text-sm flex gap-2 items-center">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-center flex-1">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Stok Sistem</p>
                <p className="text-2xl font-bold text-gray-800">{product.stock}</p>
              </div>
              <div className="text-gray-300">➜</div>
              <div className="text-center flex-1">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Stok Fisik Baru</p>
                <input 
                  type="number" 
                  min="0"
                  value={newQuantity} 
                  onChange={e => setNewQuantity(Number(e.target.value))} 
                  className="w-24 text-center text-2xl font-bold text-orange-600 p-1 border-b-2 border-orange-300 focus:border-orange-500 bg-transparent outline-none" 
                  autoFocus
                />
              </div>
            </div>

            {diff !== 0 && (
              <div className={`text-center text-sm font-bold p-2 rounded ${diff > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                Selisih: {diff > 0 ? `+${diff}` : diff} (Satuan Dasar)
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Alasan Koreksi <span className="text-red-500">*</span></label>
              <textarea 
                value={reason} 
                onChange={e => setReason(e.target.value)} 
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" 
                rows={3} 
                placeholder="Misal: 2 Pcs rusak, hilang, dsb..." 
                required 
              />
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={isSubmitting || diff === 0} className="flex-1 px-4 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 disabled:bg-gray-400 shadow-sm transition-colors">
              {isSubmitting ? 'Menyimpan...' : 'Koreksi Stok'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
