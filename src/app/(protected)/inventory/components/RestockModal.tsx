'use client'

import { useState } from 'react'
import { X, AlertCircle, PackagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Product } from '../page'

type Props = {
  product: Product
  branchId: string
  userId: string
  onClose: () => void
  onSuccess: () => void
}

export default function RestockModal({ product, branchId, userId, onClose, onSuccess }: Props) {
  const supabase = createClient()
  
  const unitId = product.product_units[0]?.id || ''
  const [quantity, setQuantity] = useState<number | ''>('')
  const [buyPrice, setBuyPrice] = useState<number | ''>('')
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!unitId) return setError('Pilih satuan restock.')
    if (Number(quantity) <= 0) return setError('Jumlah restock harus lebih dari 0.')
    if (buyPrice !== '' && Number(buyPrice) < 0) return setError('Harga beli tidak valid.')

    setIsSubmitting(true)

    const { data, error: errRpc } = await supabase.rpc('fn_restock_product', {
      p_branch_id: branchId,
      p_supplier_id: null, // MVP: Belum ada supplier selection
      p_product_id: product.id,
      p_product_unit_id: unitId,
      p_quantity: quantity,
      p_buy_price: buyPrice === '' ? 0 : Number(buyPrice),
      p_user_id: userId
    })

    setIsSubmitting(false)

    if (errRpc || (data && !data.success)) {
      setError(errRpc?.message || data?.error || 'Gagal melakukan restock.')
      return
    }

    onSuccess()
    onClose()
  }



  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-green-50">
          <h3 className="font-bold text-xl text-green-800 flex items-center gap-2"><PackagePlus size={20}/> Restock Barang</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white rounded-full p-1"><X size={20}/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <h4 className="font-bold text-gray-900 text-lg mb-1">{product.name}</h4>
            <p className="text-sm text-gray-500">Stok Saat Ini: <strong className="text-gray-800">{product.stock}</strong> (Satuan Dasar)</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-3 py-2 rounded border border-red-200 text-sm flex gap-2 items-center">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Jumlah</label>
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" placeholder="0" required />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Harga Beli Total (Rp) <span className="text-gray-400 font-normal text-xs">- Opsional</span></label>
              <input type="number" min="0" value={buyPrice} onChange={e => setBuyPrice(Number(e.target.value))} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" placeholder="0" />
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 shadow-sm">
              {isSubmitting ? 'Memproses...' : 'Simpan Restock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
