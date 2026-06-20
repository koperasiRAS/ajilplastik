import { Printer, CheckCircle2 } from 'lucide-react'

export type ReceiptData = {
  transaction_number: string
  items: {
    product_name: string
    quantity: number
    unit_name: string
    price: number
    subtotal: number
  }[]
  total: number
  discount: number
  paymentMethod: string
  amountPaid: number
  change: number
  date: Date
  branchName: string
  cashierName: string
}

export default function ReceiptPrint({ 
  data, 
  onClose,
  onPrintRequest,
  isReprint = false
}: { 
  data: ReceiptData | null, 
  onClose: () => void,
  onPrintRequest: (size: '58mm' | '80mm') => void,
  isReprint?: boolean
}) {
  if (!data) return null

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
          }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center backdrop-blur-sm p-4 print:bg-transparent print:p-0 print:m-0">
        <div className="bg-white w-full max-w-sm rounded-lg shadow-2xl overflow-hidden flex flex-col print:shadow-none print:w-auto print:m-0 print:border-none">
          <div className="p-3 bg-green-600 text-white text-center flex items-center justify-center gap-2 print:hidden">
            <CheckCircle2 size={20} />
            <span className="font-bold">{isReprint ? 'Preview Cetak Ulang Struk' : 'Transaksi Berhasil'}</span>
          </div>
          
          {/* Receipt Content - Area ini yang akan dicetak */}
          <div id="print-area" className="p-4 bg-white font-mono text-xs text-black w-full font-bold">
            <div className="text-center mb-4 border-b border-dashed border-gray-400 pb-4">
            <h2 className="text-lg print:text-sm font-bold mb-1">AJIL PLASTIK</h2>
            <p>{data.branchName}</p>
            <p>{data.date.toLocaleString('id-ID')}</p>
            <p>No: {data.transaction_number}</p>
            <p>Kasir: {data.cashierName}</p>
            {isReprint && <p className="font-bold mt-1">(CETAK ULANG)</p>}
          </div>

          <div className="space-y-3 print:space-y-1 mb-4 border-b border-dashed border-gray-400 pb-4 print:pb-2 print:mb-2">
            {data.items.map((item, idx) => (
              <div key={idx}>
                <div className="font-bold whitespace-normal">{item.product_name}</div>
                <div className="flex justify-between">
                  <span>{item.quantity}x {item.price.toLocaleString('id-ID')}</span>
                  <span>{item.subtotal.toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1 mb-4 border-b border-dashed border-gray-400 pb-4 print:pb-2 print:mb-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{(data.total + data.discount).toLocaleString('id-ID')}</span>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between">
                <span>Diskon:</span>
                <span>-{data.discount.toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm mt-1 pt-1 border-t border-gray-200">
              <span>TOTAL:</span>
              <span>{data.total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Bayar ({data.paymentMethod.toUpperCase()}):</span>
              <span>{data.amountPaid.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between">
              <span>Kembali:</span>
              <span>{data.change.toLocaleString('id-ID')}</span>
            </div>
          </div>
          
          <div className="text-center mt-6 print:mt-4">
            <p>Terima Kasih Atas Kunjungan Anda</p>
            <p>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan</p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row gap-3 print:hidden">
          <button 
            onClick={onClose}
            className="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Tutup
          </button>
          <div className="flex flex-[2] gap-2">
            <button 
              onClick={() => onPrintRequest('58mm')}
              className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1 transition-colors shadow-sm text-sm"
            >
              <Printer size={16} /> 58mm
            </button>
            <button 
              onClick={() => onPrintRequest('80mm')}
              className="flex-1 bg-blue-800 text-white font-semibold py-2 rounded-lg hover:bg-blue-900 flex items-center justify-center gap-1 transition-colors shadow-sm text-sm"
            >
              <Printer size={16} /> 80mm
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
