'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, ShoppingCart, Wallet, X, Plus, Minus, CreditCard, Banknote, QrCode, ArrowLeft, Store, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint'
import { initQZ, openCashDrawer } from '@/lib/qz-tray'

// Types
type ProductUnit = {
  id: string
  name: string
  conversion_to_base: number
  is_base_unit: boolean
  sell_price: number
  buy_price: number
}

type Product = {
  id: string
  name: string
  barcode: string | null
  product_units: ProductUnit[]
  stock: number
}

type CartItem = {
  cart_id: string
  product_id: string
  product_name: string
  product_unit_id: string
  unit_name: string
  conversion_to_base: number
  quantity: number
  price: number
  buy_price: number
  subtotal: number
}

export default function POSPage() {
  const supabase = createClient()
  
  const [profile, setProfile] = useState<any>(null)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [availableBranches, setAvailableBranches] = useState<{id: string, name: string}[]>([])
  
  const [cart, setCart] = useState<CartItem[]>([])
  const [discountType, setDiscountType] = useState<'nominal' | 'percent'>('nominal')
  const [discountValue, setDiscountValue] = useState<number>(0)
  
  const [unitSelectModal, setUnitSelectModal] = useState<Product | null>(null)
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [receiptModal, setReceiptModal] = useState<ReceiptData | null>(null)
  
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qris'>('cash')
  const [amountPaid, setAmountPaid] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  
  const [qzStatus, setQzStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting')
  const [isOpeningDrawer, setIsOpeningDrawer] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Derived Values
  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0)
  const discountAmount = discountType === 'nominal' 
    ? discountValue 
    : Math.floor(cartSubtotal * (discountValue / 100))
  const cartTotal = Math.max(0, cartSubtotal - discountAmount)

  useEffect(() => {
    fetchInitialData()
    
    // Connect to QZ Tray
    initQZ().then(connected => {
      setQzStatus(connected ? 'connected' : 'disconnected')
    })
  }, [])

  // Auto-focus search on load (good for barcode scanners)
  // Harus dipanggil SETELAH isLoading false agar input sudah ter-render di DOM
  useEffect(() => {
    if (!isLoading && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isLoading])

  // Global listener: jika user ngetik/scan tapi fokus tidak di input manapun, otomatis fokus ke search bar
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT' ||
        checkoutModalOpen ||
        unitSelectModal ||
        receiptModal
      ) return

      // Jika yang ditekan adalah karakter tunggal (huruf/angka dari scanner) tanpa modifier
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [checkoutModalOpen, unitSelectModal, receiptModal])

  // Real-time Search & Auto-Add Logic
  useEffect(() => {
    if (!searchQuery) {
      setProducts(allProducts)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = allProducts.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.barcode?.toLowerCase().includes(query)
    )

    // Fitur: Jika input SAMA PERSIS dengan barcode salah satu produk
    // otomatis ditambahkan ke keranjang tanpa perlu tekan Enter
    const exactMatch = filtered.find(p => p.barcode?.toLowerCase() === query)
    
    if (exactMatch) {
      handleProductClick(exactMatch)
      setSearchQuery('')
      if (searchInputRef.current) searchInputRef.current.value = ''
      setProducts(allProducts)
    } else {
      setProducts(filtered)
    }
  }, [searchQuery, allProducts])

  async function fetchInitialData() {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, role, branch_id, branches(name)')
      .eq('id', user.id)
      .single()
      
    if (prof) {
      let targetBranchId = prof.branch_id

      if (prof.role === 'owner') {
        const { data: branches } = await supabase.from('branches').select('id, name').order('created_at', { ascending: true })
        if (branches) {
          setAvailableBranches(branches)
          if (!targetBranchId) {
            targetBranchId = branches[0]?.id
            prof.branch_id = targetBranchId
            ;(prof as any).branches = { name: branches[0]?.name }
          }
        }
      }

      setProfile(prof)
      await fetchProducts(targetBranchId)
    }
    setIsLoading(false)
  }

  const handleSwitchBranch = async (branchId: string) => {
    const branchName = availableBranches.find(b => b.id === branchId)?.name
    if (!branchName) return
    setProfile({ ...profile, branch_id: branchId, branches: { name: branchName } })
    setCart([]) // Clear cart when switching branch
    setSearchQuery('')
    await fetchProducts(branchId)
  }

  async function fetchProducts(branchId: string) {
    const { data: prodData } = await supabase.from('products').select(`
      id, name, barcode,
      product_units (id, name, conversion_to_base, is_base_unit, sell_price, buy_price)
    `).eq('is_active', true)

    if (prodData && prodData.length > 0) {
      const prodIds = prodData.map(p => p.id)
      const { data: stockData } = await supabase
        .from('product_stock')
        .select('product_id, quantity')
        .eq('branch_id', branchId)
        .in('product_id', prodIds)

      const stockMap = new Map(stockData?.map(s => [s.product_id, s.quantity]))

      const mappedProducts: Product[] = prodData.map(p => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        product_units: p.product_units as ProductUnit[],
        stock: stockMap.get(p.id) || 0
      }))

      setAllProducts(mappedProducts)
      setProducts(mappedProducts)
    } else {
      setAllProducts([])
      setProducts([])
    }
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Karena kita sudah pakai real-time filter, kita hanya perlu mengecek 
    // apakah ada satu produk tersisa di layar, jika ya tambahkan.
    if (products.length === 1) {
      handleProductClick(products[0])
      setSearchQuery('')
      if (searchInputRef.current) searchInputRef.current.value = ''
    }
  }

  const handleProductClick = (product: Product) => {
    if (product.product_units.length === 1) {
      addToCart(product, product.product_units[0])
    } else if (product.product_units.length > 1) {
      setUnitSelectModal(product)
    } else {
      toast.error('Produk ini belum memiliki satuan harga.')
    }
  }

  const addToCart = (product: Product, unit: ProductUnit) => {
    // Tentative client stock check
    const existingQtyBase = cart.filter(c => c.product_id === product.id).reduce((sum, c) => sum + (c.quantity * c.conversion_to_base), 0)
    if (existingQtyBase + unit.conversion_to_base > product.stock) {
      toast.error(`Stok tidak cukup! Sisa stok dasar: ${product.stock}`)
      return
    }

    const existingCartItem = cart.find(c => c.product_id === product.id && c.product_unit_id === unit.id)

    if (existingCartItem) {
      setCart(cart.map(c => c.cart_id === existingCartItem.cart_id ? {
        ...c,
        quantity: c.quantity + 1,
        subtotal: (c.quantity + 1) * c.price
      } : c))
    } else {
      setCart([...cart, {
        cart_id: Math.random().toString(36).substring(2, 11),
        product_id: product.id,
        product_name: product.name,
        product_unit_id: unit.id,
        unit_name: unit.name,
        conversion_to_base: unit.conversion_to_base,
        quantity: 1,
        price: unit.sell_price,
        buy_price: unit.buy_price,
        subtotal: unit.sell_price
      }])
    }
    setUnitSelectModal(null)
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 50)
  }

  const updateCartQty = (cart_id: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.cart_id === cart_id) {
        const newQty = Math.max(1, c.quantity + delta)
        return { ...c, quantity: newQty, subtotal: newQty * c.price }
      }
      return c
    }))
  }

  const setCartQtyExact = (cart_id: string, newQtyRaw: string) => {
    const val = Number.parseInt(newQtyRaw)
    const newQty = Number.isNaN(val) ? 0 : val
    setCart(cart.map(c => {
      if (c.cart_id === cart_id) {
        return { ...c, quantity: newQty, subtotal: newQty * c.price }
      }
      return c
    }))
  }

  const handleQtyBlur = (cart_id: string) => {
    setCart(cart.map(c => {
      if (c.cart_id === cart_id && c.quantity < 1) {
        return { ...c, quantity: 1, subtotal: 1 * c.price }
      }
      return c
    }))
  }

  const handleCheckout = async () => {
    if (paymentMethod === 'cash' && amountPaid < cartTotal) {
      setCheckoutError('Jumlah uang tunai kurang dari total belanja!')
      return
    }

    if (cart.some(c => c.quantity <= 0)) {
      setCheckoutError('Ada item dengan kuantitas tidak valid (0 atau kurang)!')
      return
    }

    setIsSubmitting(true)
    setCheckoutError(null)

    const p_items = cart.map(c => ({
      product_id: c.product_id,
      product_unit_id: c.product_unit_id,
      unit_name_snapshot: c.unit_name,
      conversion_to_base_snapshot: c.conversion_to_base,
      quantity: c.quantity,
      price_snapshot: c.price,
      buy_price_snapshot: c.buy_price,
      subtotal: c.subtotal
    }))

    const { data, error } = await supabase.rpc('fn_checkout_pos', {
      p_branch_id: profile.branch_id,
      p_cashier_id: profile.id,
      p_payment_method: paymentMethod,
      p_total_amount: cartTotal,
      p_discount_amount: discountAmount,
      p_items: p_items
    })

    setIsSubmitting(false)

    if (error || data?.success === false) {
      setCheckoutError(error?.message || data?.error || 'Terjadi kesalahan saat checkout.')
      return
    }

    setCheckoutModalOpen(false)
    setReceiptModal({
      transaction_number: data.transaction_number,
      items: cart.map(c => ({
        product_name: c.product_name,
        quantity: c.quantity,
        unit_name: c.unit_name,
        price: c.price,
        subtotal: c.subtotal
      })),
      total: cartTotal,
      discount: discountAmount,
      paymentMethod,
      amountPaid: paymentMethod === 'cash' ? amountPaid : cartTotal,
      change: paymentMethod === 'cash' ? amountPaid - cartTotal : 0,
      date: new Date(),
      branchName: profile?.branches?.name || 'Cabang Utama',
      cashierName: profile?.role.toUpperCase()
    })

    // Auto open drawer for cash payments
    if (paymentMethod === 'cash') {
      try {
        await openCashDrawer()
      } catch (err) {
        toast.error('Gagal membuka laci otomatis. Pastikan QZ Tray menyala, lalu buka manual dengan kunci atau tombol Buka Laci.', { duration: 5000 })
      }
    }

    setCart([])
    setAmountPaid(0)
    setDiscountValue(0)
    fetchProducts(profile.branch_id) // refresh stock
  }

  const formatRp = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num)

  const handlePrintRequest = () => {
    setTimeout(() => {
      window.print()
    }, 100)
  }

  const handleManualOpenDrawer = async () => {
    if (isOpeningDrawer) return // prevent rapid-click
    
    const reason = window.prompt("Alasan membuka laci (wajib diisi):")
    if (!reason) return

    setIsOpeningDrawer(true)
    try {
      // Catat ke log audit
      const { error } = await supabase.from('cash_drawer_logs').insert({
        branch_id: profile.branch_id,
        opened_by: profile.id,
        reason: reason
      })

      if (error) {
        toast.error('Gagal mencatat log buka laci: ' + error.message)
        return
      }

      await openCashDrawer()
    } catch (err: any) {
      toast.error(`Gagal membuka laci kasir.\n\nPastikan:\n1. QZ Tray sedang berjalan\n2. Printer terhubung dan menyala\n\nDetail: ${err?.message || err}`, { duration: 6000 })
    } finally {
      setIsOpeningDrawer(false)
    }
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">Memuat data POS...</div>

  return (
    <>
      <div className="flex flex-col md:flex-row h-[100dvh] bg-slate-50 font-sans overflow-hidden print:hidden">
        {/* LEFT PANEL: PRODUCT SEARCH & LIST */}
      <div className="w-full md:w-3/5 lg:w-2/3 flex flex-col h-[55vh] md:h-full border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50">
        {/* Header */}
        <div className="p-4 bg-blue-600 text-white flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">Ajil Plastik POS</h1>
              <p className="text-xs text-blue-100 flex items-center gap-1 font-medium mt-0.5">
                <Store size={12}/> 
                {profile?.role === 'owner' && availableBranches.length > 0 ? (
                  <select 
                    value={profile?.branch_id || ''}
                    onChange={(e) => handleSwitchBranch(e.target.value)}
                    className="ml-1 bg-blue-700/50 border-none text-white font-bold focus:ring-2 focus:ring-white/50 cursor-pointer p-0.5 px-2 rounded-md text-xs appearance-none"
                  >
                    {availableBranches.map(b => (
                      <option key={b.id} value={b.id} className="text-black">{b.name}</option>
                    ))}
                  </select>
                ) : (
                  profile?.branches?.name || 'Cabang Tidak Diketahui'
                )}
              </p>
            </div>
            
            <div className="hidden sm:flex items-center gap-2 ml-4 px-3 py-1.5 bg-blue-700/50 rounded-full text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full animate-pulse ${qzStatus === 'connected' ? 'bg-green-400' : qzStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`}></span>
              <span className="text-blue-100">{qzStatus === 'connected' ? 'QZ Active' : 'QZ Error'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleManualOpenDrawer}
              disabled={isOpeningDrawer}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-3 py-2 rounded-lg shadow-sm"
            >
              <Unlock size={14}/>
              <span className="hidden sm:inline">{isOpeningDrawer ? 'Membuka...' : 'Buka Laci'}</span>
            </button>
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 transition-colors px-3 py-2 rounded-lg shadow-sm"
            >
              <ArrowLeft size={16}/>
              <span className="hidden sm:inline">Kembali</span>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-white z-0 shadow-sm relative">
          <form onSubmit={handleSearchSubmit} className="relative group">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama produk atau scan barcode... (Tekan Enter)"
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-sm transition-all text-sm md:text-base"
              autoFocus
            />
            <Search className="absolute left-4 top-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
            <button type="submit" className="hidden">Cari</button>
          </form>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {products.map(p => (
              <div 
                key={p.id} 
                role="button"
                tabIndex={0}
                onClick={() => handleProductClick(p)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleProductClick(p) }}
                className={`bg-white p-4 rounded-2xl shadow-sm border ${p.stock <= 0 ? 'border-red-200 bg-red-50/30 opacity-70 cursor-not-allowed' : 'border-slate-100 hover:border-blue-300 hover:shadow-md cursor-pointer active:scale-[0.97] hover:-translate-y-0.5'} transition-all duration-200 flex flex-col h-full select-none`}
              >
                <div className="text-[10px] text-slate-400 mb-1.5 font-mono">{p.barcode || '-'}</div>
                <h3 className="font-bold text-slate-800 leading-snug mb-3 flex-1">{p.name}</h3>
                <div className="flex justify-between items-end mt-2">
                  <div className="text-blue-600 font-extrabold">{p.product_units.length > 0 ? formatRp(p.product_units[0].sell_price) : '-'}</div>
                  <div className={`text-[11px] font-bold px-2 py-1 rounded-md ${p.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Stok: {p.stock}
                  </div>
                </div>
                {p.product_units.length > 1 && (
                  <div className="text-[10px] font-semibold text-slate-500 mt-2 bg-slate-100 px-2 py-1 rounded-md w-max">Multi-Satuan</div>
                )}
              </div>
            ))}
            {products.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 flex flex-col items-center">
                <div className="bg-slate-100 p-6 rounded-full mb-4">
                  <ShoppingCart size={48} className="text-slate-300" />
                </div>
                <p className="font-medium text-lg text-slate-500">Tidak ada produk yang ditemukan</p>
                <p className="text-sm mt-1">Coba gunakan kata kunci lain atau scan barcode</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: CART & CHECKOUT */}
      <div className="w-full md:w-2/5 lg:w-1/3 flex flex-col h-[45vh] md:h-full bg-white shadow-[-4px_0_20px_-5px_rgba(0,0,0,0.1)] z-20">
        <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center shadow-sm z-10">
          <h2 className="font-extrabold text-slate-800 flex items-center gap-2 text-lg">
            <ShoppingCart size={20} className="text-blue-600" /> Keranjang
          </h2>
          <span className="bg-blue-100 text-blue-700 text-xs font-black px-2.5 py-1 rounded-full">{cart.length} Item</span>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <ShoppingCart size={40} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium">Keranjang masih kosong</p>
              <p className="text-xs mt-1 text-slate-500">Pilih produk atau scan barcode untuk menambah barang.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.cart_id} className="p-3.5 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-col gap-3 relative group hover:border-blue-300 transition-colors">
                  <div className="flex justify-between pr-6">
                    <h4 className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{item.product_name}</h4>
                    <span className="font-black text-blue-600 text-sm whitespace-nowrap ml-2">{formatRp(item.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-500">{formatRp(item.price)} <span className="font-normal">/ {item.unit_name}</span></span>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                      <button onClick={() => updateCartQty(item.cart_id, -1)} className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md transition-colors active:scale-90 shadow-sm"><Minus size={14} strokeWidth={3}/></button>
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity === 0 ? '' : item.quantity}
                        onChange={(e) => setCartQtyExact(item.cart_id, e.target.value)}
                        onBlur={() => handleQtyBlur(item.cart_id)}
                        className="w-10 text-center text-sm font-bold bg-transparent border-none outline-none focus:ring-0 p-0 m-0 [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button onClick={() => updateCartQty(item.cart_id, 1)} className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md transition-colors active:scale-90 shadow-sm"><Plus size={14} strokeWidth={3}/></button>
                    </div>
                  </div>
                  <button onClick={() => setCart(cart.filter(c => c.cart_id !== item.cart_id))} className="absolute top-2.5 right-2.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all active:scale-90">
                    <X size={18} strokeWidth={3}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout Summary */}
        <div className="border-t border-slate-200 bg-white p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10">
          
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Subtotal</span>
              <span>{formatRp(cartSubtotal)}</span>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-600">Diskon:</span>
              <select 
                value={discountType} 
                onChange={(e) => setDiscountType(e.target.value as 'nominal'|'percent')}
                className="text-xs border border-gray-300 rounded p-1"
              >
                <option value="nominal">Rp</option>
                <option value="percent">%</option>
              </select>
              <input 
                type="number" 
                value={discountValue || ''} 
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="flex-1 text-right text-sm border border-gray-300 rounded px-2 py-1"
                placeholder="0"
              />
            </div>
            
            <div className="flex justify-between text-2xl font-bold text-gray-900 mt-2 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="text-blue-600">{formatRp(cartTotal)}</span>
            </div>
          </div>

          <button 
            disabled={cart.length === 0}
            onClick={() => setCheckoutModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl shadow-lg transition-colors flex justify-center items-center gap-2 text-lg"
          >
            Bayar Sekarang
          </button>
        </div>
      </div>

      {/* UNIT SELECTION MODAL */}
      {unitSelectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">Pilih Satuan Jual</h3>
              <button onClick={() => setUnitSelectModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">{unitSelectModal.name}</p>
              <div className="space-y-3">
                {unitSelectModal.product_units.map(unit => (
                  <button 
                    key={unit.id}
                    onClick={() => addToCart(unitSelectModal, unit)}
                    className="w-full flex justify-between items-center p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                  >
                    <div>
                      <div className="font-bold text-gray-800 text-lg">{unit.name}</div>
                      <div className="text-xs text-gray-500">Isi: {unit.conversion_to_base} Pcs (Satuan Dasar)</div>
                    </div>
                    <div className="font-bold text-blue-600">{formatRp(unit.sell_price)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-800">Pembayaran</h3>
              <button onClick={() => setCheckoutModalOpen(false)} className="text-gray-400 hover:text-gray-600 bg-gray-200 p-1 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="text-center mb-8">
                <p className="text-gray-500 text-sm mb-1">Total Tagihan</p>
                <p className="text-4xl font-black text-blue-600">{formatRp(cartTotal)}</p>
              </div>

              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-3">Metode Pembayaran</p>
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => setPaymentMethod('cash')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === 'cash' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <Banknote size={24} />
                    <span className="text-xs font-bold">Tunai</span>
                  </button>
                  <button onClick={() => setPaymentMethod('transfer')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === 'transfer' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <CreditCard size={24} />
                    <span className="text-xs font-bold">Transfer Bank</span>
                  </button>
                  <button onClick={() => setPaymentMethod('qris')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === 'qris' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <QrCode size={24} />
                    <span className="text-xs font-bold">QRIS</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Payment Content */}
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 mb-6">
                {paymentMethod === 'cash' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Uang Diterima (Rp)</label>
                    <input 
                      type="number" 
                      value={amountPaid || ''}
                      onChange={(e) => setAmountPaid(Number(e.target.value))}
                      className="w-full text-2xl font-bold p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0"
                      autoFocus
                    />
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {[10000, 20000, 50000, 100000].map(val => (
                        <button key={val} onClick={() => setAmountPaid(val)} className="py-2 border border-blue-200 text-blue-700 bg-white rounded-lg text-sm font-semibold hover:bg-blue-50">
                          {val/1000}K
                        </button>
                      ))}
                    </div>
                    {amountPaid > 0 && (
                      <div className="mt-4 flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                        <span className="text-green-800 text-sm font-semibold">Kembalian:</span>
                        <span className="text-green-700 font-bold text-lg">{formatRp(Math.max(0, amountPaid - cartTotal))}</span>
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'transfer' && (
                  <div className="text-center py-2">
                    <Wallet size={40} className="mx-auto text-blue-500 mb-3" />
                    <p className="text-sm text-gray-600 mb-1">Transfer ke Rekening Toko:</p>
                    <p className="font-bold text-lg text-gray-800 tracking-wider">BCA 1234-5678-90</p>
                    <p className="text-xs text-gray-500 mt-1">A.n. Ajil Plastik</p>
                    <div className="mt-4 bg-yellow-50 text-yellow-800 text-xs p-3 rounded-lg border border-yellow-200">
                      Harap cek mutasi rekening sebelum menyelesaikan transaksi.
                    </div>
                  </div>
                )}

                {paymentMethod === 'qris' && (
                  <div className="text-center py-2">
                    {/* Placeholder for QRIS */}
                    <div className="w-48 h-48 bg-white border-2 border-dashed border-gray-300 mx-auto rounded-xl flex items-center justify-center mb-3">
                      <QrCode size={64} className="text-gray-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Scan QRIS Ajil Plastik</p>
                    <div className="mt-3 bg-yellow-50 text-yellow-800 text-xs p-3 rounded-lg border border-yellow-200">
                      Pastikan notifikasi pembayaran berhasil telah diterima.
                    </div>
                  </div>
                )}
              </div>

              {checkoutError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 text-center font-medium">
                  {checkoutError}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 bg-white">
              <button 
                onClick={handleCheckout}
                disabled={isSubmitting || (paymentMethod === 'cash' && amountPaid < cartTotal)}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl shadow-md transition-colors flex justify-center items-center text-lg"
              >
                {isSubmitting ? 'Memproses...' : 'Selesaikan Transaksi'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* RECEIPT PREVIEW MODAL */}
      {receiptModal && (
        <ReceiptPrint 
          data={receiptModal} 
          onClose={() => setReceiptModal(null)} 
          onPrintRequest={handlePrintRequest}
        />
      )}
    </>
  )
}
