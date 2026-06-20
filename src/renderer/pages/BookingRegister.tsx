import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'

function db() { return window.api }

interface Booking {
  id: number
  consumer_number: string
  customer_name: string
  booking_date: string
  otp: string
  product_id: number
  delivered: number
  product_name?: string
}

interface CylinderProduct {
  id: number
  name: string
  size_weight: string
}

const BookingRegister: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [products, setProducts] = useState<CylinderProduct[]>([])
  const [form, setForm] = useState({ consumer_number: '', customer_name: '', booking_date: '', otp: '', product_id: 0 })
  const [filter, setFilter] = useState<'all' | 'pending' | 'delivered'>('all')
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    const productRows = await db().dbAll('SELECT id, name, size_weight FROM godown_products ORDER BY name')
    setProducts(productRows as CylinderProduct[])

    const rows = await db().dbAll(`
      SELECT b.*, gp.name as product_name
      FROM bookings b
      LEFT JOIN godown_products gp ON b.product_id = gp.id
      ORDER BY b.booking_date DESC, b.id DESC
    `) as Booking[]

    if (filter === 'pending') setBookings(rows.filter(b => !b.delivered))
    else if (filter === 'delivered') setBookings(rows.filter(b => b.delivered))
    else setBookings(rows)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function addBooking(e: React.FormEvent) {
    e.preventDefault()
    if (!form.consumer_number || !form.customer_name || !form.otp) return

    await db().dbRun(
      `INSERT INTO bookings (consumer_number, customer_name, booking_date, otp, product_id) VALUES (?, ?, ?, ?, ?)`,
      [form.consumer_number, form.customer_name, form.booking_date || new Date().toISOString().slice(0, 10), form.otp, form.product_id || null]
    )

    addToast('Booking added', 'success')
    setForm({ consumer_number: '', customer_name: '', booking_date: '', otp: '', product_id: 0 })
    load()
  }

  async function markDelivered(booking: Booking) {
    await db().dbRun(`UPDATE bookings SET delivered = 1 WHERE id = ?`, [booking.id])
    addToast(`Booking for ${booking.customer_name} marked as delivered`, 'success')
    load()
  }

  async function exportCsv() {
    const rows = await db().dbAll(`SELECT consumer_number, customer_name, booking_date, otp, delivered FROM bookings ORDER BY booking_date DESC`)
    const data = (rows as any[]).map(r => ({
      ConsumerNo: r.consumer_number,
      Name: r.customer_name,
      Date: r.booking_date,
      OTP: r.otp,
      Status: r.delivered ? 'Delivered' : 'Pending',
    }))
    await window.api.exportCSV('booking-register', data)
    addToast('Bookings exported', 'success')
  }

  const pendingCount = bookings.filter(b => !b.delivered).length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-dark-border flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Booking Register</h2>
        <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* New Booking Form */}
        <div className="card mb-6">
          <h3 className="text-base font-semibold text-accent-amber mb-3">New Booking</h3>
          <form onSubmit={addBooking} className="grid grid-cols-6 gap-3">
            <div>
              <label className="input-label">Consumer Number *</label>
              <input className="input-field" value={form.consumer_number} onChange={e => setForm(f => ({ ...f, consumer_number: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="input-label">Customer Name *</label>
              <input className="input-field" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">Booking Date</label>
              <input type="date" className="input-field" value={form.booking_date} onChange={e => setForm(f => ({ ...f, booking_date: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">OTP *</label>
              <input className="input-field" value={form.otp} onChange={e => setForm(f => ({ ...f, otp: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">Product</label>
              <select className="input-field" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: parseInt(e.target.value) }))}>
                <option value={0}>Select product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.size_weight})</option>)}
              </select>
            </div>
            <div className="col-span-6">
              <button type="submit" className="btn-success">Add Booking</button>
            </div>
          </form>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {(['all', 'pending', 'delivered'] as const).map(f => (
            <button key={f} className={`px-3 py-1.5 rounded text-xs font-medium ${filter === f ? 'bg-accent-blue text-white' : 'bg-dark-tertiary text-gray-400'}`}
                    onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'pending' ? `Pending (${pendingCount})` : 'Delivered'}
            </button>
          ))}
        </div>

        {/* Bookings Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-dark-border">
              <th className="pb-2 font-medium">Consumer #</th>
              <th className="pb-2 font-medium">Customer</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium">OTP</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map(b => (
              <tr key={b.id} className={`border-b border-dark-border/50 ${!b.delivered ? 'bg-amber-900/10' : ''}`}>
                <td className="py-2 text-white font-mono text-xs">{b.consumer_number}</td>
                <td className="py-2 text-white">{b.customer_name}</td>
                <td className="py-2 text-gray-400">{b.booking_date}</td>
                <td className="py-2 text-gray-400">{b.product_name || '-'}</td>
                <td className="py-2 font-mono text-accent-amber text-xs">{b.otp}</td>
                <td className="py-2">
                  {b.delivered ? <span className="badge-green">Delivered</span> : <span className="badge-amber">Pending</span>}
                </td>
                <td className="py-2">
                  {!b.delivered && (
                    <button className="btn-success !py-1 !px-3 !text-xs" onClick={() => markDelivered(b)}>Mark Delivered</button>
                  )}
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-6">No bookings found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default BookingRegister
