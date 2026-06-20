const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  dbRun: (sql: string, params?: any[]) => ipcRenderer.invoke('db:run', sql, params),
  dbGet: (sql: string, params?: any[]) => ipcRenderer.invoke('db:get', sql, params),
  dbAll: (sql: string, params?: any[]) => ipcRenderer.invoke('db:all', sql, params),
  exportCSV: (filename: string, data: Record<string, any>[]) => ipcRenderer.invoke('export-csv', filename, data),
  printBill: (html: string) => ipcRenderer.invoke('print-bill', html),
  exportPDF: (html: string) => ipcRenderer.invoke('export-pdf', html),
  runBackup: () => ipcRenderer.invoke('run-backup'),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  restoreBackup: (file: string) => ipcRenderer.invoke('restore-backup', file),
  // Passbook Scanner
  startScannerServer: () => ipcRenderer.invoke('scanner:start-server'),
  stopScannerServer: () => ipcRenderer.invoke('scanner:stop-server'),
  processImage: (dataURL: string) => ipcRenderer.invoke('scanner:process-image', dataURL),
  saveScanBookings: (bookings: Record<string, any>[]) => ipcRenderer.invoke('scanner:save-bookings', bookings),
  onScannerResult: (callback: (data: any) => void) => {
    ipcRenderer.on('scanner:ocr-result', (_, data) => callback(data))
  },
  onScannerProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('scanner:progress', (_, progress) => callback(progress))
  },
})
