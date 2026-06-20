import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'

function db() { return window.api }

interface ServiceEntry {
  id: number
  customer_name: string
  phone: string
  item_type: string
  issue_description: string
  charge_paise: number
  status: string
  created_at: string
  completed_at: string
}

const ITEM_TYPES = ['Regulator', 'Stove', 'Pipe', 'Other']

const ServiceLog: React.FC = () => {
  const [services, setServices] = useState<ServiceEntry[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ customer_name: '', phone: '', item_type: ITEM_TYPES[0], issue_description: '', charge: '' as any })
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    const rows = await db().dbAll(`SELECT * FROM service_log ORDER BY created_at DESC`)
    setServices(rows as ServiceEntry[])
  }, [])

  useEffect(() => { load() }, [load])

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name || !form.issue_description) return

    const charge = parseInt(form.charge) || 0
    await db().dbRun(
      `INSERT INTO service_log (customer_name, phone, item_type, issue_description, charge_paise) VALUES (?, ?, ?, ?, ?)`,
      [form.customer_name, form.phone, form.item_type, form.issue_description, charge]
    )

    addToast('Service job logged', 'success')
    setForm({ customer_name: '', phone: '', item_type: ITEM_TYPES[0], issue_description: '', charge: '' })
    setFormOpen(false)
    load()
  }

  async function updateStatus(id: number, status: string) {
    const now = status === 'Completed' ? new Date().toISOString() : ''
    await db().dbRun(`UPDATE service_log SET status = ?, completed_at = ? WHERE id = ?`, [status, now, id])
    addToast(`Job marked as ${status}`, 'success')
    load()
  }

  async function exportCsv() {
    const data = services.map(s => ({
      Customer: s.customer_name,
      Phone: s.phone,
      Item: s.item_type,
      Issue: s.issue_description,
      Charge: s.charge_paise / 100,
      Status: s.status,
      Date: s.created_at,
      CompletedAt: s.completed_at,
    }))
    await window.api.exportCSV('service-log', data)
    addToast('Service log exported', 'success')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-dark-border flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Service / Repair Log</h2>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
          {!formOpen && <button className="btn-warning" onClick={() => setFormOpen(true)}>+ New Service Job</button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Service Form */}
        {formOpen && (
          <div className="card mb-6">
            <h3 className="text-base font-semibold text-accent-amber mb-3">New Service Job</h3>
            <form onSubmit={submitForm} className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Customer Name *</label>
                <input className="input-field" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Phone</label>
                <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Item Type</label>
                <select className="input-field" value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}>
                  {ITEM_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Charge (₹)</label>
                <input type="number" className="input-field" value={form.charge} onChange={e => setForm(f => ({ ...f, charge: e.target.value }) )} />
              </div>
              <div className="col-span-2">
                <label className="input-label">Issue Description *</label>
                <textarea className="input-field" rows={2} value={form.issue_description}
                          onChange={e => setForm(f => ({ ...f, issue_description: e.target.value }))} />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
                <button type="submit" className="btn-success">Log Service Job</button>
              </div>
            </form>
          </div>
        )}

        {/* Service Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-dark-border">
              <th className="pb-2 font-medium">Customer</th>
              <th className="pb-2 font-medium">Phone</th>
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 font-medium">Issue</th>
              <th className="pb-2 font-medium">Charge</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => (
              <tr key={s.id} className="border-b border-dark-border/50 hover:bg-dark-tertiary">
                <td className="py-2 text-white">{s.customer_name}</td>
                <td className="py-2 text-gray-400">{s.phone || '-'}</td>
                <td className="py-2 text-gray-300">{s.item_type}</td>
                <td className="py-2 text-gray-400 text-xs truncate max-w-xs">{s.issue_description}</td>
                <td className="py-2 text-gray-300">₹{(s.charge_paise / 100).toFixed(2)}</td>
                <td className="py-2">
                  {s.status === 'Completed' ? <span className="badge-green">Completed</span> :
                   s.status === 'Rejected' ? <span className="badge-red">Rejected</span> :
                   <span className="badge-amber">Pending</span>}
                </td>
                <td className="py-2 text-gray-400 text-xs">{s.created_at}</td>
                <td className="py-2 flex gap-1">
                  {s.status === 'Pending' && (
                    <>
                      <button className="btn-success !py-1 !px-2 !text-xs" onClick={() => updateStatus(s.id, 'Completed')}>Done</button>
                      <button className="btn-danger !py-1 !px-2 !text-xs" onClick={() => updateStatus(s.id, 'Rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr><td colSpan={8} className="text-center text-gray-500 py-6">No service jobs logged</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ServiceLog
