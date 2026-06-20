import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'
import { formatDateTime, formatCurrency } from '@/utils/formatters'

function db() { return window.api }

interface SaleDetail {
  id: number
  bill_number: string
  date: string
  customer_name: string
  consumer_number: string
  phone: string
  sale_type: string
  empty_received: string
  empty_count_received: number
  total_paise: number
  created_at: string
}

interface SaleFull {
  sale: SaleDetail
  items: any[]
  payments: any[]
}

const SALE_TYPES = ['All', 'Refill', 'New Connection', 'Counter Sale']
const PAYMENT_METHODS = ['All', 'UPI', 'Cash', 'Credit', 'Cheque']

const Transactions: React.FC = () => {
  const [sales, setSales] = useState<SaleDetail[]>([])
  const [filters, setFilters] = useState({ from: '', to: '', type: 'All', payment: 'All', search: '' })
  const [selectedSale, setSelectedSale] = useState<SaleFull | null>(null)
  const addToast = useAppStore(s => s.addToast)

  const loadSales = useCallback(async () => {
    let sql = `
      SELECT s.bill_number, s.date, s.customer_name, s.consumer_number, s.phone, s.sale_type, s.empty_received, s.empty_count_received, s.total_paise, s.created_at
      FROM sales s WHERE 1=1
    `
    const params: any[] = []

    if (filters.from) { sql += ' AND s.date >= ?'; params.push(filters.from) }
    if (filters.to) { sql += ' AND s.date <= ?'; params.push(filters.to) }
    if (filters.type !== 'All') { sql += ' AND s.sale_type = ?'; params.push(filters.type) }
    if (filters.search) {
      sql += ' AND (s.customer_name LIKE ? OR s.consumer_number LIKE ? OR s.bill_number LIKE ?)'
      const s = `%${filters.search}%`
      params.push(s, s, s)
    }

    sql += ' ORDER BY s.created_at DESC'

    const rows = await db().dbAll(sql, params)
    setSales(rows as SaleDetail[])
  }, [filters])

  useEffect(() => { loadSales() }, [loadSales])

  const [creditCustomers, setCreditCustomers] = useState<Set<string>>(new Set())

  useEffect(() => {
    db().dbAll(`SELECT DISTINCT s.customer_name FROM credit_ledger cl JOIN sales s ON cl.sale_id = s.id`).then((rows: any[]) => {
      setCreditCustomers(new Set(rows.map((r: any) => r.customer_name)))
    }).catch(() => {})
  }, [])

  async function viewSaleDetail(sale: SaleDetail) {
    const items = await db().dbAll('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]) as any[]
    const payments = await db().dbAll('SELECT * FROM sale_payments WHERE sale_id = ?', [sale.id]) as any[]
    setSelectedSale({ sale, items, payments })
  }

  async function exportCsv() {
    const rows = await db().dbAll(`SELECT bill_number, date, customer_name, consumer_number, sale_type, total_paise FROM sales ORDER BY date`)
    const data = (rows as any[]).map(r => ({
      Bill: r.bill_number,
      Date: r.date,
      Customer: r.customer_name,
      ConsumerNo: r.consumer_number,
      Type: r.sale_type,
      TotalINR: r.total_paise / 100,
    }))
    await window.api.exportCSV('transactions', data)
    addToast('Transactions exported as CSV', 'success')
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="page-header shrink-0">
        <div>
          <h2>Transactions</h2>
          <p className="subtitle">View & search all sales transactions</p>
        </div>
        <button className="btn btn-blue btn-sm" onClick={exportCsv}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
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
        <select className="input-field input-field-sm w-36" value={filters.type}
                onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
          {SALE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-field input-field-sm w-36" value={filters.payment}
                onChange={e => setFilters(f => ({ ...f, payment: e.target.value }))}>
          {PAYMENT_METHODS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex-1 min-w-[250px]">
          <input className="input-field input-field-sm w-full" placeholder="Search customer, consumer or bill #..."
                 value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {sales.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <h4 className="text-lg font-semibold text-gray-700 mb-1">No transactions found</h4>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Consumer #</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.bill_number}>
                    <td className="font-bold text-gray-900">{s.bill_number}</td>
                    <td className="text-gray-600 text-sm">{formatDateTime(s.created_at)}</td>
                    <td className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-800">{s.customer_name}</span>
                        {creditCustomers.has(s.customer_name) && (
                          <span className="badge badge-warning text-[10px]" title="Has outstanding credit">Credit</span>
                        )}
                      </div>
                    </td>
                    <td><span className="badge badge-info">{s.sale_type}</span></td>
                    <td className="text-gray-600 text-sm">{s.consumer_number || '-'}</td>
                    <td className="text-right text-emerald-600 font-bold font-mono text-base">₹{(s.total_paise / 100).toFixed(2)}</td>
                    <td className="text-right"><span className="badge badge-success">Completed</span></td>
                    <td>
                      <button className="btn btn-blue btn-sm" onClick={() => viewSaleDetail(s)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedSale(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedSale.sale.bill_number}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span>{formatDateTime(selectedSale.sale.created_at)}</span>
                  <span className="badge badge-info">{selectedSale.sale.sale_type}</span>
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-2xl font-light" onClick={() => setSelectedSale(null)}>✕</button>
            </div>

            <div className="p-6 overflow-y-auto" style={{ maxHeight: '50vh' }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Customer */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Customer Information</h4>
                    <div className="bg-gray-50 p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Name:</span>
                        <span className="font-semibold text-gray-900">{selectedSale.sale.customer_name}</span>
                        {creditCustomers.has(selectedSale.sale.customer_name) && (
                          <span className="badge badge-warning text-[10px]">Has Credit</span>
                        )}
                      </div>
                      {selectedSale.sale.consumer_number && <div><span className="text-gray-500">Consumer #:</span> <span className="font-mono">{selectedSale.sale.consumer_number}</span></div>}
                      {selectedSale.sale.phone && <div><span className="text-gray-500">Phone:</span> <span className="font-mono">{selectedSale.sale.phone}</span></div>}
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Items Purchased</h4>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Price</th>
                            <th className="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSale.items.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td className="text-gray-800 font-medium">{item.product_name}</td>
                              <td className="text-right text-gray-600">{item.qty}</td>
                              <td className="text-right text-gray-600 font-mono">₹{(item.unit_price_paise / 100).toFixed(2)}</td>
                              <td className="text-right font-bold text-emerald-600">₹{(item.total_paise / 100).toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr className="font-bold text-gray-900 bg-emerald-50">
                            <td colSpan={3} className="text-right py-3">Total</td>
                            <td className="text-right text-emerald-700 text-lg">₹{(selectedSale.sale.total_paise / 100).toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Payments */}
                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Details</h4>
                  <div className="bg-blue-50 p-4 rounded-xl space-y-2">
                    {selectedSale.payments.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="font-medium text-gray-700">{p.method}</span>
                        <span className="font-bold text-blue-700">₹{(p.amount_paise / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Additional Info</h4>
                  <div className="bg-gray-50 p-4 rounded-xl space-y-2">
                    <div><span className="text-gray-500">Empty Received:</span> <span className="font-semibold">{selectedSale.sale.empty_received}</span></div>
                    {selectedSale.sale.empty_count_received > 0 && (
                      <div><span className="text-gray-500">Empty Count:</span> <span className="font-semibold">{selectedSale.sale.empty_count_received}</span></div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button className="btn btn-ghost w-full" onClick={() => setSelectedSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Transactions
