import React, { useEffect, useState, useCallback, useRef, DragEvent } from 'react'
import { useAppStore } from '@/store/app'

interface CylinderProduct {
  id: number
  name: string
  size_weight: string
}

interface ExtractedBooking {
  consumerNumber: string
  customerName: string
  bookingDate: string
  otp: string
  cylinderType: string
  quantity: number
  include: boolean
  highlight: boolean
}

interface ScanResult {
  rawText: string
  confidence: number
  extractedBookings: ExtractedBooking[]
  errors: string[]
}

const PassbookScanner: React.FC = () => {
  const [serverRunning, setServerRunning] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [serverReady, setServerReady] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [products, setProducts] = useState<CylinderProduct[]>([])
  const [dragOver, setDragOver] = useState(false)
  const addToast = useAppStore(s => s.addToast)
  const resultRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProducts = useCallback(async () => {
    try {
      const rows = await window.api.dbAll('SELECT id, name, size_weight FROM godown_products ORDER BY name')
      setProducts(rows as CylinderProduct[])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  // Listen for OCR results (from scanner server)
  useEffect(() => {
    window.api.onScannerResult((data: ScanResult) => {
      setResult(data)
      setProcessing(false)
      setOcrProgress(0)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
    window.api.onScannerProgress((progress: number) => {
      setOcrProgress(progress)
    })
  }, [])

  async function processImage(dataURL: string) {
    setProcessing(true)
    setOcrProgress(0)
    setPreview(dataURL)
    try {
      const data = await window.api.processImage(dataURL)
      setResult(data)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e: any) {
      addToast(`OCR failed: ${e.message}`, 'error')
    }
    setProcessing(false)
    setOcrProgress(0)
  }

  function readFileAsDataURL(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      addToast('Image too large (max 20MB)', 'error')
      return
    }
    if (!file.type.startsWith('image/')) {
      addToast('Select an image file', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') processImage(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readFileAsDataURL(file)
    e.target.value = ''
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readFileAsDataURL(file)
  }

  // Paste from clipboard
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          if (file) readFileAsDataURL(file)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  async function saveBookings() {
    const selected = result?.extractedBookings.filter(b => b.include) ?? []
    if (selected.length === 0) {
      addToast('No bookings selected', 'warning')
      return
    }

    const bookingsWithProduct = selected.map(b => {
      let productId: number | null = null
      if (b.cylinderType) {
        const match = products.find(p =>
          p.name.toLowerCase().includes(b.cylinderType.toLowerCase()) ||
          p.size_weight.includes(b.cylinderType)
        )
        if (match) productId = match.id
      }
      return { ...b, productId }
    })

    try {
      const res = await window.api.saveScanBookings(bookingsWithProduct)
      addToast(`${res.saved} booking(s) saved`, 'success')
      setResult(null)
      setPreview(null)
    } catch (e: any) {
      addToast(`Save failed: ${e.message}`, 'error')
    }
  }

  function updateBooking(index: number, field: keyof ExtractedBooking, value: string | number | boolean) {
    if (!result) return
    const updated = [...result.extractedBookings]
    updated[index] = { ...updated[index], [field]: value }
    setResult({ ...result, extractedBookings: updated })
  }

  function removeBooking(index: number) {
    if (!result) return
    const updated = [...result.extractedBookings]
    updated.splice(index, 1)
    setResult({ ...result, extractedBookings: updated })
  }

  function addEmptyRow() {
    if (!result) return
    const newBooking: ExtractedBooking = {
      consumerNumber: '', customerName: '', bookingDate: new Date().toISOString().slice(0, 10),
      otp: '', cylinderType: '', quantity: 1, include: true, highlight: false,
    }
    setResult({ ...result, extractedBookings: [...result.extractedBookings, newBooking] })
  }

  const selectedCount = result?.extractedBookings.filter(b => b.include).length ?? 0

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="page-header shrink-0">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">Passbook Scanner</h2>
          <p className="subtitle">Transfer passbook photo from phone and extract booking data with OCR</p>
        </div>
        <label className="btn btn-blue cursor-pointer">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload Image
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* How-to steps */}
        {!preview && !processing && (
          <div className="card">
            <h3 className="font-bold text-gray-700 mb-4">How to Scan</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold text-lg mb-2">1</span>
                <p className="text-sm font-semibold text-gray-700 mb-1">Transfer Photo to PC</p>
                <p className="text-xs text-gray-500">Send passbook photo via WhatsApp Web, Bluetooth, or USB cable</p>
              </div>
              <div className="text-center">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold text-lg mb-2">2</span>
                <p className="text-sm font-semibold text-gray-700 mb-1">Upload Image</p>
                <p className="text-xs text-gray-500">Click "Upload Image", drag & drop, or paste (Ctrl+V)</p>
              </div>
              <div className="text-center">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold text-lg mb-2">3</span>
                <p className="text-sm font-semibold text-gray-700 mb-1">Review & Save</p>
                <p className="text-xs text-gray-500">Check extracted bookings, edit if needed, then save</p>
              </div>
            </div>
          </div>
        )}

        {/* Drop Zone */}
        <div
          className={`card border-2 border-dashed transition-all cursor-pointer ${
            dragOver
              ? 'bg-blue-50 border-blue-400 scale-[1.01]'
              : 'bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center py-10">
            {preview ? (
              <div className="text-center">
                <img src={preview} alt="Preview" className="max-h-64 rounded-lg shadow-md mx-auto mb-4" />
                <p className="text-sm text-gray-600 font-semibold">Click or drag a new image to replace</p>
              </div>
            ) : (
              <>
                <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-base font-bold text-gray-500 mb-1">Drop passbook image here</p>
                <p className="text-xs text-gray-400">or click to browse, or <kbd className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-mono text-xs">Ctrl+V</kbd> to paste</p>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {processing && (
          <div className="card">
            <div className="flex items-center gap-4">
              <span className="spinner" />
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-700 mb-1">
                  {ocrProgress === 0 ? 'Loading OCR model...' : 'Reading text from image...'}
                </p>
                <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round(ocrProgress * 100)}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-gray-500">{Math.round(ocrProgress * 100)}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">First scan downloads the model (8MB), subsequent scans are faster</p>
          </div>
        )}

        {/* OCR Results */}
        {result && (
          <div ref={resultRef} className="space-y-4">
            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="card bg-amber-50 border-amber-200">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {err}
                  </div>
                ))}
              </div>
            )}

            {/* Confidence Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-500 uppercase">OCR Confidence</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    result.confidence > 70 ? 'bg-emerald-500' :
                    result.confidence > 40 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
              <span className="text-sm font-bold text-gray-600 w-10 text-right">{Math.round(result.confidence)}%</span>
            </div>

            {/* Bookings Table */}
            {result.extractedBookings.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-700">
                    Extracted Bookings ({selectedCount} selected)
                  </h3>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={addEmptyRow}>+ Add Row</button>
                    <button className="btn btn-green text-xs px-4 py-2" onClick={saveBookings} disabled={selectedCount === 0}>
                      Save {selectedCount} Booking{selectedCount !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs uppercase tracking-wide border-b">
                        <th className="pb-2 text-left">
                          <input
                            type="checkbox"
                            checked={result.extractedBookings.every(b => b.include)}
                            onChange={e => {
                              const v = e.target.checked
                              setResult({ ...result, extractedBookings: result.extractedBookings.map(b => ({ ...b, include: v })) })
                            }}
                          />
                        </th>
                        <th className="pb-2 text-left min-w-[120px]">Consumer #</th>
                        <th className="pb-2 text-left min-w-[120px]">Name</th>
                        <th className="pb-2 text-left min-w-[100px]">Date</th>
                        <th className="pb-2 text-left min-w-[80px]">OTP</th>
                        <th className="pb-2 text-left min-w-[100px]">Type</th>
                        <th className="pb-2 text-center min-w-[50px]">Qty</th>
                        <th className="pb-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.extractedBookings.map((b, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${b.highlight ? 'bg-amber-50/50' : ''}`}>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={b.include}
                              onChange={e => updateBooking(i, 'include', e.target.checked)}
                            />
                          </td>
                          <td className="py-1">
                            <input
                              className="input-field !py-1.5 !px-2 !text-xs !rounded-lg font-mono"
                              value={b.consumerNumber}
                              onChange={e => updateBooking(i, 'consumerNumber', e.target.value)}
                              placeholder="Consumer #"
                            />
                          </td>
                          <td className="py-1">
                            <input
                              className="input-field !py-1.5 !px-2 !text-xs !rounded-lg"
                              value={b.customerName}
                              onChange={e => updateBooking(i, 'customerName', e.target.value)}
                              placeholder="Name"
                            />
                          </td>
                          <td className="py-1">
                            <input
                              type="date"
                              className="input-field !py-1.5 !px-2 !text-xs !rounded-lg"
                              value={b.bookingDate}
                              onChange={e => updateBooking(i, 'bookingDate', e.target.value)}
                            />
                          </td>
                          <td className="py-1">
                            <input
                              className="input-field !py-1.5 !px-2 !text-xs !rounded-lg font-mono w-20"
                              value={b.otp}
                              onChange={e => updateBooking(i, 'otp', e.target.value)}
                              placeholder="OTP"
                            />
                          </td>
                          <td className="py-1">
                            <select
                              className="input-field !py-1.5 !px-2 !text-xs !rounded-lg"
                              value={products.find(p => p.name.includes(b.cylinderType))?.id || ''}
                              onChange={e => {
                                const p = products.find(x => x.id === parseInt(e.target.value))
                                if (p) updateBooking(i, 'cylinderType', p.name)
                              }}
                            >
                              <option value="">Select</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.size_weight})</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 text-center">
                            <input
                              type="number"
                              min="1"
                              className="input-field !py-1.5 !px-2 !text-xs !rounded-lg w-14 text-center !mx-auto"
                              value={b.quantity}
                              onChange={e => updateBooking(i, 'quantity', parseInt(e.target.value) || 1)}
                            />
                          </td>
                          <td className="py-1 text-center">
                            <button
                              onClick={() => removeBooking(i)}
                              className="text-red-400 hover:text-red-600 p-1"
                              title="Remove row"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Raw text */}
            <details className="rounded-lg border border-gray-200 bg-white">
              <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-gray-500">
                Raw OCR Text (for debugging)
              </summary>
              <pre className="px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">{result.rawText || '(no text extracted)'}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

export default PassbookScanner
