'use client'

import { useState } from 'react'
import { X, Trash2, Edit2, Plus, Check, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Category } from '../page'

type Props = {
  categories: Category[]
  onClose: () => void
  refreshCategories: () => void
}

export default function CategoryManagerModal({ categories, onClose, refreshCategories }: Props) {
  const supabase = createClient()
  
  const [newCatName, setNewCatName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setError(null)

    const { error: err } = await supabase.from('product_categories').insert({ name: newCatName.trim() })
    if (err) {
      setError(err.message)
    } else {
      setNewCatName('')
      refreshCategories()
    }
  }

  const startEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  const saveEdit = async () => {
    if (!editingName.trim()) return
    setError(null)

    const { error: err } = await supabase.from('product_categories').update({ name: editingName.trim() }).eq('id', editingId)
    if (err) {
      setError(err.message)
    } else {
      setEditingId(null)
      refreshCategories()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus kategori ini?')) return
    setError(null)

    const { error: err } = await supabase.from('product_categories').delete().eq('id', id)
    if (err) {
      setError('Gagal menghapus. Kemungkinan kategori ini masih dipakai oleh beberapa produk.')
    } else {
      refreshCategories()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-lg text-gray-800">Manajemen Kategori</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white rounded-full p-1"><X size={20}/></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-3 py-2 rounded border border-red-200 text-sm flex gap-2 items-center">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleAdd} className="flex gap-2 mb-6">
            <input 
              type="text" 
              value={newCatName} 
              onChange={e => setNewCatName(e.target.value)} 
              placeholder="Kategori baru..." 
              className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
            <button type="submit" disabled={!newCatName.trim()} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700 disabled:bg-blue-300 flex items-center gap-1">
              <Plus size={16}/> Tambah
            </button>
          </form>

          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg group hover:border-blue-300 transition-colors">
                {editingId === cat.id ? (
                  <input 
                    type="text" 
                    value={editingName} 
                    onChange={e => setEditingName(e.target.value)}
                    className="flex-1 p-1 border-b-2 border-blue-500 outline-none text-sm font-semibold mr-2"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm font-semibold text-gray-800">{cat.name}</span>
                )}

                <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingId === cat.id ? (
                    <>
                      <button onClick={saveEdit} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"><Check size={14}/></button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"><X size={14}/></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14}/></button>
                      <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-4">Belum ada kategori terdaftar.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
