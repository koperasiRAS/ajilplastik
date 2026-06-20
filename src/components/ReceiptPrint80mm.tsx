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

export default function ReceiptPrint80mm({ 
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
      {/* Injecting print styles for 80mm paper size */}
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            width: 80mm;
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/70 z-100 flex items-center justify-center backdrop-blur-sm p-4 print:bg-transparent print:p-0 print:m-0">
        <div className="bg-white w-full max-w-md rounded-lg shadow-2xl overflow-hidden flex flex-col print:shadow-none print:w-auto print:m-0 print:border-none">
          <div className="p-3 bg-green-600 text-white text-center flex items-center justify-center gap-2 print:hidden">
            <CheckCircle2 size={20} />
            <span className="font-bold">{isReprint ? 'Preview Cetak Ulang Struk (80mm)' : 'Transaksi Berhasil (80mm)'}</span>
          </div>
          
          {/* Receipt Content - Area ini yang akan dicetak, diset lebarnya ke 72mm (active area) */}
          <div id="print-area" className="p-4 bg-white font-mono text-sm text-black font-bold mx-auto print:p-2" style={{ width: '72mm' }}>
            <div className="text-center mb-4 border-b border-dashed border-gray-400 pb-4">
              <h2 className="text-xl print:text-lg font-bold mb-1">AJIL PLASTIK</h2>
              <p>{data.branchName}</p>
              <p>{data.date.toLocaleString('id-ID')}</p>
              <p>No: {data.transaction_number}</p>
              <p>Kasir: {data.cashierName}</p>
              {isReprint && <p className="font-bold mt-1">(CETAK ULANG)</p>}
            </div>

            <div className="space-y-2 print:space-y-1 mb-4 border-b border-dashed border-gray-400 pb-4 print:pb-2 print:mb-2">
              <div className="grid grid-cols-[3fr_2fr_2fr] gap-1 border-b border-gray-200 pb-1 mb-1 font-bold text-xs uppercase">
                <span>Item</span>
                <span className="text-right">QtyxHrg</span>
                <span className="text-right">Subtotal</span>
              </div>
              {data.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[3fr_2fr_2fr] gap-1 items-start text-sm">
                  <span className="font-bold whitespace-normal leading-tight">{item.product_name}</span>
                  <span className="text-right">{item.quantity}x {item.price.toLocaleString('id-ID')}</span>
                  <span className="text-right">{item.subtotal.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 mb-4 border-b border-dashed border-gray-400 pb-4 print:pb-2 print:mb-2 text-sm">
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
              <div className="flex justify-between font-bold text-base mt-1 pt-1 border-t border-gray-200">
                <span>TOTAL:</span>
                <span>{data.total.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Bayar ({data.paymentMethod.toUpperCase()}):</span>
                <span>{data.amountPaid.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span>Kembali:</span>
                <span>{data.change.toLocaleString('id-ID')}</span>
              </div>
            </div>
            
            <div className="text-center mt-6 print:mt-4 text-xs">
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
