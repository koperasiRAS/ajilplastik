import qz from 'qz-tray'

let isConnected = false

export const initQZ = async () => {
  if (isConnected) return true

  try {
    // Attempt to connect to QZ Tray if not already connected
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect()
      isConnected = true
    }
    return true
  } catch (error) {
    console.error('Failed to connect to QZ Tray:', error)
    return false
  }
}

export const getPrinters = async (): Promise<string[]> => {
  const connected = await initQZ()
  if (!connected) return []

  try {
    const printers = await qz.printers.find()
    return printers
  } catch (error) {
    console.error('Failed to get printers:', error)
    return []
  }
}

export const openCashDrawer = async (printerName?: string) => {
  const connected = await initQZ()
  if (!connected) throw new Error('QZ Tray is not connected. Make sure QZ Tray is running.')

  try {
    let targetPrinter = printerName

    // If no printer name provided, try to find default or one containing "iWare"
    if (!targetPrinter) {
      const printers = await getPrinters()
      targetPrinter = printers.find(p => p.toLowerCase().includes('iware') || p.toLowerCase().includes('pos'))
      
      if (!targetPrinter && printers.length > 0) {
        // Fallback to default printer if no POS/iWare printer found by name
        targetPrinter = await qz.printers.getDefault()
      }
    }

    if (!targetPrinter) {
      throw new Error('No suitable printer found for cash drawer.')
    }

    const config = qz.configs.create(targetPrinter)

    // Standard ESC/POS kick drawer command: ESC p 0 25 250 (0x1B 0x70 0x00 0x19 0xFA)
    const data = [
      '\x1B' + '\x70' + '\x00' + '\x19' + '\xFA'
    ]

    await qz.print(config, data)
    return true
  } catch (error) {
    console.error('Failed to send cash drawer command:', error)
    throw error
  }
}
