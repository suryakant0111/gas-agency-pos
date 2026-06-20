import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'

function db() { return window.api }

interface ShortageReport {
  id: number
  product_name: string
  quantity: number
  type: string
  reason: string
  date: string
  reference: string
}

interface CylinderProduct {
  id: number
  name: string
  size_weight: string
}

const ShortageReports: React.FC = () => {
  const [reports, setReports] = useState<ShortageReport[]>([])
  const [products, setProducts] = useState<CylinderProduct[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ product_id: '', quantity: '', type: 'Damaged', reason: '', date: '', reference: '' })
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    const rows = await db().dbAll(`
      SELECT sr.*, gp.name as product_name FROM shortage_reports sr
      LEFT JOIN godown_products gp ON sr.product_id = gp.id
      ORDER BY sr.date DESC
    `) as ShortageReport[]
    setReports(rows)

    const cylRows = await db().dbAll(`SELECT id, name, size_weight FROM godown_products ORDER BY name`)
    setProducts(cylRows as CylinderProduct[])
  }, [])

  useEffect(() => { load() }, [load])

  async function submitReport(e: React.FormEvent) {
    e.preventDefault()
    if (!form.product_id || !form.quantity || !form.reason) return

    const qty = parseInt(form.quantity)
    if (isNaN(qty) || qty <= 0) { addToast('Enter valid quantity', 'error'); return }

    await db().dbRun(
      `INSERT INTO shortage_reports (product_id, quantity, type, reason, date, reference) VALUES (?, ?, ?, ?, ?, ?)`,
      [parseInt(form.product_id), qty, form.type, form.reason, form.date || new Date().toISOString().slice(0, 10), form.reference]
    )

    // Deduct from stock
    if (form.type === 'Damaged') {
      await db().dbRun(
        `UPDATE godown_stock SET full_count = MAX(0, full_count - ?) WHERE product_id = ?`,
        [qty, parseInt(form.product_id)]
      )
    }

    await db().dbRun(
      `INSERT INTO audit_log (event_type, entity, action_description, after_value) VALUES ('shortage', 'godown', '${form.type}: ${qty} cylinders - ${form.reason}', ?)`,
      [JSON.stringify({ type: form.type, qty, reason: form.reason })]
    )

    addToast('Shortage report logged', 'success')
    setForm({ product_id: '', quantity: '', type: 'Damaged', reason: '', date: '', reference: '' })
    setFormOpen(false)
    load()
  }

  async function exportCsv() {
    const data = reports.map(r => ({
      Product: r.product_name,
      Quantity: r.quantity,
      Type: r.type,
      Reason: r.reason,
      Date: r.date,
      Reference: r.reference,
    }))
    await window.api.exportCSV('shortage-reports', data)
    addToast('Shortage reports exported', 'success')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-dark-border flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Shortage / Damage Report</h2>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
          {!formOpen && <button className="btn-danger" onClick={() => setFormOpen(true)}>+ Report Shortage/Damage</button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {formOpen && (
          <div className="card mb-6">
            <h3 className="text-base font-semibold text-accent-amber mb-3">Report Shortage / Damage</h3>
            <form onSubmit={submitReport} className="grid grid-cols-3 gap-3">
              <div>
                <label className="input-label">Product *</label>
                <select className="input-field" value={form.product_id}
                        onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.size_weight})</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Quantity *</label>
                <input type="number" className="input-field" min="1" value={form.quantity}
                       onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Type</label>
                <select className="input-field" value={form.type}
                        onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option>Damaged</option>
                  <option>Short</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="input-label">Reason *</label>
                <input className="input-field" value={form.reason}
                       onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Date</label>
                <input type="date" className="input-field" value={form.date}
                       onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Plant Reference</label>
                <input className="input-field" value={form.reference}
                       onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
              <div className="col-span-3 flex gap-3">
                <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
                <button type="submit" className="btn-danger">Log Report</button>
              </div>
            </form>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-dark-border">
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Qty</th>
              <th className="pb-2 font-medium">Reason</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Reference</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className="border-b border-dark-border/50 hover:bg-dark-tertiary">
                <td className="py-2 text-white">{r.product_name || '(unknown)'}</td>
                <td className="py-2">{r.type === 'Damaged' ? <span className="badge-red">Damaged</span> : <span className="badge-amber">Short</span>}</td>
                <td className="py-2 text-accent-red font-bold">{r.quantity}</td>
                <td className="py-2 text-gray-400 truncate max-w-xs">{r.reason}</td>
                <td className="py-2 text-gray-500">{r.date}</td>
                <td className="py-2 text-gray-500">{r.reference || '—'}</td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={6} className="text-center text-gray-500 py-6">No shortage reports recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ShortageReports
