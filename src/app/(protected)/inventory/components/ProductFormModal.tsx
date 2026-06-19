'use client'

import { useState } from 'react'
import { X, Plus, Trash2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Product, Category, ProductUnit } from '../page'

type Props = {
  product: Product | null
  categories: Category[]
  branchId: string
  userId: string
  onClose: () => void
  onSuccess: () => void
}

export default function ProductFormModal({ product, categories, branchId, userId, onClose, onSuccess }: Props) {
  const supabase = createClient()
  const isEdit = !!product

  const [name, setName] = useState(product?.name || '')
  const [barcode, setBarcode] = useState(product?.barcode || '')
  const [categoryId, setCategoryId] = useState(product?.category_id || (categories.length > 0 ? categories[0].id : ''))
  const [description, setDescription] = useState(product?.description || '')
  const [initialStock, setInitialStock] = useState<number>(0)
  
  const [units, setUnits] = useState<Partial<ProductUnit>[]>(
    product?.product_units || [{ name: 'Pcs', conversion_to_base: 1, is_base_unit: true, sell_price: 0, buy_price: 0 }]
  )
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addUnit = () => {
    setUnits([...units, { name: '', conversion_to_base: 1, is_base_unit: false, sell_price: 0, buy_price: 0 }])
  }

  const updateUnit = (index: number, field: keyof ProductUnit, value: any) => {
    const newUnits = [...units]
    if (field === 'is_base_unit' && value === true) {
      // Unset others
      newUnits.forEach(u => u.is_base_unit = false)
      newUnits[index].is_base_unit = true
      newUnits[index].conversion_to_base = 1 // Base unit always 1
    } else {
      newUnits[index] = { ...newUnits[index], [field]: value }
    }
    setUnits(newUnits)
  }

  const removeUnit = (index: number) => {
    setUnits(units.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validations
    if (!name.trim()) return setError('Nama produk wajib diisi.')
    if (!categoryId) return setError('Pilih kategori produk.')
    if (units.length === 0) return setError('Minimal harus ada 1 satuan.')
    
    const baseUnits = units.filter(u => u.is_base_unit)
    if (baseUnits.length !== 1) return setError('Harus ada tepat SATU satuan dasar (Base Unit).')
    
    for (const u of units) {
      if (!u.name?.trim()) return setError('Nama satuan tidak boleh kosong.')
      if ((u.conversion_to_base || 0) <= 0) return setError('Konversi satuan harus lebih dari 0.')
      if ((u.sell_price || 0) < 0) return setError('Harga jual tidak boleh negatif.')
    }

    setIsSubmitting(true)

    if (isEdit) {
      // EDIT MODE
      // 1. Update product
      const { error: errProd } = await supabase.from('products').update({
        name, barcode: barcode || null, category_id: categoryId, description
      }).eq('id', product.id)

      if (errProd) {
        setIsSubmitting(false)
        return setError(errProd.message.includes('unique') ? 'Barcode sudah dipakai.' : errProd.message)
      }

      // 2. Update units (sederhana: hapus yang ada, insert baru, TAPI jika unit dipakai di transaksi, delete akan gagal).
      // Pendekatan lebih aman: UPSERT
      const unitsToUpsert = units.map(u => ({
        id: u.id || undefined, // undefined will create new uuid on server if omitted, wait supabase expects omit or uuid.
        product_id: product.id,
        name: u.name,
        conversion_to_base: u.conversion_to_base,
        is_base_unit: u.is_base_unit,
        sell_price: u.sell_price,
        buy_price: u.buy_price || null
      }))

      // For safety in this MVP, we try to upsert.
      for (const u of unitsToUpsert) {
        if (u.id) {
          await supabase.from('product_units').update(u).eq('id', u.id)
        } else {
          await supabase.from('product_units').insert(u)
        }
      }
      
      onSuccess()
      onClose()
    } else {
      // CREATE MODE (Using RPC)
      const { data, error: errRpc } = await supabase.rpc('fn_create_product_with_initial_stock', {
        p_branch_id: branchId,
        p_category_id: categoryId,
        p_barcode: barcode || null,
        p_name: name,
        p_description: description,
        p_units: units,
        p_initial_stock: initialStock,
        p_user_id: userId
      })

      setIsSubmitting(false)
      
      if (errRpc || (data && !data.success)) {
        const msg = errRpc?.message || data?.error || 'Gagal menyimpan.'
        setError(msg.includes('BARCODE_ALREADY_EXISTS') ? 'Barcode sudah dipakai produk lain.' : msg)
        return
      }

      onSuccess()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="text-xl font-bold text-gray-800">{isEdit ? 'Edit Produk' : 'Tambah Produk Baru'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"><X size={20}/></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex gap-3 items-center font-medium">
              <AlertCircle size={20} /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* LEFT: Info Dasar */}
            <div className="space-y-4">
              <h3 className="font-bold text-gray-700 border-b pb-2">Informasi Dasar</h3>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nama Produk <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Misal: Kantong Kresek Hitam" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Barcode (Opsional)</label>
                  <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Scan barcode..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Kategori <span className="text-red-500">*</span></label>
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    {categories.length === 0 && <option value="">- Belum ada kategori -</option>}
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Deskripsi (Opsional)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" rows={3} placeholder="Keterangan tambahan produk..."></textarea>
              </div>

              {!isEdit && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <label className="block text-sm font-semibold text-blue-900 mb-1">Stok Awal (Dalam Satuan Dasar)</label>
                  <p className="text-xs text-blue-700 mb-2">Berapa kuantitas fisik yang ada di toko sekarang?</p>
                  <input type="number" min="0" value={initialStock} onChange={e => setInitialStock(Number(e.target.value))} className="w-full p-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              )}
            </div>

            {/* RIGHT: Satuan Harga */}
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b pb-2">
                <h3 className="font-bold text-gray-700">Satuan & Harga</h3>
                <button type="button" onClick={addUnit} className="text-sm text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
                  <Plus size={16} /> Tambah Satuan
                </button>
              </div>

              <div className="space-y-4">
                {units.map((unit, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border relative transition-colors ${unit.is_base_unit ? 'bg-blue-50/50 border-blue-300 ring-1 ring-blue-100' : 'bg-white border-gray-200'}`}>
                    
                    {units.length > 1 && (
                      <button type="button" onClick={() => removeUnit(idx)} className="absolute -top-3 -right-3 bg-white border border-gray-200 p-1.5 text-gray-400 hover:text-red-600 hover:border-red-200 rounded-full shadow-sm">
                        <Trash2 size={14} />
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nama Satuan <span className="text-red-500">*</span></label>
                        <input type="text" value={unit.name} onChange={e => updateUnit(idx, 'name', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Pcs/Lusin/Dus" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Setara dgn (Base) <span className="text-red-500">*</span></label>
                        <input type="number" min="1" value={unit.conversion_to_base} disabled={unit.is_base_unit} onChange={e => updateUnit(idx, 'conversion_to_base', Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Harga Beli (Modal)</label>
                        <input type="number" min="0" value={unit.buy_price || ''} onChange={e => updateUnit(idx, 'buy_price', Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Harga Jual <span className="text-red-500">*</span></label>
                        <input type="number" min="0" value={unit.sell_price} onChange={e => updateUnit(idx, 'sell_price', Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm font-bold text-blue-600" placeholder="0" />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input type="radio" name="baseUnit" checked={unit.is_base_unit} onChange={() => updateUnit(idx, 'is_base_unit', true)} className="text-blue-600 focus:ring-blue-500" />
                      <span className={`text-xs font-medium ${unit.is_base_unit ? 'text-blue-700 font-bold' : 'text-gray-600'}`}>Jadikan Satuan Dasar (Base Unit)</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors">Batal</button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-sm transition-colors disabled:bg-gray-400">
            {isSubmitting ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : 'Buat Produk')}
          </button>
        </div>
      </div>
    </div>
  )
}
