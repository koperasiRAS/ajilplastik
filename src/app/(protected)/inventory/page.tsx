'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Plus, Edit2, Archive, ArchiveRestore, PackagePlus, History, Settings2, Store, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import ProductFormModal from './components/ProductFormModal'
import RestockModal from './components/RestockModal'
import AdjustStockModal from './components/AdjustStockModal'
import StockHistoryModal from './components/StockHistoryModal'
import CategoryManagerModal from './components/CategoryManagerModal'

export type Category = { id: string, name: string }
export type ProductUnit = { id: string, name: string, conversion_to_base: number, is_base_unit: boolean, sell_price: number, buy_price: number | null }
export type Product = {
  id: string
  category_id: string
  barcode: string | null
  name: string
  description: string | null
  is_active: boolean
  product_categories: { name: string }
  product_units: ProductUnit[]
  stock: number
}

export default function InventoryPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<any>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [availableBranches, setAvailableBranches] = useState<{id: string, name: string}[]>([])

  // Modals state
  const [productFormModal, setProductFormModal] = useState<{ isOpen: boolean, product: Product | null }>({ isOpen: false, product: null })
  const [restockModal, setRestockModal] = useState<{ isOpen: boolean, product: Product | null }>({ isOpen: false, product: null })
  const [adjustModal, setAdjustModal] = useState<{ isOpen: boolean, product: Product | null }>({ isOpen: false, product: null })
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, product: Product | null }>({ isOpen: false, product: null })
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)

  const LOW_STOCK_THRESHOLD = 10 // Global threshold

  useEffect(() => {
    fetchInitialData()
  }, [])

  async function fetchInitialData() {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('profiles').select('id, role, branch_id, branches(name)').eq('id', user.id).single()
    
      if (prof) {
        // Owner and Kasir can access, but Kasir is read-only
        let targetBranchId = prof.branch_id

      if (prof.role === 'owner') {
        const { data: branches } = await supabase.from('branches').select('id, name').order('created_at', { ascending: true })
        if (branches) {
          setAvailableBranches(branches)
          if (!targetBranchId) {
            targetBranchId = branches[0]?.id
            prof.branch_id = targetBranchId
            // @ts-ignore
            prof.branches = { name: branches[0]?.name }
          }
        }
      }

      setProfile(prof)
      await Promise.all([fetchCategories(), fetchProducts(targetBranchId)])
    }
    setIsLoading(false)
  }

  const handleSwitchBranch = async (branchId: string) => {
    const branchName = availableBranches.find(b => b.id === branchId)?.name
    if (!branchName) return
    setProfile({ ...profile, branch_id: branchId, branches: { name: branchName } })
    await fetchProducts(branchId)
  }

  async function fetchCategories() {
    const { data } = await supabase.from('product_categories').select('*').order('name')
    if (data) setCategories(data)
  }

  async function fetchProducts(branchId: string) {
    const { data: prodData } = await supabase
      .from('products')
      .select(`
        id, category_id, barcode, name, description, is_active,
        product_categories (name),
        product_units (id, name, conversion_to_base, is_base_unit, sell_price, buy_price)
      `)
      .order('name')

    if (prodData) {
      const prodIds = prodData.map(p => p.id)
      const { data: stockData } = await supabase
        .from('product_stock')
        .select('product_id, quantity')
        .eq('branch_id', branchId)
        .in('product_id', prodIds)

      const stockMap = new Map(stockData?.map(s => [s.product_id, s.quantity]))

      const mapped = prodData.map((p: any) => ({
        ...p,
        stock: stockMap.get(p.id) || 0
      }))
      setProducts(mapped)
    }
  }

  const toggleProductStatus = async (product: Product) => {
    const newStatus = !product.is_active
    const confirmMsg = newStatus 
      ? `Aktifkan kembali produk ${product.name}?` 
      : `Non-aktifkan produk ${product.name}? Produk tidak akan muncul di POS.`
    
    if (confirm(confirmMsg)) {
      const { error } = await supabase.from('products').update({ is_active: newStatus }).eq('id', product.id)
      if (!error) {
        setProducts(products.map(p => p.id === product.id ? { ...p, is_active: newStatus } : p))
      } else {
        alert('Gagal merubah status produk.')
      }
    }
  }

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search))
    const matchCategory = filterCategory === 'all' || p.category_id === filterCategory
    const matchActive = showInactive ? true : p.is_active
    return matchSearch && matchCategory && matchActive
  })

  if (isLoading) return (
    <div className="flex flex-col h-screen items-center justify-center bg-slate-50 text-slate-500">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="font-medium animate-pulse">Memuat data Inventory...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="font-extrabold text-2xl text-slate-900 tracking-tight">Manajemen Inventory</h1>
            <p className="text-sm font-semibold text-slate-500 flex items-center gap-1.5 mt-1">
              <Store size={14} className="text-blue-500"/> Cabang: 
              {profile?.role === 'owner' && availableBranches.length > 0 ? (
                <select 
                  value={profile?.branch_id || ''}
                  onChange={(e) => handleSwitchBranch(e.target.value)}
                  className="ml-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:ring-2 focus:ring-blue-500 cursor-pointer px-3 py-1 text-sm outline-none transition-all shadow-sm"
                >
                  {availableBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-blue-600 font-bold ml-1">{profile?.branches?.name || '-'}</span>
              )}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {profile?.role === 'owner' && (
              <>
                <button onClick={() => setCategoryModalOpen(true)} className="flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 text-sm font-bold shadow-sm transition-all active:scale-95 flex-1 sm:flex-none">
                  <Settings2 size={16} className="text-slate-500" /> Kategori
                </button>
                <button onClick={() => setProductFormModal({ isOpen: true, product: null })} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 transition-all active:scale-95 flex-1 sm:flex-none">
                  <Plus size={18} strokeWidth={3} /> Tambah Produk
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* Filters */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-col sm:flex-row flex-1 gap-4 w-full md:w-auto items-center">
            <div className="relative w-full sm:max-w-md group">
              <Search className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Cari nama atau barcode..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm font-medium transition-all"
              />
            </div>
            <select 
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all cursor-pointer"
            >
              <option value="all">Semua Kategori</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {profile?.role === 'owner' && (
            <div className="flex items-center gap-2 text-sm text-slate-600 font-semibold w-full md:w-auto bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <input 
                type="checkbox" 
                id="showInactive" 
                checked={showInactive} 
                onChange={e => setShowInactive(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <label htmlFor="showInactive" className="cursor-pointer select-none">Tampilkan Non-aktif</label>
            </div>
          )}
        </div>

        {/* Product List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Produk</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Satuan</th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Stok Dasar</th>
                  {profile?.role === 'owner' && (
                    <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center">
                        <div className="bg-slate-50 p-4 rounded-full mb-3">
                          <Search size={32} className="text-slate-300" />
                        </div>
                        <p className="font-medium text-slate-500">Tidak ada produk ditemukan.</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.map((p, index) => (
                  <tr key={p.id} className={`${!p.is_active ? 'bg-slate-50/50 opacity-75' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/50 transition-colors`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                            {p.name} 
                            {!p.is_active && <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-200 text-slate-600 font-bold">Non-aktif</span>}
                          </div>
                          <div className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-1.5">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{p.barcode || 'Tanpa Barcode'}</span>
                            <span className="text-slate-300">&bull;</span>
                            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-semibold">{p.product_categories?.name}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-700">{p.product_units.length} Satuan</div>
                      <div className="text-[11px] font-semibold text-slate-500 mt-2 flex gap-1.5 flex-wrap">
                        {p.product_units.map(u => (
                          <span key={u.id} className={`px-2 py-1 rounded-md border ${u.is_base_unit ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                            {u.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className={`inline-flex items-center justify-center px-3.5 py-1.5 rounded-full text-sm font-black ${
                        p.stock <= LOW_STOCK_THRESHOLD && p.is_active ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm' : 'bg-green-50 text-green-700 border border-green-200 shadow-sm'
                      }`}>
                        {p.stock} <span className="font-semibold ml-1 text-xs">{p.product_units.find(u => u.is_base_unit)?.name || 'Unit'}</span>
                      </div>
                      {p.stock <= LOW_STOCK_THRESHOLD && p.is_active && (
                        <div className="text-[11px] text-red-500 mt-2 flex items-center justify-center gap-1 font-bold animate-pulse">
                          <AlertTriangle size={12}/> Stok Menipis
                        </div>
                      )}
                    </td>
                    {profile?.role === 'owner' && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setRestockModal({ isOpen: true, product: p })} title="Restock" className="p-2 text-green-600 hover:bg-green-100 hover:text-green-700 rounded-lg transition-colors border border-transparent hover:border-green-200 active:scale-90">
                            <PackagePlus size={18} />
                          </button>
                          <button onClick={() => setAdjustModal({ isOpen: true, product: p })} title="Koreksi Stok" className="p-2 text-orange-500 hover:bg-orange-100 hover:text-orange-600 rounded-lg transition-colors border border-transparent hover:border-orange-200 active:scale-90">
                            <RefreshCw size={18} />
                          </button>
                          <button onClick={() => setHistoryModal({ isOpen: true, product: p })} title="Riwayat Stok" className="p-2 text-blue-600 hover:bg-blue-100 hover:text-blue-700 rounded-lg transition-colors border border-transparent hover:border-blue-200 active:scale-90">
                            <History size={18} />
                          </button>
                          <div className="w-px h-6 bg-slate-200 mx-1"></div>
                          <button onClick={() => setProductFormModal({ isOpen: true, product: p })} title="Edit Produk" className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors active:scale-90 border border-transparent hover:border-slate-200">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => toggleProductStatus(p)} title={p.is_active ? 'Non-aktifkan' : 'Aktifkan'} className={`p-2 rounded-lg transition-colors border border-transparent active:scale-90 ${p.is_active ? 'text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 hover:border-slate-200'}`}>
                            {p.is_active ? <Archive size={18} /> : <ArchiveRestore size={18} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      
      {/* MODALS */}
      {categoryModalOpen && (
        <CategoryManagerModal 
          onClose={() => setCategoryModalOpen(false)} 
          categories={categories}
          refreshCategories={fetchCategories}
        />
      )}

      {productFormModal.isOpen && (
        <ProductFormModal 
          product={productFormModal.product}
          categories={categories}
          branchId={profile?.branch_id}
          userId={profile?.id}
          onClose={() => setProductFormModal({ isOpen: false, product: null })}
          onSuccess={() => fetchProducts(profile?.branch_id)}
        />
      )}

      {restockModal.isOpen && restockModal.product && (
        <RestockModal
          product={restockModal.product}
          branchId={profile?.branch_id}
          userId={profile?.id}
          onClose={() => setRestockModal({ isOpen: false, product: null })}
          onSuccess={() => fetchProducts(profile?.branch_id)}
        />
      )}

      {adjustModal.isOpen && adjustModal.product && (
        <AdjustStockModal
          product={adjustModal.product}
          branchId={profile?.branch_id}
          userId={profile?.id}
          onClose={() => setAdjustModal({ isOpen: false, product: null })}
          onSuccess={() => fetchProducts(profile?.branch_id)}
        />
      )}

      {historyModal.isOpen && historyModal.product && (
        <StockHistoryModal
          product={historyModal.product}
          branchId={profile?.branch_id}
          onClose={() => setHistoryModal({ isOpen: false, product: null })}
        />
      )}
    </div>
  )
}
