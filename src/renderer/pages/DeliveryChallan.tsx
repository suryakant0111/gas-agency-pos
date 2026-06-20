import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'

function db() { return window.api }

interface Challan {
  id: number
  challan_number: string
  date: string
  customer_name: string
  address: string
  items: string  // JSON array
  total_paise: number
  status: string
  created_at: string
}

interface ChallanItem {
  name: string
  qty: number
  price_paise: number
}

interface CylinderProduct {
  id: number
  name: string
  size_weight: string
  default_price_paise: number
}

interface AccessoryProduct {
  id: number
  name: string
  price_paise: number
}

const DeliveryChallan: React.FC = () => {
  const [challans, setChallans] = useState<Challan[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ customer_name: '', address: '', items: [] as ChallanItem[] })
  const [cylinders, setCylinders] = useState<CylinderProduct[]>([])
  const [accessories, setAccessories] = useState<AccessoryProduct[]>([])
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    const rows = await db().dbAll(`SELECT * FROM delivery_challans ORDER BY created_at DESC`)
    setChallans(rows as Challan[])

    const cylRows = await db().dbAll(`SELECT id, name, size_weight, default_price_paise FROM godown_products ORDER BY name`)
    setCylinders(cylRows as CylinderProduct[])

    const accRows = await db().dbAll(`SELECT id, name, price_paise FROM shop_products ORDER BY name`)
    setAccessories(accRows as AccessoryProduct[])
  }, [])

  useEffect(() => { load() }, [load])

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1, price_paise: 0 }] }))
  }

  function updateItem(idx: number, field: keyof ChallanItem, value: string | number) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      return { ...f, items }
    })
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const totalPaise = form.items.reduce((s, i) => s + i.price_paise * i.qty, 0)

  async function createChallan(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name || form.items.length === 0) return

    // Generate challan number
    const counter = await db().dbGet("SELECT value FROM settings WHERE key = 'challan_counter'") as any
    const num = parseInt(counter?.value || '0') + 1
    await db().dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('challan_counter', ?)", [String(num)])
    await db().dbRun("UPDATE settings SET value = ? WHERE key = 'challan_counter'", [String(num)])
    const challanNumber = `CHALLAN-${String(num).padStart(4, '0')}`

    await db().dbRun(
      `INSERT INTO delivery_challans (challan_number, customer_name, address, items, total_paise, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [challanNumber, form.customer_name, form.address, JSON.stringify(form.items), totalPaise]
    )

    await db().dbRun(
      `INSERT INTO audit_log (event_type, entity, action_description) VALUES ('delivery', 'challan', 'Created challan ${challanNumber} for ${form.customer_name}')`
    )

    addToast(`Challan ${challanNumber} created`, 'success')
    setForm({ customer_name: '', address: '', items: [] })
    setFormOpen(false)
    load()
  }

  async function updateStatus(id: number, status: string) {
    await db().dbRun(`UPDATE delivery_challans SET status = ? WHERE id = ?`, [status, id])
    addToast(`Challan marked as ${status}`, 'success')
    load()
  }

  function printChallan(challan: Challan) {
    const items = JSON.parse(challan.items) as ChallanItem[]
    const html = `
      <html><head><style>
        body { font-family: monospace; padding: 20px; max-width: 600px; }
        h2 { text-align: center; margin: 0; }
        .line { border-top: 1px dashed #999; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 3px 5px; border: 1px solid #ccc; }
        .right { text-align: right; }
      </style></head><body>
        <h2>DELIVERY CHALLAN</h2>
        <p><strong>${challan.challan_number}</strong> | Date: ${challan.date}</p>
        <p>Customer: ${challan.customer_name}<br>Address: ${challan.address || '-'}</p>
        <div class="line"></div>
        <table>
          <tr><th>Item</th><th>Qty</th><th>Price</th><th class="right">Total</th></tr>
          ${items.map(i => `<tr><td>${i.name}</td><td>${i.qty}</td><td>&#8377;${(i.price_paise/100).toFixed(2)}</td><td class="right">&#8377;${(i.price_paise * i.qty / 100).toFixed(2)}</td></tr>`).join('')}
          <tr><td colspan="3" class="right"><strong>Total</strong></td><td class="right"><strong>&#8377;${(challan.total_paise/100).toFixed(2)}</strong></td></tr>
        </table>
        <div class="line"></div>
        <p>Status: ${challan.status}</p>
        <p>Signature: _______________</p>
      </body></html>
    `
    window.api.printBill(html)
    addToast('Challan sent to printer', 'success')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-dark-border flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Delivery Challan</h2>
        {!formOpen && <button className="btn-warning" onClick={() => setFormOpen(true)}>+ New Challan</button>}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {formOpen && (
          <div className="card mb-6">
            <h3 className="text-base font-semibold text-accent-amber mb-3">New Delivery Challan</h3>
            <form onSubmit={createChallan}>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="input-label">Customer Name *</label>
                  <input className="input-field" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <label className="input-label">Delivery Address</label>
                  <input className="input-field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
              </div>

              {/* Items */}
              <h4 className="text-sm font-medium text-gray-300 mb-2">Items</h4>
              <div className="space-y-2 mb-4">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="input-label">Product</label>
                      <select className="input-field" value={item.name + '__' + item.price_paise}
                              onChange={e => {
                                const [name, price] = e.target.value.split('__')
                                updateItem(idx, 'name', name)
                                updateItem(idx, 'price_paise', parseInt(price) || 0)
                              }}>
                        <option value="">Select product</option>
                        <optgroup label="Cylinders">
                          {cylinders.map(p => <option key={p.id} value={`${p.name} (${p.size_weight})__${p.default_price_paise}`}>{p.name} ({p.size_weight})</option>)}
                        </optgroup>
                        <optgroup label="Accessories">
                          {accessories.map(p => <option key={p.id} value={`${p.name}__${p.price_paise}`}>{p.name}</option>)}
                        </optgroup>
                      </select>
                    </div>
                    <div className="w-16">
                      <label className="input-label">Qty</label>
                      <input type="number" className="input-field" min="1" value={item.qty}
                             onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 1)} />
                    </div>
                    {form.items.length > 1 && (
                      <button type="button" className="text-accent-red mb-2" onClick={() => removeItem(idx)}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" className="text-xs text-accent-blue hover:underline" onClick={addItem}>+ Add item</button>
              </div>

              {totalPaise > 0 && (
                <div className="mb-4 text-right">
                  <span className="text-lg font-bold text-accent-green">Total: ₹{(totalPaise / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
                <button type="submit" className="btn-success">Create Challan</button>
              </div>
            </form>
          </div>
        )}

        {/* Challan List */}
        <div className="space-y-3">
          {challans.map(c => {
            const items = JSON.parse(c.items) as ChallanItem[]
            return (
              <div key={c.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-base font-bold text-white">{c.challan_number}</h4>
                    <p className="text-xs text-gray-400">{c.date} • {c.customer_name} • {c.address || '—'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${c.status === 'Delivered' ? 'text-accent-green' : c.status === 'Cancelled' ? 'text-accent-red' : 'text-accent-amber'}`}>
                      {c.status}
                    </span>
                    <span className="text-accent-green font-mono">₹{(c.total_paise / 100).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-2 mb-2 text-sm">
                  {items.map((item, i) => (
                    <span key={i} className="bg-dark-tertiary rounded px-2 py-1 text-xs text-gray-300">
                      {item.name} × {item.qty}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  {c.status === 'Pending' && (
                    <>
                      <button className="btn-success !py-1 !px-3 !text-xs" onClick={() => updateStatus(c.id, 'Delivered')}>Mark Delivered</button>
                      <button className="btn-danger !py-1 !px-3 !text-xs" onClick={() => updateStatus(c.id, 'Cancelled')}>Cancel</button>
                    </>
                  )}
                  <button className="btn-ghost !py-1 !px-3 !text-xs" onClick={() => printChallan(c)}>Print</button>
                </div>
              </div>
            )
          })}
          {challans.length === 0 && (
            <p className="text-center text-gray-500 py-10">No challans yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default DeliveryChallan
