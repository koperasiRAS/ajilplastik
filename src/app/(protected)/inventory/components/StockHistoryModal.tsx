'use client'

import { useState, useEffect } from 'react'
import { X, History, TrendingUp, TrendingDown, Edit3, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Product } from '../page'

type Props = {
  product: Product
  branchId: string
  onClose: () => void
}

type StockMovement = {
  id: string
  type: 'restock' | 'sale' | 'manual_correction' | 'void'
  quantity_change: number
  created_at: string
  notes: string | null
  profiles: { full_name: string } | null
}

export default function StockHistoryModal({ product, branchId, onClose }: Props) {
  const supabase = createClient()
  const [history, setHistory] = useState<StockMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    setIsLoading(true)
    const { data } = await supabase
      .from('stock_movements')
      .select(`
        id, type, quantity_change, created_at, notes,
        profiles (full_name)
      `)
      .eq('product_id', product.id)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      setHistory(data as any)
    }
    setIsLoading(false)
  }

  const getMovementIcon = (type: string, qty: number) => {
    if (qty > 0) return <div className="p-1.5 bg-green-100 text-green-600 rounded-lg"><TrendingUp size={16}/></div>
    if (type === 'void') return <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><TrendingUp size={16}/></div> // Void returns stock
    if (type === 'manual_correction') return <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg"><Edit3 size={16}/></div>
    return <div className="p-1.5 bg-red-100 text-red-600 rounded-lg"><TrendingDown size={16}/></div>
  }

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'restock': return 'Barang Masuk (Restock)'
      case 'sale': return 'Penjualan POS'
      case 'manual_correction': return 'Koreksi Manual'
      case 'void': return 'Pembatalan Transaksi (Void)'
      default: return type
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
          <div>
            <h3 className="font-bold text-xl text-blue-900 flex items-center gap-2"><History size={20}/> Riwayat Stok</h3>
            <p className="text-sm text-blue-700 mt-1">{product.name} (Stok: {product.stock})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white rounded-full p-1"><X size={20}/></button>
        </div>
        
        <div className="p-0 overflow-y-auto flex-1 bg-gray-50/50">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Memuat riwayat...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-gray-500 flex flex-col items-center">
              <XCircle size={40} className="text-gray-300 mb-2"/>
              <p>Belum ada riwayat pergerakan stok untuk produk ini.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map(item => (
                <div key={item.id} className="p-4 bg-white hover:bg-gray-50 transition-colors flex items-start gap-4">
                  {getMovementIcon(item.type, item.quantity_change)}
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-gray-800 text-sm">{getMovementLabel(item.type)}</p>
                      <p className={`font-bold text-lg ${item.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.quantity_change > 0 ? '+' : ''}{item.quantity_change}
                      </p>
                    </div>
                    
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        <span>Oleh: {item.profiles?.full_name || 'Sistem'}</span>
                        <span className="text-gray-300">•</span>
                        <span>{new Date(item.created_at).toLocaleString('id-ID')}</span>
                      </p>
                    </div>

                    {item.notes && (
                      <div className="mt-2 text-xs bg-gray-50 text-gray-600 p-2 rounded border border-gray-100 italic">
                        "{item.notes}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
