import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useSaleStore } from '@/store/sales'
import { useAppStore } from '@/store/app'
import { SALE_TYPES, PAYMENT_METHODS, EMPTY_RECEIVE_OPTIONS } from '@/utils/constants'
import { rupeesToPaise, formatPaise, formatCurrency } from '@/utils/formatters'

function db() { return window.api }

interface CylinderProduct {
  id: number
  name: string
  size_weight: string
  category: string
  default_price_paise: number
}

interface AccessoryProduct {
  id: number
  name: string
  category: string
  price_paise: number
  stock_count: number
}

const POS: React.FC = () => {
  const [cylinders, setCylinders] = useState<CylinderProduct[]>([])
  const [accessories, setAccessories] = useState<AccessoryProduct[]>([])
  const [search, setSearch] = useState('')
  const [billPreview, setBillPreview] = useState(false)
  const [billHtml, setBillHtml] = useState('')
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; consumer_number: string; phone: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const addToast = useAppStore(s => s.addToast)

  // Customer panel data
  const [customerDetail, setCustomerDetail] = useState<{ consumer_number: string; phone: string; total_visits: number; last_seen: string } | null>(null)
  const [bookingHistory, setBookingHistory] = useState<{ id: number; booking_date: string; otp: string; product_id: number | null; product_name: string | null; delivered: number }[]>([])
  const [customerCredit, setCustomerCredit] = useState<{ outstanding_paise: number; status: string } | null>(null)

  const cart = useSaleStore(s => s.cart)
  const customer = useSaleStore(s => s.customer)
  const saleType = useSaleStore(s => s.saleType)
  const emptyReceived = useSaleStore(s => s.emptyReceived)
  const emptyCount = useSaleStore(s => s.emptyCount)
  const payments = useSaleStore(s => s.payments)
  const saleDiscount = useSaleStore(s => s.saleDiscount)
  const addToCart = useSaleStore(s => s.addToCart)
  const removeFromCart = useSaleStore(s => s.removeFromCart)
  const updateCartQty = useSaleStore(s => s.updateCartQty)
  const updateCartPrice = useSaleStore(s => s.updateCartPrice)
  const setCustomer = useSaleStore(s => s.setCustomer)
  const setSaleType = useSaleStore(s => s.setSaleType)
  const setEmptyReceived = useSaleStore(s => s.setEmptyReceived)
  const setEmptyCount = useSaleStore(s => s.setEmptyCount)
  const setDiscount = useSaleStore(s => s.setDiscount)
  const addPaymentRow = useSaleStore(s => s.addPaymentRow)
  const removePaymentRow = useSaleStore(s => s.removePaymentRow)
  const updatePayment = useSaleStore(s => s.updatePayment)
  const resetSale = useSaleStore(s => s.resetSale)
  const getTotal = useSaleStore(s => s.getTotal)
  const getPaidTotal = useSaleStore(s => s.getPaidTotal)
  const getBalance = useSaleStore(s => s.getBalance)

  useEffect(() => { loadProducts() }, [])
  const loadProducts = useCallback(async () => {
    const cylRows = await db().dbAll('SELECT * FROM godown_products ORDER BY name')
    setCylinders(cylRows as CylinderProduct[])
    const accRows = await db().dbAll(`SELECT id, name, category, price_paise, stock_count FROM shop_products WHERE stock_count > 0 ORDER BY name`)
    setAccessories(accRows as AccessoryProduct[])
  }, [])

  // Customer autocomplete
  const searchCustomers = useCallback(async (query: string) => {
    if (query.length < 2) { setCustomerSuggestions([]); setShowSuggestions(false); return }
    try {
      const rows = await db().dbAll(
        `SELECT name, consumer_number, phone FROM customers WHERE name LIKE ? ORDER BY last_seen DESC LIMIT 8`,
        [`%${query}%`]
      )
      setCustomerSuggestions(rows as any[])
      setShowSuggestions(true)
    } catch { setCustomerSuggestions([]); setShowSuggestions(false) }
  }, [])

  const selectCustomer = useCallback(async (c: { name: string; consumer_number: string; phone: string }) => {
    setCustomer({ name: c.name, consumerNumber: c.consumer_number, phone: c.phone })
    setShowSuggestions(false)

    const cust = await db().dbGet('SELECT consumer_number, phone, total_visits, last_seen FROM customers WHERE name = ? ORDER BY last_seen DESC LIMIT 1', [c.name]) as any
    if (cust) setCustomerDetail({ consumer_number: cust.consumer_number || c.consumer_number, phone: cust.phone || c.phone, total_visits: cust.total_visits || 0, last_seen: cust.last_seen || '' })

    const bookings = await db().dbAll('SELECT b.id, b.booking_date, b.otp, b.product_id, b.delivered, gp.name as product_name FROM bookings b LEFT JOIN godown_products gp ON b.product_id = gp.id WHERE b.customer_name = ? ORDER BY b.booking_date DESC LIMIT 5', [c.name]) as any[]
    setBookingHistory(bookings)

    const pending = bookings.filter(b => b.delivered === 0)
    if (pending.length > 0) setCustomer({ otp: pending[0].otp })

    const credit = await db().dbGet('SELECT COALESCE(SUM(original_paise - paid_paise), 0) as outstanding_paise, MAX(status) as status FROM credit_ledger WHERE customer_name = ? AND status != \'Closed\' GROUP BY customer_name', [c.name]) as any
    setCustomerCredit(credit?.outstanding_paise > 0 ? credit : null)
  }, [setCustomer])

  const filteredCylinders = cylinders.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase()) ||
    p.size_weight.includes(search)
  )
  const filteredAccessories = accessories.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  function addCylinder(product: CylinderProduct) {
    addToCart({
      productId: product.id,
      name: `${product.name} (${product.size_weight})`,
      type: 'cylinder',
      qty: 1,
      unitPrice: product.default_price_paise,
    })
  }

  function addAccessory(product: AccessoryProduct) {
    addToCart({
      productId: product.id,
      name: product.name,
      type: 'accessory',
      qty: 1,
      unitPrice: product.price_paise,
    })
  }

  async function executeSale() {
    const custName = customer.name || 'Walk-in'
    const usedOtp = customer.noOtp ? '' : customer.otp
    try {
      const total = getTotal()

      // 1. Reserve a unique bill number
      let billNumber: string
      let saleId: number
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await db().dbRun('BEGIN IMMEDIATE')
          const counter = await db().dbGet('SELECT prefix, next_number FROM bill_counter WHERE id = 1') as any
          billNumber = `${counter.prefix}-${String(counter.next_number).padStart(5, '0')}`

          try {
            await db().dbRun(
              `INSERT INTO sales (bill_number, customer_name, consumer_number, otp, phone, sale_type, empty_received, empty_count_received, total_paise)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [billNumber, customer.name || 'Walk-in', customer.consumerNumber, usedOtp, customer.phone, saleType, emptyReceived, emptyCount, total]
            )
            await db().dbRun('UPDATE bill_counter SET next_number = next_number + 1 WHERE id = 1')
            // Don't COMMIT yet — keep the transaction open
            break
          } catch (insertErr: any) {
            await db().dbRun('ROLLBACK')
            if (insertErr.message?.includes('UNIQUE') || insertErr.message?.includes('Conflict')) {
              const row = await db().dbGet(
                "SELECT MAX(CAST(SUBSTR(bill_number, INSTR(bill_number, '-') + 1) AS INTEGER)) as maxNum FROM sales"
              ) as any
              const nextNum = (row?.maxNum ?? 0) + 1
              await db().dbRun('UPDATE bill_counter SET next_number = ? WHERE id = 1', [nextNum])
              continue
            }
            throw insertErr
          }
        } catch (reserveErr: any) {
          try { await db().dbRun('ROLLBACK') } catch {}
          throw reserveErr
        }
      }

      // 2. Get the saleId we just inserted
      const saleRow = await db().dbGet('SELECT id FROM sales WHERE bill_number = ?', [billNumber]) as any
      saleId = saleRow.id

      // 3. Save/update customer for future autocomplete
      if (custName !== 'Walk-in') {
        await db().dbRun(
          `INSERT INTO customers (name, consumer_number, phone, total_visits, last_seen)
           VALUES (?, ?, ?, 1, datetime('now'))
           ON CONFLICT(name, consumer_number) DO UPDATE SET
             phone = excluded.phone,
             total_visits = total_visits + 1,
             last_seen = datetime('now')`,
          [custName, customer.consumerNumber, customer.phone]
        )
      }

      // 4. Insert sale items
      for (const item of cart) {
        const lineTotal = item.unitPrice * item.qty
        await db().dbRun(
          `INSERT INTO sale_items (sale_id, product_name, product_type, qty, unit_price_paise, total_paise)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.name, item.type, item.qty, item.unitPrice, lineTotal]
        )
      }

      // 5. Insert payments
      for (const p of payments) {
        if (p.amount > 0) {
          await db().dbRun(`INSERT INTO sale_payments (sale_id, method, amount_paise) VALUES (?, ?, ?)`, [saleId, p.method, p.amount])
        }
      }

      // 6. Update shop stock
      let totalCylindersSold = 0
      let totalEmptiesReceived = 0

      for (const item of cart) {
        if (item.type === 'cylinder' && item.productId) {
          totalCylindersSold += item.qty
          let existingStock = await db().dbGet(`SELECT full_count, empty_count FROM shop_cylinder_stock WHERE product_id = ?`, [item.productId]) as any
          if (!existingStock) {
            const empties = (emptyReceived === 'Yes') ? item.qty
              : (emptyReceived === 'Partial') ? (emptyCount > 0 ? Math.min(emptyCount, item.qty) : 0)
              : 0
            await db().dbRun(
              `INSERT INTO shop_cylinder_stock (product_id, full_count, empty_count) VALUES (?, MAX(0, ? - 1), ?)`,
              [item.productId, item.qty, empties]
            )
          } else {
            await db().dbRun(
              `UPDATE shop_cylinder_stock SET full_count = MAX(0, full_count - ?) WHERE product_id = ?`,
              [item.qty, item.productId]
            )
            if (emptyReceived === 'Yes') {
              const emptyQty = emptyCount > 0 ? emptyCount : item.qty
              await db().dbRun(`UPDATE shop_cylinder_stock SET empty_count = empty_count + ? WHERE product_id = ?`, [emptyQty, item.productId])
              totalEmptiesReceived = emptyQty
            } else if (emptyReceived === 'Partial') {
              const emptyQty = emptyCount > 0 ? Math.min(emptyCount, item.qty) : 0
              await db().dbRun(`UPDATE shop_cylinder_stock SET empty_count = empty_count + ? WHERE product_id = ?`, [emptyQty, item.productId])
              totalEmptiesReceived += emptyQty
            }
          }
        } else if (item.type === 'accessory' && item.productId) {
          await db().dbRun(`UPDATE shop_products SET stock_count = MAX(0, stock_count - ?) WHERE id = ?`, [item.qty, item.productId])
        }
      }

      // 7. Track empty cylinders NOT returned
      if (totalCylindersSold > 0 && totalEmptiesReceived < totalCylindersSold && customer.name && customer.name !== 'Walk-in') {
        const pendingEmpties = totalCylindersSold - totalEmptiesReceived
        await db().dbRun(
          `INSERT INTO audit_log (event_type, entity, action_description, before_value, after_value)
           VALUES ('empty_not_returned', 'sale', ?, ?, ?)`,
          [`${pendingEmpties} empty cylinder(s) pending return from ${customer.name}`, billNumber, String(pendingEmpties)]
        )
      }

      // 8. Credit handling — MUST run inside the same transaction
      // Check both explicit Credit payments AND unpaid balance (auto-credit)
      const creditItems = payments.filter(p => p.method === 'Credit' && p.amount > 0)
      const nonCreditPaid = payments.filter(p => p.method !== 'Credit').reduce((s, p) => s + p.amount, 0)
      const unpaidBalance = total - nonCreditPaid
      const shouldRecordCredit = creditItems.length > 0 || unpaidBalance > 0

      if (shouldRecordCredit && customer.name && customer.name !== 'Walk-in') {
        const creditAmount = creditItems.length > 0
          ? creditItems.reduce((s, p) => s + p.amount, 0)
          : unpaidBalance
        if (creditAmount > 0) {
          await db().dbRun(
            `INSERT INTO credit_ledger (customer_name, phone, sale_id, original_paise, paid_paise, status) VALUES (?, ?, ?, ?, 0, 'Outstanding')`,
            [customer.name, customer.phone, saleId, creditAmount]
          )
        }
      }

      await db().dbRun(
        `INSERT INTO audit_log (event_type, entity, action_description) VALUES ('sale', 'sale', ?)`,
        [`Sale ${billNumber} - ${formatPaise(total)}`]
      )

      // Commit ALL operations atomically
      await db().dbRun('COMMIT')

      const html = generateBillHtml(billNumber)
      setBillHtml(html)
      addToast(`Sale ${billNumber} completed successfully!`, 'success')
      resetSale()
      loadProducts()
    } catch (err: any) {
      try { await db().dbRun('ROLLBACK') } catch {}
      addToast(`Sale failed: ${err.message}`, 'error')
    }
  }

  function generateBillHtml(billNumber: string) {
    const total = getTotal()
    const sub = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0)
    return `
      <html><head><style>
        body { font-family: Arial, sans-serif; padding: 24px; max-width: 420px; color: #222; font-size: 13px; }
        h2 { margin: 0 0 2px; text-align: center; font-size: 16px; }
        .center { text-align: center; font-size: 12px; color: #666; }
        .line { border-top: 1px dashed #aaa; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }
        .bold { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        th, td { text-align: left; padding: 5px 4px; font-size: 12px; border-bottom: 1px solid #eee; }
        .right { text-align: right; }
        .total { font-size: 16px; font-weight: 700; color: #059669; }
      </style></head><body>
        <h2>HP Gas Agency</h2>
        <div class="center">Bill: <strong>${billNumber}</strong> | ${new Date().toLocaleString('en-IN')}</div>
        <div class="line"></div>
        <div class="row"><span>Customer:</span><strong>${customer.name || 'Walk-in'}</strong></div>
        ${customer.consumerNumber ? `<div class="row"><span>Consumer #:</span><span>${customer.consumerNumber}</span></div>` : ''}
        ${customer.phone ? `<div class="row"><span>Phone:</span><span>${customer.phone}</span></div>` : ''}
        <div class="row"><span>Sale Type:</span><span>${saleType}</span></div>
        <div class="row"><span>Empty Received:</span><span>${emptyReceived}${emptyCount > 0 ? ` (${emptyCount})` : ''}</span></div>
        <div class="line"></div>
        <table>
          <tr><th>Item</th><th>Qty</th><th>Price</th><th class="right">Total</th></tr>
          ${cart.map(i => `<tr><td>${i.name}</td><td>${i.qty}</td><td>₹${formatPaise(i.unitPrice)}</td><td class="right">₹${formatPaise(i.unitPrice * i.qty)}</td></tr>`).join('')}
        </table>
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>₹${formatPaise(sub)}</span></div>
        ${saleDiscount > 0 ? `<div class="row"><span>Discount</span><span>-₹${formatPaise(saleDiscount)}</span></div>` : ''}
        <div class="row"><span class="total">TOTAL</span><span class="total">₹${formatPaise(total)}</span></div>
        <div class="line"></div>
        <strong>Payment:</strong>
        ${payments.filter(p => p.amount > 0).map(p => `<div class="row"><span>${p.method}</span><span>₹${formatPaise(p.amount)}</span></div>`).join('')}
        <div class="line"></div>
        <div class="center">Thank you for your business!</div>
      </body></html>
    `
  }

  const latestActiveBooking = useMemo(() => bookingHistory.find(b => b.delivered === 0) || null, [bookingHistory])
  const otpMatch = useMemo(() => {
    if (!latestActiveBooking || !customer.otp) return null
    return customer.otp === latestActiveBooking.otp ? 'match' : 'mismatch'
  }, [latestActiveBooking, customer.otp])

  return (
    <div className="h-full flex bg-gray-50 overflow-hidden min-h-0">
      {/* LEFT: Products */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <input
            className="input-field"
            placeholder="🔍 Search cylinders & accessories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredCylinders.length > 0 && (
            <>
              <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Cylinders</div>
              {filteredCylinders.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left p-3 rounded-xl hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200"
                  onClick={() => addCylinder(p)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.size_weight} • {p.category}</div>
                    </div>
                    <div className="text-blue-600 font-bold text-sm">₹{(p.default_price_paise/100).toFixed(0)}</div>
                  </div>
                </button>
              ))}
            </>
          )}
          {filteredAccessories.length > 0 && (
            <>
              <div className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2 mt-4">Accessories</div>
              {filteredAccessories.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left p-3 rounded-xl hover:bg-purple-50 transition-all border border-transparent hover:border-purple-200"
                  onClick={() => addAccessory(p)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500">Stock: {p.stock_count}</div>
                    </div>
                    <div className="text-green-600 font-bold text-sm">₹{(p.price_paise/100).toFixed(0)}</div>
                  </div>
                </button>
              ))}
            </>
          )}
          {filteredCylinders.length === 0 && filteredAccessories.length === 0 && (
            <div className="text-center text-gray-400 py-12">No products found</div>
          )}
        </div>
      </div>

      {/* CENTER: Cart */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0 min-h-0">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">🛒 Cart ({cart.length})</h3>
          {cart.length > 0 && (
            <button className="btn btn-red btn-sm" onClick={resetSale}>Clear Cart</button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="text-6xl mb-6">🛒</div>
            <div className="text-xl font-semibold">Cart is empty</div>
            <div className="text-sm mt-2">Search and select products to add them here</div>
          </div>
        ) : (
          <>
            {/* Scrollable cart items only */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="w-24">Qty</th>
                      <th className="w-36">Price</th>
                      <th className="w-32 text-right">Total</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.id}>
                        <td className="font-semibold text-gray-800">{item.name}</td>
                        <td>
                          <input
                            type="number"
                            className="input-field input-field-sm w-20"
                            min="1"
                            value={item.qty}
                            onChange={e => updateCartQty(item.id, parseInt(e.target.value) || 1)}
                          />
                        </td>
                        <td>
                          <div className="flex items-center">
                            <span className="text-gray-500 mr-2">₹</span>
                            <input
                              type="number"
                              className="input-field input-field-sm w-full"
                              step="0.01"
                              min="0"
                              value={item.unitPrice / 100}
                              onChange={e => updateCartPrice(item.id, rupeesToPaise(e.target.value))}
                            />
                          </div>
                        </td>
                        <td className="text-right font-bold text-green-600 text-base">₹{formatPaise(item.unitPrice * item.qty)}</td>
                        <td>
                          <button className="text-red-500 hover:text-red-700 text-xl font-bold" onClick={() => removeFromCart(item.id)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </div>

            <div className="border-t border-gray-200 bg-white shrink-0 max-h-[45vh] overflow-auto">
              <div className="px-3 py-2">
                {/* Customer Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Customer Name with Autocomplete */}
                  <div className="relative">
                    <input
                      className="input-field"
                      placeholder="Customer Name"
                      value={customer.name}
                      onChange={e => { setCustomer({ name: e.target.value }); searchCustomers(e.target.value) }}
                      onFocus={() => { if (customer.name.length >= 2 && customerSuggestions.length > 0) setShowSuggestions(true) }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    {showSuggestions && customerSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {customerSuggestions.map((s, i) => (
                          <button
                            key={i}
                            className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                            onMouseDown={e => { e.preventDefault(); selectCustomer(s) }}
                          >
                            <div className="font-semibold">{s.name}</div>
                            {s.consumer_number && <div className="text-xs text-gray-500">#{s.consumer_number}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input className="input-field" placeholder="Consumer Number" value={customer.consumerNumber} onChange={e => setCustomer({ consumerNumber: e.target.value })} />
                  <input className="input-field" placeholder="Booking OTP" value={customer.noOtp ? '' : customer.otp} onChange={e => setCustomer({ otp: e.target.value })} disabled={customer.noOtp} />
                  <input className="input-field" placeholder="Phone (optional)" value={customer.phone} onChange={e => setCustomer({ phone: e.target.value })} />
                </div>

                {/* No OTP Toggle */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={customer.noOtp}
                      onChange={e => setCustomer({ noOtp: e.target.checked })}
                    />
                    <span className="text-sm font-medium text-gray-700">Walk-in sale — no OTP</span>
                  </label>
                  {customer.noOtp && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full font-semibold">OTP will be blank</span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Sale Type */}
                  <div>
                    <label className="input-label">Sale Type</label>
                    <div className="flex gap-2 flex-wrap">
                      {SALE_TYPES.map(st => (
                        <button
                          key={st}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${saleType === st ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                          onClick={() => setSaleType(st)}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                    {saleType === 'Refill' && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <label className="input-label">Empty Cylinder Received?</label>
                        <div className="flex gap-2">
                          {EMPTY_RECEIVE_OPTIONS.map(o => (
                            <button
                              key={o}
                              className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${emptyReceived === o ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}
                              onClick={() => setEmptyReceived(o)}
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                        {emptyReceived === 'Partial' && (
                          <input
                            type="number"
                            className="input-field mt-2"
                            min="0"
                            value={emptyCount || ''}
                            onChange={e => setEmptyCount(parseInt(e.target.value) || 0)}
                            placeholder="How many empties received?"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="input-label">Discount (₹)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">₹</span>
                      <input
                        type="number"
                        className="input-field flex-1"
                        step="0.01"
                        min="0"
                        value={saleDiscount / 100}
                        onChange={e => setDiscount(rupeesToPaise(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Total Amount</div>
                    <div className="text-3xl font-extrabold text-blue-700">₹{formatPaise(getTotal())}</div>
                    {getBalance() !== 0 && (
                      <div className={`text-sm font-bold mt-2 ${getBalance() > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {getBalance() > 0 ? `Collect ₹${formatPaise(getBalance())} more` : `Refund ₹${formatPaise(Math.abs(getBalance()))}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment */}
                <div className="forum-group">
                  <label className="input-label">Payment Methods</label>
                  <div className="space-y-2">
                    {payments.map(p => (
                      <div key={p.id} className="flex gap-3 items-center p-3 bg-white border border-gray-200 rounded-lg">
                        <select
                          className="input-field flex-1"
                          value={p.method}
                          onChange={e => updatePayment(p.id, 'method', e.target.value)}
                        >
                          {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <div className="flex items-center w-40">
                          <span className="text-gray-500 mr-2">₹</span>
                          <input
                            type="number"
                            className="input-field w-full"
                            step="0.01"
                            min="0"
                            value={p.amount / 100}
                            onChange={e => updatePayment(p.id, 'amount', rupeesToPaise(e.target.value))}
                            placeholder="Amount"
                          />
                        </div>
                        {payments.length > 1 && (
                          <button className="text-red-500 hover:text-red-700 font-bold" onClick={() => removePaymentRow(p.id)}>✕</button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-3 text-sm">
                      <button className="text-blue-600 hover:text-blue-700 font-semibold" onClick={() => addPaymentRow('UPI')}>+ Add another payment</button>
                    </div>
                  </div>
                </div>

                {/* Confirm Button */}
                <div className="pt-4 border-t border-gray-200">
                  <button className="btn btn-green w-full btn-lg shadow-lg" onClick={() => setBillPreview(true)}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Confirm Sale • ₹{formatPaise(getTotal())}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* RIGHT: Preview */}
      {billPreview && cart.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setBillPreview(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-800">Bill Preview</h3>
              <button className="text-gray-500 hover:text-gray-700 text-2xl" onClick={() => setBillPreview(false)}>✕</button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: '50vh' }}>
              <iframe className="w-full border border-gray-200 rounded-lg" style={{ height: '100%' }} srcDoc={billHtml} title="Bill Preview" />
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button className="btn btn-blue flex-1" onClick={async () => {
                await db().printBill(billHtml)
                addToast('Bill sent to printer', 'success')
              }}>🖨️ Print Bill</button>
              <button className="btn btn-green flex-1" onClick={async () => {
                await db().exportPDF(billHtml)
                addToast('Bill exported as PDF', 'success')
              }}>📄 Save PDF</button>
              <button className="btn btn-ghost flex-1" onClick={() => { executeSale(); setBillPreview(false); }}>✅ Finalize Sale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default POS
