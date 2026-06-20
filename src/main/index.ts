import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import Papa from 'papaparse'
import { writeFileSync } from 'fs'
import { getDb, runMigrations, runBackup, listBackups, restoreBackup } from './database'
import { startPassbookHTTP, stopPassbookHTTP } from './http-server'
import { recognizeFromDataUrl, preloadModel } from './passbook-ocr'
import { parsePassbookText } from './passbook-parser'

// Log preload path for debugging
const expectedPreload = join(__dirname, '..', 'preload', 'index.cjs')
const expectedHTML = process.env.ELECTRON_RENDERER_URL
  ? 'using dev URL: ' + process.env.ELECTRON_RENDERER_URL
  : join(__dirname, '..', 'renderer', 'index.html')

console.log('Preload path:', expectedPreload, '-> exists:', existsSync(expectedPreload))
console.log('HTML path:', expectedHTML)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#1a1d23',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('Renderer failed to load:', code, desc)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('render-process-gone', (_, details) => {
  console.error('Render process gone:', details)
})

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception:', e)
})

app.whenReady().then(() => {
  try {
    console.log('Running migrations...')
    runMigrations()
    console.log('Running backup...')
    runBackup()
    console.log('Creating window...')
    createWindow()
    console.log('App ready.')
    console.log('Preloading OCR model...')
    preloadModel().then(() => console.log('OCR model loaded — scans ready.')).catch(e => console.error('OCR preload failed:', e))
  } catch (e) {
    console.error('=== APP INIT ERROR ===')
    console.error(e)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        createWindow()
      } catch (e) {
        console.error(e)
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---- IPC Handlers ----

ipcMain.handle('db:run', async (_, sql: string, params?: any[]) => {
  try {
    const database = getDb()
    const stmt = database.prepare(sql)
    return stmt.run(...(params || []))
  } catch (e: any) {
    console.error('db:run error:', e.message, sql)
    throw e
  }
})

ipcMain.handle('db:get', async (_, sql: string, params?: any[]) => {
  try {
    const database = getDb()
    const stmt = database.prepare(sql)
    return stmt.get(...(params || []))
  } catch (e: any) {
    console.error('db:get error:', e.message, sql)
    throw e
  }
})

ipcMain.handle('db:all', async (_, sql: string, params?: any[]) => {
  try {
    const database = getDb()
    const stmt = database.prepare(sql)
    return stmt.all(...(params || []))
  } catch (e: any) {
    console.error('db:all error:', e.message, sql)
    throw e
  }
})

ipcMain.handle('export-csv', async (_, filename: string, data: Record<string, any>[]) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: `Save ${filename}`,
    defaultPath: `${filename}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })

  if (result.canceled) return null

  const csv = Papa.unparse(data)
  writeFileSync(result.filePath, csv, 'utf-8')
  return result.filePath
})

ipcMain.handle('print-bill', async (_, html: string) => {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  await win.loadURL(`data:text/html,${encodeURIComponent(html)}`)
  await win.webContents.print()
  win.close()
  return true
})

ipcMain.handle('export-pdf', async (_, html: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save Bill as PDF',
    defaultPath: 'bill.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (result.canceled) return null

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  await win.loadURL(`data:text/html,${encodeURIComponent(html)}`)
  const pdfData = await win.webContents.printToPDF({ pageSize: 'A5' })
  writeFileSync(result.filePath, pdfData)
  win.close()
  return result.filePath
})

ipcMain.handle('run-backup', () => {
  runBackup()
  return true
})

ipcMain.handle('list-backups', () => {
  return listBackups()
})

ipcMain.handle('restore-backup', (_, file: string) => {
  return restoreBackup(file)
})

// ─── Passbook Scanner IPC Handlers ───

ipcMain.handle('scanner:start-server', async () => {
  try {
    const info = await startPassbookHTTP()
    return info
  } catch (e: any) {
    console.error('scanner:start-server error:', e)
    throw e
  }
})

ipcMain.handle('scanner:stop-server', async () => {
  stopPassbookHTTP()
  return true
})

ipcMain.handle('scanner:process-image', async (_, dataURL: string) => {
  try {
    const { text, confidence } = await recognizeFromDataUrl(dataURL)
    return parsePassbookText(text, confidence)
  } catch (e: any) {
    console.error('scanner:process-image error:', e)
    throw e
  }
})

ipcMain.handle('scanner:save-bookings', async (_, bookings: Record<string, any>[]) => {
  try {
    const db = getDb()
    const stmt = db.prepare(
      `INSERT INTO bookings (consumer_number, customer_name, booking_date, otp, product_id, delivered, source)
       VALUES (?, ?, ?, ?, ?, 0, 'passbook-scanner')`
    )
    const tx = db.transaction((rows: Record<string, any>[]) => {
      for (const b of rows) {
        stmt.run(b.consumerNumber, b.customerName, b.bookingDate, b.otp || '', b.productId || null)
      }
    })
    tx(bookings)
    return { saved: bookings.length }
  } catch (e: any) {
    console.error('scanner:save-bookings error:', e)
    throw e
  }
})
