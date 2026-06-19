'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  
  // Menggunakan scope 'local' agar kasir yang logout di satu device (misal HP) 
  // tidak membuat akun yang sama ter-logout di device lain (misal PC Kasir utama)
  const { error } = await supabase.auth.signOut({ scope: 'local' })

  if (error) {
    console.error('Logout error:', error)
  }

  revalidatePath('/login')
  redirect('/login')
}
