/**
 * Mendapatkan string tanggal (YYYY-MM-DD) berdasarkan Timezone Indonesia (WIB - Asia/Jakarta).
 * Ini mencegah bug "hari kemarin" akibat isolasi waktu UTC pada dini hari WIB.
 */
export const getLocalISODate = (date: Date = new Date()): string => {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}
