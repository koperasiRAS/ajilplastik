import qz from 'qz-tray'

/**
 * Ensures the QZ Tray WebSocket is connected.
 * Always verifies the live connection state via qz.websocket.isActive()
 * instead of relying on a stale module-level flag.
 */
export const initQZ = async (): Promise<boolean> => {
  try {
    if (qz.websocket.isActive()) {
      return true
    }
    await qz.websocket.connect()
    return true
  } catch (error) {
    console.error('[QZ Tray] Connection failed:', error)
    return false
  }
}

/**
 * Returns a list of all printers visible to QZ Tray.
 */
export const getPrinters = async (): Promise<string[]> => {
  const connected = await initQZ()
  if (!connected) return []

  try {
    const printers = await qz.printers.find()
    return printers
  } catch (error) {
    console.error('[QZ Tray] Failed to enumerate printers:', error)
    return []
  }
}

/**
 * Sends the ESC/POS kick-drawer command to the specified (or auto-detected) printer.
 *
 * Key design decisions:
 *  - `forceRaw: true` bypasses the Windows GDI print driver entirely,
 *    sending bytes directly to the printer port. This prevents the
 *    "spooler hang" bug where a previous window.print() GDI job locks the
 *    printer queue and silently blocks subsequent RAW jobs from QZ Tray.
 *  - The connection is verified live (not via a stale flag) so that a
 *    dropped WebSocket is detected and re-established transparently.
 *  - Errors always propagate to the caller — no silent failures.
 */
export const openCashDrawer = async (printerName?: string): Promise<boolean> => {
  const connected = await initQZ()
  if (!connected) {
    throw new Error('QZ Tray tidak terhubung. Pastikan QZ Tray sedang berjalan di komputer ini.')
  }

  let targetPrinter = printerName

  // Auto-detect printer if none specified
  if (!targetPrinter) {
    const printers = await getPrinters()
    targetPrinter = printers.find(
      p => p.toLowerCase().includes('iware') || p.toLowerCase().includes('pos')
    )

    if (!targetPrinter && printers.length > 0) {
      targetPrinter = await qz.printers.getDefault()
    }
  }

  if (!targetPrinter) {
    throw new Error('Tidak ada printer yang terdeteksi untuk cash drawer.')
  }

  // forceRaw: true is CRITICAL — it bypasses the Windows GDI driver and
  // sends bytes directly to the printer port, avoiding spooler conflicts
  // with Chrome's window.print() GDI jobs.
  const config = qz.configs.create(targetPrinter, { forceRaw: true })

  // ESC/POS command sequence:
  //   \x1B\x40       = ESC @ — Initialize/reset printer to default state
  //   \x1B\x70\x00\x19\xFA = ESC p 0 25 250 — Kick cash drawer pin 2
  const data = [
    '\x1B\x40',
    '\x1B\x70\x00\x19\xFA'
  ]

  await qz.print(config, data)
  return true
}
