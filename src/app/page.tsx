import { redirect } from 'next/navigation'

export default function Home() {
  // Aplikasi kita tidak memiliki landing page public,
  // langsung redirect ke dashboard (yang nanti akan dilindungi middleware)
  redirect('/dashboard')
}
