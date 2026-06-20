import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ajil Plastik POS',
    short_name: 'Ajil Plastik',
    description: 'Aplikasi Point of Sales untuk Toko Ajil Plastik',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563EB', // Tailwind blue-600
    icons: [
      {
        src: '/icon',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
