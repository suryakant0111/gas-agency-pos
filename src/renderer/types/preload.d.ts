interface Api {
  dbRun: (sql: string, params?: any[]) => Promise<any>
  dbGet: (sql: string, params?: any[]) => Promise<any>
  dbAll: (sql: string, params?: any[]) => Promise<any>
  exportCSV: (filename: string, data: Record<string, any>[]) => Promise<string | null>
  printBill: (html: string) => Promise<boolean>
  exportPDF: (html: string) => Promise<string | null>
  runBackup: () => Promise<boolean>
  listBackups: () => Promise<string[]>
  restoreBackup: (file: string) => Promise<boolean>
  // Passbook Scanner
  startScannerServer: () => Promise<{ url: string; qrCode: string; availableIPs: string[] }>
  stopScannerServer: () => Promise<void>
  processImage: (dataURL: string) => Promise<any>
  saveScanBookings: (bookings: Record<string, any>[]) => Promise<{ saved: number }>
  onScannerResult: (callback: (data: any) => void) => void
  onScannerProgress: (callback: (progress: number) => void) => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
