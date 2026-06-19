import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-red-100 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Akses Ditolak</h1>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed">
          Maaf, akun Anda tidak memiliki izin (role) yang diperlukan untuk mengakses fitur atau halaman ini. Jika ini adalah kesalahan, silakan hubungi Owner.
        </p>
        <Link 
          href="/dashboard" 
          className="inline-flex justify-center px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 font-medium text-sm transition-colors"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}
