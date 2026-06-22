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
  
  const baseUnit = product?.product_units?.[0] || { name: 'Pcs', sell_price: 0, buy_price: 0 }
  const [sellPrice, setSellPrice] = useState<number>(baseUnit.sell_price || 0)
  const [buyPrice, setBuyPrice] = useState<number>(baseUnit.buy_price || 0)
  
  const existingPack = product?.product_units?.find(u => !u.is_base_unit)
  const [hasPackUnit, setHasPackUnit] = useState(!!existingPack)
  const [packName, setPackName] = useState(existingPack?.name || 'Pack')
  const [packConversion, setPackConversion] = useState<number>(existingPack?.conversion_to_base || 10)
  const [packSellPrice, setPackSellPrice] = useState<number>(existingPack?.sell_price || 0)
  const [packBuyPrice, setPackBuyPrice] = useState<number>(existingPack?.buy_price || 0)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validations
    if (!name.trim()) return setError('Nama produk wajib diisi.')
    if (!categoryId) return setError('Pilih kategori produk.')
    if (sellPrice < 0) return setError('Harga jual tidak boleh negatif.')

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

      // 2. Update the primary unit (Pcs)
      const uToUpdateBase = {
        id: product.product_units.find(u => u.is_base_unit)?.id,
        product_id: product.id,
        name: product.product_units.find(u => u.is_base_unit)?.name || 'Pcs',
        conversion_to_base: 1,
        is_base_unit: true,
        sell_price: sellPrice,
        buy_price: buyPrice || null
      }

      if (uToUpdateBase.id) {
        await supabase.from('product_units').update(uToUpdateBase).eq('id', uToUpdateBase.id)
      } else {
        await supabase.from('product_units').insert(uToUpdateBase)
      }

      // 3. Update the secondary unit (Pack)
      if (hasPackUnit) {
        const uToUpdatePack = {
          id: existingPack?.id,
          product_id: product.id,
          name: packName,
          conversion_to_base: packConversion,
          is_base_unit: false,
          sell_price: packSellPrice,
          buy_price: packBuyPrice || null
        }
        if (uToUpdatePack.id) {
          await supabase.from('product_units').update(uToUpdatePack).eq('id', uToUpdatePack.id)
        } else {
          await supabase.from('product_units').insert(uToUpdatePack)
        }
      } else if (existingPack?.id) {
        await supabase.from('product_units').delete().eq('id', existingPack.id)
      }
      
      onSuccess()
      onClose()
    } else {
      const units = [
        { name: 'Pcs', conversion_to_base: 1, is_base_unit: true, sell_price: sellPrice, buy_price: buyPrice }
      ]
      
      if (hasPackUnit) {
        units.push({
          name: packName,
          conversion_to_base: packConversion,
          is_base_unit: false,
          sell_price: packSellPrice,
          buy_price: packBuyPrice
        })
      }

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

            {/* RIGHT: Harga */}
            <div className="space-y-4">
              <h3 className="font-bold text-gray-700 border-b pb-2">Harga Produk</h3>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Harga Beli (Modal)</label>
                  <input type="number" min="0" value={buyPrice || ''} onChange={e => setBuyPrice(Number(e.target.value))} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Harga Jual <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={sellPrice || ''} onChange={e => setSellPrice(Number(e.target.value))} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600 text-lg" placeholder="0" />
                </div>
              </div>

              {/* PACK UNIT CHECKBOX AND FIELDS */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasPackUnit} onChange={(e) => setHasPackUnit(e.target.checked)} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                  <span className="text-sm font-bold text-gray-700">Aktifkan Harga Grosir/Pack</span>
                </label>
                
                {hasPackUnit && (
                  <div className="pt-2 border-t border-gray-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Nama Satuan</label>
                        <input type="text" value={packName} onChange={e => setPackName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Misal: Pack, Dus" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Isi 1 {packName} (Pcs)</label>
                        <input type="number" min="2" value={packConversion || ''} onChange={e => setPackConversion(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="10" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Harga Beli ({packName})</label>
                      <input type="number" min="0" value={packBuyPrice || ''} onChange={e => setPackBuyPrice(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Harga Jual ({packName}) <span className="text-red-500">*</span></label>
                      <input type="number" min="0" value={packSellPrice || ''} onChange={e => setPackSellPrice(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600 text-lg" placeholder="0" />
                    </div>
                  </div>
                )}
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
