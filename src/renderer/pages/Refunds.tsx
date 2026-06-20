import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'
import { formatDateTime, formatCurrency } from '@/utils/formatters'

function db() { return window.api }

interface RefundRecord {
  id: number
  refund_number: string
  original_bill_number: string
  customer_name: string
  reason: string
  reason_code: string
  items: string
  refund_amount_paise: number
  refund_method: string
  status: string
  created_at: string
}

interface SaleForRefund {
  id: number
  bill_number: string
  date: string
  customer_name: string
  sale_type: string
  total_paise: number
  created_at: string
}

const REASON_CODES = [
  { value: 'wrong_product', label: 'Wrong Product Issued' },
  { value: 'overcharged', label: 'Overcharged' },
  { value: 'cancelled', label: 'Booking Cancelled' },
  { value: 'duplicate', label: 'Duplicate Bill' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'other', label: 'Other' },
] as const

const REFUND_REASONS = ['All', ...REASON_CODES.map(r => r.label)] as const
const REFUND_METHODS = ['All', 'UPI', 'Cash', 'Cheque', 'Original']

const Refunds: React.FC = () => {
  const [refunds, setRefunds] = useState<RefundRecord[]>([])
  const [filters, setFilters] = useState({ from: '', to: '', reason: 'All', search: '', status: 'All' })
  const [selectedRefund, setSelectedRefund] = useState<RefundRecord | null>(null)

  // New refund state
  const [showNewRefund, setShowNewRefund] = useState(false)
  const [searchBill, setSearchBill] = useState('')
  const [foundSale, setFoundSale] = useState<SaleForRefund | null>(null)
  const [saleItems, setSaleItems] = useState<any[]>([])
  const [salePayments, setSalePayments] = useState<any[]>([])
  const [refundReason, setRefundReason] = useState('')
  const [refundReasonCode, setRefundReasonCode] = useState('')
  const [refundMethod, setRefundMethod] = useState('Original')
  const [selectedItems, setSelectedItems] = useState<Record<number, number>>({})
  const [note, setNote] = useState('')

  const addToast = useAppStore(s => s.addToast)

  const loadRefunds = useCallback(async () => {
    let sql = `SELECT * FROM refunds WHERE 1=1`
    const params: any[] = []

    if (filters.from) { sql += ' AND date(created_at) >= ?'; params.push(filters.from) }
    if (filters.to) { sql += ' AND date(created_at) <= ?'; params.push(filters.to) }
    if (filters.reason !== 'All') {
      const reasonCode = REASON_CODES.find(r => r.label === filters.reason)?.value
      if (reasonCode) { sql += ' AND reason_code = ?'; params.push(reasonCode) }
    }
    if (filters.status !== 'All') { sql += ' AND status = ?'; params.push(filters.status) }
    if (filters.search) {
      sql += ' AND (customer_name LIKE ? OR original_bill_number LIKE ? OR refund_number LIKE ?)'
      const s = `%${filters.search}%`
      params.push(s, s, s)
    }

    sql += ' ORDER BY created_at DESC'

    const rows = await db().dbAll(sql, params)
    setRefunds(rows as RefundRecord[])
  }, [filters])

  useEffect(() => { loadRefunds() }, [loadRefunds])

  async function lookupSale(bill: string) {
    const sale = await db().dbGet('SELECT * FROM sales WHERE bill_number = ?', [bill]) as any
    if (!sale) {
      setFoundSale(null)
      setSaleItems([])
      setSalePayments([])
      addToast('Sale not found', 'error')
      return
    }
    const items = await db().dbAll('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]) as any[]
    const payments = await db().dbAll('SELECT * FROM sale_payments WHERE sale_id = ?', [sale.id]) as any[]

    // Check if already refunded
    const existingRefund = await db().dbGet('SELECT id FROM refunds WHERE original_sale_id = ?', [sale.id]) as any
    if (existingRefund) {
      addToast('This bill already has a refund', 'warning')
      setFoundSale(null)
      setSaleItems([])
      return
    }

    setFoundSale(sale)
    setSaleItems(items)
    setSalePayments(payments)
    // Pre-select all items
    const itemMap: Record<number, number> = {}
    items.forEach((it: any) => { itemMap[it.id] = it.qty })
    setSelectedItems(itemMap)
  }

  function toggleItem(itemId: number, qty: number) {
    setSelectedItems(prev => {
      const next = { ...prev }
      if (next[itemId] === qty) {
        delete next[itemId]
      } else {
        next[itemId] = qty
      }
      return next
    })
  }

  function calculateRefundAmount(): number {
    let total = 0
    saleItems.forEach(item => {
      if (selectedItems[item.id]) {
        total += item.total_paise
      }
    })
    return total
  }

  async function getNextRefundNumber(): Promise<string> {
    const result = await db().dbGet("SELECT value FROM settings WHERE key = 'refund_prefix'") as any
    const prefix = result?.value || 'RFD'
    const count = await db().dbAll('SELECT COUNT(*) as cnt FROM refunds') as any[]
    const num = (count[0]?.cnt || 0) + 1
    return `${prefix}-${String(num).padStart(4, '0')}`
  }

  async function submitRefund() {
    if (!foundSale) return
    if (!refundReasonCode || !refundMethod) {
      addToast('Please select reason and payment method', 'warning')
      return
    }

    const refundNumber = await getNextRefundNumber()
    const refundAmount = calculateRefundAmount()

    if (refundAmount <= 0) {
      addToast('Please select at least one item for refund', 'warning')
      return
    }

    const refundedItems = saleItems.filter(item => selectedItems[item.id])
    const itemsJSON = JSON.stringify(refundedItems.map(it => ({
      name: it.product_name,
      qty: it.qty,
      unit_price: it.unit_price_paise,
      total: it.total_paise,
    })))

    try {
      await db().dbRun(
        `INSERT INTO refunds (refund_number, original_sale_id, original_bill_number, customer_name, reason, reason_code, items, refund_amount_paise, refund_method, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)`,
        [refundNumber, foundSale.id, foundSale.bill_number, foundSale.customer_name, refundReason, refundReasonCode, itemsJSON, refundAmount, refundPaymentMethod, new Date().toISOString()]
      )
      addToast(`Refund ${refundNumber} created successfully`, 'success')
      resetForm()
      loadRefunds()
    } catch (e: any) {
      addToast('Failed to create refund: ' + e.message, 'error')
    }
  }

  function resetForm() {
    setShowNewRefund(false)
    setSearchBill('')
    setFoundSale(null)
    setSaleItems([])
    setSalePayments([])
    setRefundReason('')
    setRefundReasonCode('')
    setRefundMethod('Original')
    setSelectedItems({})
    setNote('')
  }

  async function exportCsv() {
    const rows = await db().dbAll(`SELECT refund_number, original_bill_number, customer_name, reason, reason_code, refund_amount_paise, refund_method, status, created_at FROM refunds ORDER BY created_at DESC`)
    const data = (rows as any[]).map(r => ({
      RefundNumber: r.refund_number,
      OriginalBill: r.original_bill_number,
      Customer: r.customer_name,
      Reason: r.reason,
      Amount: r.refund_amount_paise / 100,
      Method: r.refund_method,
      Status: r.status,
      Date: r.created_at,
    }))
    await window.api.exportCSV('refunds', data)
    addToast('Refunds exported as CSV', 'success')
  }

  // Summary stats
  const totalRefunded = refunds.reduce((sum, r) => sum + r.refund_amount_paise, 0)
  const thisMonthRefunds = refunds.filter(r => {
    const d = new Date(r.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const thisMonthTotal = thisMonthRefunds.reduce((sum, r) => sum + r.refund_amount_paise, 0)

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="page-header shrink-0">
        <div>
          <h2>Refund Management</h2>
          <p className="subtitle">Process and track product returns and refunds</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-red btn-sm" onClick={() => setShowNewRefund(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New Refund
          </button>
          <button className="btn btn-blue btn-sm" onClick={exportCsv}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Total Refunds</div>
            <div className="text-2xl font-bold text-red-700">{refunds.length}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Total Refunded</div>
            <div className="text-2xl font-bold text-red-700">₹{formatCurrency(totalRefunded)}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">This Month</div>
            <div className="text-2xl font-bold text-blue-700">{thisMonthRefunds.length}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">This Month Amount</div>
            <div className="text-2xl font-bold text-blue-700">₹{formatCurrency(thisMonthTotal)}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 font-medium">Date:</span>
          <input type="date" className="input-field input-field-sm w-36" value={filters.from}
                 onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          <span className="text-gray-400">to</span>
          <input type="date" className="input-field input-field-sm w-36" value={filters.to}
                 onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <select className="input-field input-field-sm w-40" value={filters.reason}
                onChange={e => setFilters(f => ({ ...f, reason: e.target.value }))}>
          {REFUND_REASONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="input-field input-field-sm w-36" value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="All">All Status</option>
          <option value="Completed">Completed</option>
          <option value="Pending">Pending</option>
        </select>
        <input className="input-field input-field-sm w-64" placeholder="Search bill, customer, refund #..."
               value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {refunds.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">↩️</div>
            <h4 className="text-lg font-semibold text-gray-700 mb-1">No refunds found</h4>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Refund #</th>
                  <th>Date & Time</th>
                  <th>Original Bill</th>
                  <th>Customer</th>
                  <th>Reason</th>
                  <th className="text-right">Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map(r => (
                  <tr key={r.id}>
                    <td className="font-bold text-red-600">{r.refund_number}</td>
                    <td className="text-gray-600 text-sm">{formatDateTime(r.created_at)}</td>
                    <td><span className="badge badge-ghost">{r.original_bill_number}</span></td>
                    <td className="text-gray-800 font-medium">{r.customer_name}</td>
                    <td><span className="badge badge-warning">{r.reason}</span></td>
                    <td className="text-right text-red-600 font-bold font-mono text-base">₹{formatCurrency(r.refund_amount_paise)}</td>
                    <td><span className="badge badge-blue">{r.refund_method}</span></td>
                    <td>
                      <span className={`badge ${r.status === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRefund(r)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- NEW REFUND MODAL --- */}
      {showNewRefund && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={resetForm}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-red-50">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">New Refund</h3>
                <p className="text-sm text-gray-500">Search by bill number to start refund process</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-2xl font-light" onClick={resetForm}>✕</button>
            </div>

            <div className="p-6 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {/* Step 1: Lookup Sale */}
              <div className="mb-6">
                <label className="input-label">Search Bill Number</label>
                <div className="flex gap-3">
                  <input
                    className="input-field flex-1"
                    placeholder="Enter bill number (e.g., BILL-0001)"
                    value={searchBill}
                    onChange={e => setSearchBill(e.target.value)}
                  />
                  <button className="btn btn-blue" onClick={() => lookupSale(searchBill)}>
                    Search
                  </button>
                </div>
              </div>

              {foundSale && (
                <>
                  {/* Sale Details */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><span className="text-gray-500">Bill:</span> <span className="font-semibold">{foundSale.bill_number}</span></div>
                      <div><span className="text-gray-500">Customer:</span> <span className="font-semibold">{foundSale.customer_name}</span></div>
                      <div><span className="text-gray-500">Total:</span> <span className="font-bold text-red-600">₹{formatCurrency(foundSale.total_paise)}</span></div>
                    </div>
                  </div>

                  {/* Items to Refund */}
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Select Items to Refund</h4>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Select</th>
                            <th>Item</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Unit Price</th>
                            <th className="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {saleItems.map((item: any) => (
                            <tr key={item.id} className={selectedItems[item.id] ? 'bg-red-50' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                  checked={!!selectedItems[item.id]}
                                  onChange={() => toggleItem(item.id, item.qty)}
                                />
                              </td>
                              <td className="font-semibold text-gray-800">{item.product_name}</td>
                              <td className="text-right text-gray-600">{item.qty}</td>
                              <td className="text-right text-gray-600 font-mono">₹{formatCurrency(item.unit_price_paise)}</td>
                              <td className="text-right font-bold text-gray-900">₹{formatCurrency(item.total_paise)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Refund Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Reason */}
                    <div>
                      <label className="input-label">Refund Reason *</label>
                      <select className="input-field" value={refundReasonCode} onChange={e => {
                        setRefundReasonCode(e.target.value)
                        const reason = REASON_CODES.find(r => r.value === e.target.value)?.label || ''
                        setRefundReason(reason)
                      }}>
                        <option value="">-- Select Reason --</option>
                        {REASON_CODES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>

                      <label className="input-label mt-4">Refund Amount</label>
                      <div className="text-3xl font-bold text-red-600">₹{formatCurrency(calculateRefundAmount())}</div>

                      <label className="input-label mt-4">Note (optional)</label>
                      <textarea
                        className="input-field text-sm py-2"
                        rows={3}
                        placeholder="Add any additional notes ..."
                        value={note}
                        onChange={e => setNote(e.target.value)}
                      />
                    </div>

                    {/* Payment Info */}
                    <div>
                      <label className="input-label">Original Payment</label>
                      <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                        {salePayments.map((p: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="font-medium">{p.method}</span>
                            <span className="font-bold text-blue-700">₹{formatCurrency(p.amount_paise)}</span>
                          </div>
                        ))}
                      </div>

                      <label className="input-label mt-4">Refund Method *</label>
                      <select className="input-field" value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                        <option value="Original">Original Payment Method</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button className="btn btn-ghost flex-1" onClick={resetForm}>Cancel</button>
              {foundSale && (
                <button className="btn btn-red flex-1" onClick={submitRefund}>
                  Process Refund — ₹{formatCurrency(calculateRefundAmount())}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- DETAIL MODAL --- */}
      {selectedRefund && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedRefund(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-red-50">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedRefund.refund_number}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span>{formatDateTime(selectedRefund.created_at)}</span>
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-2xl font-light" onClick={() => setSelectedRefund(null)}>✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Sale Info */}
              <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Original Sale</h4>
                <div className="bg-gray-50 p-4 rounded-xl space-y-2">
                  <div><span className="text-gray-500">Bill #:</span> <span className="font-mono font-semibold">{selectedRefund.original_bill_number}</span></div>
                  <div><span className="text-gray-500">Customer:</span> <span className="font-semibold">{selectedRefund.customer_name}</span></div>
                </div>
              </div>

              {/* Refund Items */}
              <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Refunded Items</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr>
                    </thead>
                    <tbody>
                      {JSON.parse(selectedRefund.items).map((item: any, i: number) => (
                        <tr key={i}>
                          <td className="font-semibold">{item.name}</td>
                          <td className="text-right">{item.qty}</td>
                          <td className="text-right font-mono">₹{formatCurrency(item.unit_price)}</td>
                          <td className="text-right font-bold text-red-600">₹{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refund Details */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Refund Info</h4>
                  <div className="bg-red-50 p-4 rounded-xl space-y-2">
                    <div><span className="text-gray-500">Reason:</span> <span className="font-semibold">{selectedRefund.reason}</span></div>
                    <div><span className="text-gray-500">Method:</span> <span className="font-semibold">{selectedRefund.refund_method}</span></div>
                    <div><span className="text-gray-500">Status:</span> <span className={`badge ${selectedRefund.status === 'Completed' ? 'badge-success' : 'badge-warning'}`}>{selectedRefund.status}</span></div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Amount</h4>
                  <div className="text-3xl font-bold text-red-600">₹{formatCurrency(selectedRefund.refund_amount_paise)}</div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button className="btn btn-ghost w-full" onClick={() => setSelectedRefund(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Refunds
