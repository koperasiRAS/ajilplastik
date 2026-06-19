'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Store, 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Receipt, 
  TrendingUp, 
  AlertCircle, 
  LogOut, 
  Menu, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

type SidebarProps = {
  profile: any
}

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Auto-collapse on /pos
  useEffect(() => {
    if (pathname === '/pos') {
      setIsCollapsed(true)
    } else {
      setIsCollapsed(false)
    }
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['owner', 'kasir'] },
    { name: 'POS', path: '/pos', icon: <ShoppingCart size={20} />, roles: ['owner', 'kasir'] },
    { name: 'Inventory', path: '/inventory', icon: <Package size={20} />, roles: ['owner'] },
    { name: 'Pengeluaran', path: '/expenses', icon: <Receipt size={20} />, roles: ['owner'] },
    { name: 'Pemasukan', path: '/incomes', icon: <TrendingUp size={20} />, roles: ['owner'] },
    { name: 'Laporan', path: '/reports', icon: <AlertCircle size={20} />, roles: ['owner'] },
  ]

  const visibleMenus = menuItems.filter(item => item.roles.includes(profile.role))

  const handleCloseMobile = () => setIsMobileOpen(false)

  return (
    <>
      {/* Mobile Menu Toggle */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Menu size={24} />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm"
          onClick={handleCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
          w-64
        `}
      >
        {/* Header / Logo */}
        <div className="flex items-center justify-between h-20 px-4 border-b border-slate-100 bg-slate-50/50">
          <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'md:justify-center md:w-full' : ''}`}>
            <div className="shrink-0 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm shadow-blue-600/20">
              <Store size={22} />
            </div>
            <div className={`transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'md:hidden' : 'md:block'}`}>
              <h1 className="font-extrabold text-slate-900 tracking-tight text-lg">Ajil Plastik</h1>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{profile.role}</p>
            </div>
          </div>
          <button 
            onClick={handleCloseMobile}
            className="md:hidden p-2 text-slate-400 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {visibleMenus.map((menu) => {
            const isActive = pathname === menu.path || pathname.startsWith(menu.path + '/')
            return (
              <Link 
                key={menu.path} 
                href={menu.path}
                onClick={handleCloseMobile}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group
                  ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-bold' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }
                  ${isCollapsed ? 'md:justify-center' : ''}
                `}
                title={isCollapsed ? menu.name : undefined}
              >
                <div className={`${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                  {menu.icon}
                </div>
                <span className={`whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'md:hidden' : 'md:block'}`}>
                  {menu.name}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Footer / Profile */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          {!isCollapsed && (
            <div className="mb-4 px-2 hidden md:block">
              <p className="text-xs font-semibold text-slate-500 mb-1">CABANG AKTIF</p>
              <p className="text-sm font-bold text-slate-800 truncate">{profile.branches?.name || 'Utama'}</p>
            </div>
          )}
          
          <button 
            onClick={handleLogout}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 font-bold transition-all
              ${isCollapsed ? 'md:justify-center' : ''}
            `}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut size={20} />
            <span className={`whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'md:hidden' : 'md:block'}`}>
              Logout
            </span>
          </button>
        </div>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-white border border-slate-200 rounded-full items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:shadow-sm transition-all z-50"
        >
          {isCollapsed ? <ChevronRight size={14} strokeWidth={3}/> : <ChevronLeft size={14} strokeWidth={3}/>}
        </button>
      </aside>
    </>
  )
}
