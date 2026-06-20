import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'
import { formatCurrency, formatDate } from '@/utils/formatters'

function db() { return window.api }

interface CreditEntry {
  id: number
  customer_name: string
  phone: string
  sale_id: number
  original_paise: number
  paid_paise: number
  status: string
  created_at: string
  bill_number?: string
}

interface PendingEmpty {
  customer_name: string
  empties: number
}

interface CustomerDebtor {
  name: string
  phone: string
  totalOutstanding: number
  totalPaid: number
  totalOriginal: number
  pendingEmpties: number
  entries: CreditEntry[]
  id: number
}

const CREDIT_PAYMENT_METHODS = ['UPI', 'Cash', 'Cheque'] as const

interface CreditPayment {
  id: number
  credit_id: number
  amount_paise: number
  method: string
  date: string
  note: string
}

const CreditManagement: React.FC = () => {
  const [customerDebtors, setCustomerDebtors] = useState<CustomerDebtor[]>([])
  const [pendingEmptiesList, setPendingEmptiesList] = useState<PendingEmpty[]>([])
  const [paymentForm, setPaymentForm] = useState({ open: false, creditId: 0, customerName: '', amount: '', method: CREDIT_PAYMENT_METHODS[0], note: '' })
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [expandedEntries, setExpandedEntries] = useState<CreditEntry[]>([])
  const [paymentHistory, setPaymentHistory] = useState<CreditPayment[]>([])
  const [historyModal, setHistoryModal] = useState({ open: false, creditId: 0, customerName: '' })
  const addToast = useAppStore(s => s.addToast)

  const loadDebtors = useCallback(async () => {
    try {
      const rows = await db().dbAll(`
        SELECT cl.*, s.bill_number FROM credit_ledger cl
        LEFT JOIN sales s ON cl.sale_id = s.id
        WHERE cl.status != 'Closed' ORDER BY cl.created_at DESC
      `)
      const credits = rows as CreditEntry[]

      // Group by customer
      const customerMap = new Map<string, CustomerDebtor>()
      for (const c of credits) {
        if (!customerMap.has(c.customer_name)) {
          customerMap.set(c.customer_name, {
            name: c.customer_name,
            phone: c.phone,
            totalOutstanding: 0,
            totalPaid: 0,
            totalOriginal: 0,
            pendingEmpties: 0,
            entries: [],
            id: c.id,
          })
        }
        const cust = customerMap.get(c.customer_name)!
        cust.totalOriginal += c.original_paise
        cust.totalPaid += c.paid_paise
        cust.totalOutstanding += c.original_paise - c.paid_paise
        cust.entries.push(c)
      }

      // Get pending empties from audit_log
      const empties = await db().dbAll(`
        SELECT action_description, CAST(after_value AS INTEGER) as empties
        FROM audit_log WHERE event_type = 'empty_not_returned'
      `) as any[]

      const emptiesMap = new Map<string, number>()
      for (const e of empties) {
        // Extract customer name from action_description: "X empty cylinder(s) pending return from CUSTOMER_NAME"
        const match = e.action_description?.match(/from (.+)$/)
        if (match) {
          const name = match[1]
          emptiesMap.set(name, (emptiesMap.get(name) || 0) + e.empties)
        }
      }

      for (const [, cust] of customerMap) {
        cust.pendingEmpties = emptiesMap.get(cust.name) || 0
      }

      setCustomerDebtors(Array.from(customerMap.values()))
      setPendingEmptiesList(Array.from(emptiesMap, ([name, empties]) => ({ customer_name: name, empties })))
    } catch (err: any) {
      addToast(`Error loading credits: ${err.message}`, 'error')
    }
  }, [addToast])

  useEffect(() => { loadDebtors() }, [loadDebtors])

  async function viewPaymentHistory(creditId: number, customerName: string) {
    setHistoryModal({ open: true, creditId, customerName })
    const payments = await db().dbAll('SELECT * FROM credit_payments WHERE credit_id = ? ORDER BY date DESC', [creditId])
    setPaymentHistory(payments as CreditPayment[])
  }

  async function viewCustomerCredits(customerName: string) {
    if (expandedCustomer === customerName) {
      setExpandedCustomer(null)
      return
    }
    setExpandedCustomer(customerName)
    const rows = await db().dbAll(`
      SELECT cl.*, s.bill_number FROM credit_ledger cl
      LEFT JOIN sales s ON cl.sale_id = s.id
      WHERE cl.customer_name = ? ORDER BY cl.created_at DESC
    `, [customerName])
    setExpandedEntries(rows as CreditEntry[])
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault()
    const f = paymentForm
    if (!f.creditId) { addToast('No credit selected', 'error'); return }
    if (!f.amount || parseFloat(f.amount) <= 0) { addToast('Enter a valid amount', 'error'); return }

    const amountPaise = Math.round(parseFloat(f.amount) * 100)

    try {
      await db().dbRun(
        `INSERT INTO credit_payments (credit_id, method, amount_paise, date, note)
         VALUES (?, ?, ?, ?, ?)`,
        [f.creditId, f.method, amountPaise, new Date().toISOString().slice(0, 10), f.note]
      )

      await db().dbRun(
        `UPDATE credit_ledger SET paid_paise = paid_paise + ? WHERE id = ?`,
        [amountPaise, f.creditId]
      )

      const entry = customerDebtors.flatMap(c => c.entries).find(en => en.id === f.creditId)
      const newPaid = (entry?.paid_paise || 0) + amountPaise
      const newStatus = newPaid >= (entry?.original_paise || 0) ? 'Closed' : 'Partial'
      await db().dbRun(
        `UPDATE credit_ledger SET status = ? WHERE id = ?`,
        [newStatus, f.creditId]
      )

      addToast(`Payment recorded for ${f.customerName}`, 'success')
      setPaymentForm({ open: false, creditId: 0, customerName: '', amount: '', method: CREDIT_PAYMENT_METHODS[0], note: '' })
      loadDebtors()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  async function exportCsv() {
    const rows = await db().dbAll(`
      SELECT cl.*, s.bill_number FROM credit_ledger cl
      LEFT JOIN sales s ON cl.sale_id = s.id
      WHERE cl.status != 'Closed' ORDER BY cl.created_at DESC
    `)
    const data = (rows as any[]).map(r => ({
      Customer: r.customer_name,
      Phone: r.phone,
      BillNo: r.bill_number || 'N/A',
      Original: r.original_paise / 100,
      Paid: r.paid_paise / 100,
      Balance: (r.original_paise - r.paid_paise) / 100,
      Status: r.status,
      Date: r.created_at,
    }))
    await window.api.exportCSV('credit-report', data)
    addToast('Credit report exported', 'success')
  }

  const totalOutstanding = customerDebtors.reduce((s, c) => s + c.totalOutstanding, 0)
  const totalPendingEmpties = customerDebtors.reduce((s, c) => s + c.pendingEmpties, 0)
  const topDebtors = [...customerDebtors].sort((a, b) => b.totalOutstanding - a.totalOutstanding).slice(0, 10)

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="page-header shrink-0">
        <div>
          <h2>Credit Management</h2>
          <p className="subtitle">Track outstanding payments and pending empty cylinders</p>
        </div>
        <button className="btn btn-blue btn-sm" onClick={exportCsv}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card border-l-4 border-l-amber-500">
            <div className="text-sm font-semibold text-gray-500 uppercase mb-1">Total Outstanding</div>
            <div className="text-3xl font-extrabold text-amber-600">₹{formatCurrency(totalOutstanding)}</div>
            <div className="text-sm text-gray-500 mt-1">{customerDebtors.length} debtor{customerDebtors.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="card border-l-4 border-l-blue-500">
            <div className="text-sm font-semibold text-gray-500 uppercase mb-1">Total Collected</div>
            <div className="text-3xl font-extrabold text-blue-600">₹{formatCurrency(customerDebtors.reduce((s, c) => s + c.totalPaid, 0))}</div>
            <div className="text-sm text-gray-500 mt-1">From all credit sales</div>
          </div>
          <div className="card border-l-4 border-l-red-500">
            <div className="text-sm font-semibold text-gray-500 uppercase mb-1">Pending Empty Cylinders</div>
            <div className="text-3xl font-extrabold text-red-600">{totalPendingEmpties}</div>
            <div className="text-sm text-gray-500 mt-1">Empties not returned by customers</div>
          </div>
        </div>

        {/* Expanded Customer Credits */}
        {expandedCustomer && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <div className="card-header">
              <div>
                <h3>Credit History: {expandedCustomer}</h3>
                <p className="subtitle">{expandedEntries.length} credit transaction(s)</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setExpandedCustomer(null)}>Close</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Date</th>
                    <th className="text-right">Original</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expandedEntries.map(entry => (
                    <tr key={entry.id}>
                      <td className="font-mono text-sm font-semibold">{entry.bill_number || 'N/A'}</td>
                      <td className="text-gray-500 text-sm">{formatDate(entry.created_at)}</td>
                      <td className="text-right font-mono text-gray-600">₹{formatCurrency(entry.original_paise)}</td>
                      <td className="text-right font-mono text-blue-600">₹{formatCurrency(entry.paid_paise)}</td>
                      <td className="text-right font-bold text-red-600">₹{formatCurrency(entry.original_paise - entry.paid_paise)}</td>
                      <td>
                        <span className={`badge ${entry.status === 'Closed' ? 'badge-success' : entry.status === 'Partial' ? 'badge-warning' : 'badge-danger'}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex gap-1 justify-end">
                          {entry.status !== 'Closed' && (
                            <button className="btn btn-blue btn-sm" onClick={() => setPaymentForm({ open: true, creditId: entry.id, customerName: entry.customer_name, amount: '', method: CREDIT_PAYMENT_METHODS[0], note: '' })}>
                              Record Payment
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => viewPaymentHistory(entry.id, entry.customer_name)} title="View payment history">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Debtors Table */}
        {topDebtors.length > 0 && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>Outstanding Credits</h3>
                <p className="subtitle">{customerDebtors.length} customer{customerDebtors.length !== 1 ? 's' : ''} with unpaid balances</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th className="text-right">Original</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-center">Pending Empties</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topDebtors.map(c => (
                    <tr key={c.name} className={c.pendingEmpties > 0 ? 'bg-red-50/30' : ''}>
                      <td>
                        <button className="font-semibold text-gray-900 hover:text-blue-600 underline decoration-dotted underline-offset-2 cursor-pointer" onClick={() => viewCustomerCredits(c.name)} title="View all credits for this customer">
                          {c.name}
                        </button>
                      </td>
                      <td className="text-gray-600">{c.phone || '-'}</td>
                      <td className="text-right font-mono text-gray-600">₹{formatCurrency(c.totalOriginal)}</td>
                      <td className="text-right font-mono text-blue-600">₹{formatCurrency(c.totalPaid)}</td>
                      <td className="text-right font-bold text-red-600 text-lg">₹{formatCurrency(c.totalOutstanding)}</td>
                      <td className="text-center">
                        {c.pendingEmpties > 0 ? (
                          <span className="badge badge-danger">{c.pendingEmpties} empty(s)</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {c.entries.filter(e => e.status !== 'Closed').map(entry => (
                            <button key={entry.id} className="btn btn-blue btn-sm" onClick={() => setPaymentForm({ open: true, creditId: entry.id, customerName: entry.customer_name, amount: '', method: CREDIT_PAYMENT_METHODS[0], note: '' })}>
                              Pay ({entry.bill_number})
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {customerDebtors.length === 0 && (
          <div className="card text-center py-12">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-12 h-12 mx-auto text-gray-400 mb-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-semibold text-gray-700 mb-1">No credit outstanding</p>
            <p className="text-sm text-gray-500">All sales have been paid in full</p>
          </div>
        )}
      </div>

      {/* Payment Recording Modal */}
      {paymentForm.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPaymentForm(f => ({ ...f, open: false }))}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Record Payment</h3>
                <p className="text-sm text-gray-500">Customer: {paymentForm.customerName}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-2xl font-light" onClick={() => setPaymentForm(f => ({ ...f, open: false }))}>✕</button>
            </div>
            <form onSubmit={recordPayment} className="p-6 space-y-5">
              <div>
                <label className="input-label">Payment Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="number"
                    className="input-field input-field-lg pl-8"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Payment Method</label>
                <select className="input-field" value={paymentForm.method}
                        onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}>
                  {CREDIT_PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Note (optional)</label>
                <input className="input-field" value={paymentForm.note}
                       onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} placeholder="Add a note..." />
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn btn-ghost flex-1" onClick={() => setPaymentForm(f => ({ ...f, open: false }))}>Cancel</button>
                <button type="submit" className="btn btn-green flex-1">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {historyModal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setHistoryModal(h => ({ ...h, open: false }))}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Payment History</h3>
                <p className="text-sm text-gray-500">Customer: {historyModal.customerName}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-2xl font-light" onClick={() => setHistoryModal(h => ({ ...h, open: false }))}>✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3" style={{ maxHeight: '50vh' }}>
              {paymentHistory.length === 0 ? (
                <div className="text-center text-gray-400 py-10">
                  <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No payments recorded yet</p>
                </div>
              ) : (
                paymentHistory.map(p => (
                  <div key={p.id} className="flex gap-4 items-start p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">₹{formatCurrency(p.amount_paise)}</span>
                        <span className={`badge ${p.method === 'UPI' ? 'badge-info' : p.method === 'Cash' ? 'badge-success' : 'badge-neutral'}`}>{p.method}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(p.date)}
                        {p.note && <span className="ml-2 text-gray-600 italic">— {p.note}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button className="btn btn-ghost w-full" onClick={() => setHistoryModal(h => ({ ...h, open: false }))}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreditManagement
