import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '@/store/app'

function db() { return window.api }

interface ProductStock {
  id: number
  name: string
  category: string
  size_weight: string
  godown_full: number
  godown_empty: number
  shop_full: number
  shop_empty: number
}

interface Accessory {
  id: number
  name: string
  category: string
  unit: string
  stock_count: number
  low_stock_threshold: number
  price_paise: number
}

interface MovementRecord {
  id: number
  timestamp: string
  product_name: string
  action: string
  location_from: string
  location_to: string
  quantity: number
  reason: string
}

type ActionCardType =
  | 'goFull'      // Full cylinders Godown → Shop
  | 'goEmpty'      // Empty cylinders Shop → Godown
  | 'gpEmpty'      // Empty cylinders Godown → Plant
  | 'pgFull'       // Full cylinders Plant → Godown
  | 'ofFull'       // Full cylinders Shop → Godown (reverse overflow)
  | 'ofEmpty'      // Empty cylinders Godown → Shop (reverse overflow)
  | 'cgFull'       // Correction: godown full
  | 'cgEmpty'      // Correction: godown empty
  | 'csFull'       // Correction: shop full
  | 'csEmpty'      // Correction: shop empty

interface ActionForm {
  type: ActionCardType
  productId: number
  qty: string
  reason: string
}

const emptyForm: ActionForm = { type: 'goFull', productId: 0, qty: '', reason: '' }

interface ActionCardDef {
  type: ActionCardType
  section: 'stock_to_shop' | 'plant_cycle' | 'reverse_flow'
  title: string
  icon: React.ReactNode
  color: string
  desc: string
}

const actionCards: ActionCardDef[] = [
  {
    type: 'goFull',
    section: 'stock_to_shop',
    title: 'Full to Shop',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
    color: 'emerald',
    desc: 'Send full cylinders from godown to shop',
  },
  {
    type: 'goEmpty',
    section: 'stock_to_shop',
    title: 'Empty to Godown',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h8m-8 4h8m-8 4h4M3 21h18M5 21V11l7-4 7 4v10M3 21V11" /></svg>,
    color: 'amber',
    desc: 'Return empty cylinders from shop to godown',
  },
  {
    type: 'gpEmpty',
    section: 'plant_cycle',
    title: 'Empty to Plant',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
    color: 'red',
    desc: 'Send empty cylinders to plant for refill',
  },
  {
    type: 'pgFull',
    section: 'plant_cycle',
    title: 'Full from Plant',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    color: 'blue',
    desc: 'Receive full cylinders from plant (factory)',
  },
  {
    type: 'ofFull',
    section: 'reverse_flow',
    title: 'Full to Godown',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>,
    color: 'gray',
    desc: 'Send excess full cylinders from shop back to godown',
  },
  {
    type: 'ofEmpty',
    section: 'reverse_flow',
    title: 'Empty to Shop',
    icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
    color: 'purple',
    desc: 'Send empty cylinders from godown to shop',
  },
]

// Correction card definitions (shown separately)
const correctionCards: { type: ActionCardType; label: string; desc: string }[] = [
  { type: 'cgFull', label: 'Godown Full', desc: 'Adjust full cylinder count at godown' },
  { type: 'cgEmpty', label: 'Godown Empty', desc: 'Adjust empty cylinder count at godown' },
  { type: 'csFull', label: 'Shop Full', desc: 'Adjust full cylinder count at shop' },
  { type: 'csEmpty', label: 'Shop Empty', desc: 'Adjust empty cylinder count at shop' },
]

// Transfer type mapping for database operations
const transferTypeMap: Record<ActionCardType, string> = {
  goFull: 'godown_to_shop_full',
  goEmpty: 'shop_to_godown_empty',
  gpEmpty: 'godown_to_plant_empty',
  pgFull: 'plant_to_godown_full',
  ofFull: 'shop_to_godown_full',
  ofEmpty: 'godown_to_shop_empty',
  cgFull: 'correct_godown_full',
  cgEmpty: 'correct_godown_empty',
  csFull: 'correct_shop_full',
  csEmpty: 'correct_shop_empty',
}

function getActionDef(type: ActionCardType): ActionCardDef | undefined {
  return actionCards.find(c => c.type === type)
}

function isCorrection(type: ActionCardType): boolean {
  return type.startsWith('c')
}

function getAvailableStock(product: ProductStock, type: ActionCardType): number {
  switch (type) {
    case 'goFull': return product.godown_full
    case 'goEmpty': return product.shop_empty
    case 'gpEmpty': return product.godown_empty
    case 'ofFull': return product.shop_full
    case 'ofEmpty': return product.godown_empty
    default: return 0
  }
}

const Inventory: React.FC = () => {
  const [tab, setTab] = useState<'overview' | 'plant' | 'transfers'>('overview')
  const [plantStats, setPlantStats] = useState<{ id: number; name: string; size_weight: string; category: string; sent_to_plant: number; received_from_plant: number }[]>([])
  const [products, setProducts] = useState<ProductStock[]>([])
  const [accessories, setAccessories] = useState<Accessory[]>([])
  const [movements, setMovements] = useState<MovementRecord[]>([])
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferForm, setTransferForm] = useState<ActionForm>({ ...emptyForm })
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    try {
      const rows = await db().dbAll(`
        SELECT gp.id, gp.name, gp.size_weight, gp.category,
               COALESCE(gs.full_count, 0) as godown_full,
               COALESCE(gs.empty_count, 0) as godown_empty,
               COALESCE(sc.full_count, 0) as shop_full,
               COALESCE(sc.empty_count, 0) as shop_empty
        FROM godown_products gp
        LEFT JOIN godown_stock gs ON gp.id = gs.product_id
        LEFT JOIN shop_cylinder_stock sc ON gp.id = sc.product_id
        ORDER BY gp.name
      `)
      setProducts(rows as ProductStock[])

      const accRows = await db().dbAll(`SELECT * FROM shop_products ORDER BY name`)
      setAccessories(accRows as Accessory[])

      const movRows = await db().dbAll(`
        SELECT cr.id, cr.timestamp,
               gp.name as product_name, cr.action, cr.location_from, cr.location_to,
               cr.quantity, cr.reason
        FROM cylinder_register cr
        LEFT JOIN godown_products gp ON cr.product_id = gp.id
        ORDER BY cr.timestamp DESC LIMIT 50
      `)
      setMovements(movRows as MovementRecord[])

      // Plant summary: sent vs received per product
      const plantRows = await db().dbAll(`
        SELECT gp.id, gp.name, gp.size_weight, gp.category,
               COALESCE((
                 SELECT SUM(cr.quantity) FROM cylinder_register cr
                 WHERE cr.product_id = gp.id AND cr.action = 'sent_to_plant'
               ), 0) as sent_to_plant,
               COALESCE((
                 SELECT SUM(cr.quantity) FROM cylinder_register cr
                 WHERE cr.product_id = gp.id AND cr.action = 'received_from_plant'
               ), 0) as received_from_plant
        FROM godown_products gp
        ORDER BY gp.name
      `)
      setPlantStats(plantRows as any[])
    } catch (err: any) {
      addToast(`Error loading data: ${err.message}`, 'error')
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const godownFull = products.reduce((s, p) => s + p.godown_full, 0)
    const godownEmpty = products.reduce((s, p) => s + p.godown_empty, 0)
    const shopFull = products.reduce((s, p) => s + p.shop_full, 0)
    const shopEmpty = products.reduce((s, p) => s + p.shop_empty, 0)
    const shopAccTotal = accessories.reduce((s, a) => s + a.stock_count, 0)
    return { godownFull, godownEmpty, shopFull, shopEmpty, shopAccTotal }
  }, [products, accessories])

  function openTransfer(type: ActionCardType, productId?: number) {
    setTransferForm({ type, productId: productId ?? 0, qty: '', reason: '' })
    setShowTransfer(true)
  }

  async function executeTransfer() {
    const { type, productId, qty, reason } = transferForm
    const quantity = parseInt(qty)

    if (!productId || isNaN(quantity) || quantity === 0) {
      addToast('Select a product and enter a valid quantity', 'error')
      return
    }

    const product = products.find(p => p.id === productId)
    if (!product) {
      addToast('Product not found', 'error')
      return
    }

    const corrType = transferTypeMap[type]
    const isCorr = isCorrection(type)
    if (isCorr && !reason.trim()) {
      addToast('Reason is required for corrections', 'error')
      return
    }

    // Check available stock for non-correction transfers
    // Skip for 'pgFull' — the plant is a factory, not a stock holder.
    // They can send back any number of refilled cylinders; we don't track their inventory.
    if (!isCorr && type !== 'pgFull') {
      const available = getAvailableStock(product, type)
      if (quantity > available) {
        const typeName = getActionDef(type)?.title || 'action'
        addToast(`Only ${available} available for ${typeName}`, 'error')
        return
      }
    }

    try {
      const dbType = transferTypeMap[type]

      if (dbType === 'godown_to_shop_full') {
        await db().dbRun(`UPDATE godown_stock SET full_count = full_count - ? WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO shop_cylinder_stock (product_id, full_count, empty_count) VALUES (?, ?, 0)
           ON CONFLICT(product_id) DO UPDATE SET full_count = full_count + ?`,
          [productId, quantity, quantity]
        )
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'sent_to_shop', 'godown', 'shop', ?, '')`,
          [productId, quantity]
        )

      } else if (dbType === 'godown_to_shop_empty') {
        await db().dbRun(`UPDATE godown_stock SET empty_count = empty_count - ? WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO shop_cylinder_stock (product_id, full_count, empty_count) VALUES (?, 0, ?)
           ON CONFLICT(product_id) DO UPDATE SET empty_count = empty_count + ?`,
          [productId, quantity, quantity, quantity]
        )
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_godown', 'godown', 'shop', ?, '')`,
          [productId, quantity]
        )

      } else if (dbType === 'shop_to_godown_full') {
        await db().dbRun(`UPDATE shop_cylinder_stock SET full_count = MAX(0, full_count - ?) WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(`UPDATE godown_stock SET full_count = full_count + ? WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_shop', 'shop', 'godown', ?, '')`,
          [productId, quantity]
        )

      } else if (dbType === 'shop_to_godown_empty') {
        await db().dbRun(`UPDATE shop_cylinder_stock SET empty_count = empty_count - ? WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(`UPDATE godown_stock SET empty_count = empty_count + ? WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_shop', 'shop', 'godown', ?, '')`,
          [productId, quantity]
        )

      } else if (dbType === 'godown_to_plant_empty') {
        await db().dbRun(`UPDATE godown_stock SET empty_count = empty_count - ? WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'sent_to_plant', 'godown', 'plant', ?, ?)`,
          [productId, quantity, reason || 'Sent for refill']
        )

      } else if (dbType === 'plant_to_godown_full') {
        await db().dbRun(
          `INSERT INTO godown_stock (product_id, full_count, empty_count) VALUES (?, ?, 0)
           ON CONFLICT(product_id) DO UPDATE SET full_count = full_count + ?`,
          [productId, quantity, quantity]
        )
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_plant', 'plant', 'godown', ?, ?)`,
          [productId, quantity, reason || 'Received refilled']
        )

      } else if (dbType === 'correct_godown_full') {
        await db().dbRun(`UPDATE godown_stock SET full_count = MAX(0, full_count + ?) WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_plant', 'correction', 'godown', ?, ?)`,
          [productId, quantity, reason]
        )

      } else if (dbType === 'correct_godown_empty') {
        await db().dbRun(`UPDATE godown_stock SET empty_count = MAX(0, empty_count + ?) WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_plant', 'correction', 'godown', ?, ?)`,
          [productId, quantity, reason]
        )

      } else if (dbType === 'correct_shop_full') {
        await db().dbRun(`UPDATE shop_cylinder_stock SET full_count = MAX(0, full_count + ?) WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_plant', 'correction', 'shop', ?, ?)`,
          [productId, quantity, reason]
        )

      } else if (dbType === 'correct_shop_empty') {
        await db().dbRun(`UPDATE shop_cylinder_stock SET empty_count = MAX(0, empty_count + ?) WHERE product_id = ?`, [quantity, productId])
        await db().dbRun(
          `INSERT INTO cylinder_register (product_id, action, location_from, location_to, quantity, reason)
           VALUES (?, 'received_from_plant', 'correction', 'shop', ?, ?)`,
          [productId, quantity, reason]
        )
      }

      const label = getActionDef(type)?.title || corrType
      addToast(`${label}: ${Math.abs(quantity)} x ${product.name}`, 'success')
      setShowTransfer(false)
      setTransferForm({ ...emptyForm })
      load()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  async function confirmStockIn(productId: number, qty: number) {
    const product = accessories.find(a => a.id === productId)
    try {
      await db().dbRun(`UPDATE shop_products SET stock_count = stock_count + ? WHERE id = ?`, [qty, productId])
      addToast(`Restocked ${qty} x ${product?.name}`, 'success')
      load()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  function actionLabelRow(action: string) {
    const labels: Record<string, string> = {
      sent_to_shop: 'Sent to Shop',
      received_from_shop: 'Return to Godown',
      sent_to_plant: 'To Plant',
      received_from_plant: 'From Plant',
    }
    return labels[action] ?? action
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="page-header shrink-0">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">Inventory Management</h2>
          <p className="subtitle">Godown + Shop stock overview, transfers, and corrections</p>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 px-6 py-2 bg-gray-100">
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg ${tab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('overview')}
        >Stock</button>
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg ${tab === 'plant' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('plant')}
        >Refill Plant</button>
        <button
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg ${tab === 'transfers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('transfers')}
        >History</button>
      </div>

      {/* ── TAB 1: Stock Overview ── */}
      {tab === 'overview' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard label="Godown Full" value={summary.godownFull} color="emerald" />
            <SummaryCard label="Godown Empty" value={summary.godownEmpty} color="amber" />
            <SummaryCard label="Shop Full" value={summary.shopFull} color="blue" />
            <SummaryCard label="Shop Empty" value={summary.shopEmpty} color="gray" />
            <SummaryCard label="Shop Accessories" value={summary.shopAccTotal} color="purple" />
          </div>

          {/* Action Cards - Organized by section */}
          {products.length > 0 && (
            <div>
              <h3 className="section-title mb-3">Quick Actions</h3>

              {/* Stock to Shop */}
              <div className="mb-4">
                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  Stock to Shop
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {actionCards.filter(c => c.section === 'stock_to_shop').map(card => (
                    <button
                      key={card.type}
                      onClick={() => openTransfer(card.type)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        card.color === 'emerald'
                          ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-700'
                      }`}
                    >
                      {card.icon}
                      <span className="font-bold text-sm">{card.title}</span>
                      <span className="text-xs opacity-70 text-center">{card.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Plant Cycle */}
              <div className="mb-4">
                <div className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  Plant Cycle
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {actionCards.filter(c => c.section === 'plant_cycle').map(card => (
                    <button
                      key={card.type}
                      onClick={() => openTransfer(card.type)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        card.color === 'red'
                          ? 'bg-red-50 border-red-200 hover:border-red-400 text-red-700'
                          : 'bg-blue-50 border-blue-200 hover:border-blue-400 text-blue-700'
                      }`}
                    >
                      {card.icon}
                      <span className="font-bold text-sm">{card.title}</span>
                      <span className="text-xs opacity-70 text-center">{card.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reverse Flow */}
              <div className="mb-4">
                <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Reverse Flow
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {actionCards.filter(c => c.section === 'reverse_flow').map(card => (
                    <button
                      key={card.type}
                      onClick={() => openTransfer(card.type)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        card.color === 'gray'
                          ? 'bg-gray-50 border-gray-200 hover:border-gray-400 text-gray-700'
                          : 'bg-purple-50 border-purple-200 hover:border-purple-400 text-purple-700'
                      }`}
                    >
                      {card.icon}
                      <span className="font-bold text-sm">{card.title}</span>
                      <span className="text-xs opacity-70 text-center">{card.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Corrections */}
              <div className="mb-2">
                <details className="rounded-lg border border-gray-200 bg-gray-50">
                  <summary className="cursor-pointer px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    Stock Corrections
                  </summary>
                  <div className="grid grid-cols-2 gap-2 p-3">
                    {correctionCards.map(card => (
                      <button
                        key={card.type}
                        onClick={() => openTransfer(card.type)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-all"
                      >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        <div className="text-left">
                          <div className="font-bold text-xs">{card.label}</div>
                          <div className="text-xs opacity-70">{card.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* Cylinder Stock Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title mb-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Cylinder Stock
              </h3>
            </div>
            {products.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500">No products configured. Go to Inventory Setup to add cylinders.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-center text-emerald-600" colSpan={2}>Godown</th>
                      <th className="text-center text-blue-600" colSpan={2}>Shop</th>
                      <th className="text-center">Total</th>
                      <th className="text-center">Actions</th>
                    </tr>
                    <tr>
                      <th></th>
                      <th className="text-center text-xs">Full</th>
                      <th className="text-center text-xs">Empty</th>
                      <th className="text-center text-xs">Full</th>
                      <th className="text-center text-xs">Empty</th>
                      <th className="text-center text-xs">(F+E)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const total = p.godown_full + p.godown_empty + p.shop_full + p.shop_empty
                      return (
                        <tr key={p.id}>
                          <td className="font-semibold">
                            <div>{p.name}</div>
                            <div className="text-xs text-gray-400">{p.size_weight} • {p.category}</div>
                          </td>
                          <td className="text-center font-bold text-emerald-600">{p.godown_full}</td>
                          <td className="text-center text-amber-600">{p.godown_empty}</td>
                          <td className="text-center font-bold text-blue-600">{p.shop_full}</td>
                          <td className="text-center text-gray-500">{p.shop_empty}</td>
                          <td className="text-center font-extrabold text-lg">{total}</td>
                          <td>
                            <div className="flex gap-1 flex-wrap justify-center">
                              <button
                                className="px-2 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                                disabled={p.godown_full === 0}
                                onClick={() => openTransfer('goFull', p.id)}
                                title="Send full cylinders from godown to shop"
                              >Full to Shop</button>
                              <button
                                className="px-2 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                disabled={p.shop_empty === 0}
                                onClick={() => openTransfer('goEmpty', p.id)}
                                title="Return empty cylinders from shop to godown"
                              >Empty to Godown</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold">
                      <td>Grand Total</td>
                      <td className="text-center text-emerald-600">{summary.godownFull}</td>
                      <td className="text-center text-amber-600">{summary.godownEmpty}</td>
                      <td className="text-center text-blue-600">{summary.shopFull}</td>
                      <td className="text-center text-gray-500">{summary.shopEmpty}</td>
                      <td className="text-center text-lg">{summary.godownFull + summary.godownEmpty + summary.shopFull + summary.shopEmpty}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Accessories Table */}
          <div>
            <h3 className="section-title">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Accessories & Spares
            </h3>
            {accessories.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500">No accessories configured. Go to Inventory Setup to add shop products.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Unit</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">Price</th>
                      <th className="text-center">Status</th>
                      <th className="text-right">Stock-In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessories.map(a => {
                      const isLow = a.stock_count <= a.low_stock_threshold
                      return (
                        <tr key={a.id} className={isLow ? 'bg-red-50/50' : ''}>
                          <td className="font-semibold text-gray-900">{a.name}</td>
                          <td><span className="badge badge-info">{a.category}</span></td>
                          <td className="text-gray-600">{a.unit}</td>
                          <td className={`text-right font-bold text-lg ${isLow ? 'text-red-600' : 'text-emerald-600'}`}>
                            {a.stock_count}
                          </td>
                          <td className="text-right price">₹{(a.price_paise / 100).toFixed(2)}</td>
                          <td className="text-center">
                            {isLow
                              ? <span className="badge badge-danger">Low Stock</span>
                              : <span className="badge badge-success">In Stock</span>}
                          </td>
                          <td className="text-right">
                            <AccessoryStockIn
                              stock={a.stock_count}
                              onAdd={(qty) => confirmStockIn(a.id, qty)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: Refill Plant ── */}
      {tab === 'plant' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Plant Summary */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title mb-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Refill Plant Tracking
              </h3>
            </div>
            <div className="space-y-2 text-sm text-gray-500 mb-4">
              <p>Track cylinders sent to the plant (factory) for refill and full cylinders received back. The plant is an external factory — you can receive any number from them regardless of what was sent.</p>
            </div>
            {plantStats.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500">No plant movement recorded yet.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-center text-amber-600">Sent Empty to Plant</th>
                      <th className="text-center text-emerald-600">Received Full from Plant</th>
                      <th className="text-center">Pending Refill</th>
                      <th className="text-center">Refill Ratio</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plantStats.map(ps => {
                      const pending = (ps.sent_to_plant ?? 0) - (ps.received_from_plant ?? 0)
                      const ratio = (ps.sent_to_plant ?? 0) > 0
                        ? (ps.received_from_plant ?? 0) + '/' + (ps.sent_to_plant ?? 0)
                        : '0/0'
                      return (
                        <tr key={ps.id}>
                          <td className="font-semibold">
                            <div>{ps.name}</div>
                            <div className="text-xs text-gray-400">{ps.size_weight} • {ps.category}</div>
                          </td>
                          <td className="text-center font-bold text-amber-600 text-lg">{ps.sent_to_plant ?? 0}</td>
                          <td className="text-center font-bold text-emerald-600 text-lg">{ps.received_from_plant ?? 0}</td>
                          <td className="text-center font-extrabold text-lg" style={{ color: pending > 0 ? '#dc2626' : '#9ca3af' }}>
                            {pending > 0 ? pending + ' empty' : 'None'}
                          </td>
                          <td className="text-center text-sm text-gray-600 whitespace-nowrap">{ratio}</td>
                          <td>
                            <div className="flex gap-1 flex-wrap justify-center">
                              <button
                                className="px-2 py-1 rounded text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                                onClick={() => openTransfer('gpEmpty', ps.id)}
                              >Empty to Plant</button>
                              <button
                                className="px-2 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                onClick={() => openTransfer('pgFull', ps.id)}
                              >Full from Plant</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: Transfer History ── */}
      {tab === 'transfers' && (
        <div className="flex-1 overflow-y-auto p-6">
          {movements.length === 0 ? (
            <div className="card text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a3 3 0 013 3v0a3 3 0 01-3 3H5m14-4V7a2 2 0 00-2-2H5" />
              </svg>
              <p className="text-gray-500">No cylinder movements recorded yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Product</th>
                    <th>Movement</th>
                    <th>From</th>
                    <th>To</th>
                    <th className="text-center">Qty</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td className="text-sm text-gray-500 whitespace-nowrap">{m.timestamp ? m.timestamp.replace('T', ' ').slice(0, 16) : ''}</td>
                      <td className="font-semibold">{m.product_name || '—'}</td>
                      <td><span className="badge badge-info">{actionLabelRow(m.action)}</span></td>
                      <td className="text-sm capitalize">{m.location_from}</td>
                      <td className="text-sm capitalize">{m.location_to}</td>
                      <td className="text-center font-bold text-lg">{m.quantity}</td>
                      <td className="text-sm text-gray-500 max-w-48 truncate" title={m.reason || ''}>{m.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Transfer Modal ── */}
      {showTransfer && (
        <div className="modal-backdrop" onClick={() => { setShowTransfer(false); setTransferForm({ ...emptyForm }) }}>
          <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{getActionDef(transferForm.type)?.title || 'Transfer'}</h3>
              <p>{getActionDef(transferForm.type)?.desc}</p>
            </div>
            <div className="modal-body space-y-5">
              <div className="form-group">
                <label>Product</label>
                <select
                  className="input-field"
                  value={transferForm.productId}
                  onChange={e => setTransferForm(f => ({ ...f, productId: parseInt(e.target.value) }))}
                >
                  <option value={0}>-- Select product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.size_weight})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{isCorrection(transferForm.type) ? 'Adjustment (+add / -remove)' : 'Quantity'}</label>
                <input
                  type="number"
                  className="input-field input-field-lg"
                  min={isCorrection(transferForm.type) ? undefined : 1}
                  placeholder={isCorrection(transferForm.type) ? 'e.g. 5 or -3' : 'Enter quantity'}
                  value={transferForm.qty}
                  onChange={e => setTransferForm(f => ({ ...f, qty: e.target.value }))}
                  autoFocus
                />
              </div>

              {isCorrection(transferForm.type) && !transferForm.reason.trim() && (
                <div className="form-group">
                  <label>Reason (required)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Physical count discrepancy"
                    value={transferForm.reason}
                    onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))}
                  />
                </div>
              )}

              {transferForm.productId && !isCorrection(transferForm.type) && (() => {
                const p = products.find(x => x.id === transferForm.productId)
                if (!p) return null
                const available = getAvailableStock(p, transferForm.type)
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-blue-800 text-sm font-semibold">Available</span>
                    <span className="text-blue-700 text-2xl font-extrabold">{available}</span>
                  </div>
                )
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowTransfer(false); setTransferForm({ ...emptyForm }) }}>Cancel</button>
              <button className="btn btn-blue" onClick={executeTransfer}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ── */

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  const numColorMap: Record<string, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    gray: 'text-gray-700',
    purple: 'text-purple-700',
  }
  return (
    <div className={`rounded-xl border px-5 py-4 ${colorMap[color]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className={`text-3xl font-extrabold mt-1 ${numColorMap[color]}`}>{value}</div>
    </div>
  )
}

function AccessoryStockIn({ stock, onAdd }: { stock: number; onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState('')
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <input
          type="number"
          className="input-field input-field-sm w-20"
          min="1"
          placeholder="Qty"
          value={qty}
          onChange={e => setQty(e.target.value)}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const n = parseInt(qty)
              if (n > 0) { onAdd(n); setQty(''); setOpen(false) }
            }
          }}
        />
        <button
          className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
          onClick={() => {
            const n = parseInt(qty)
            if (n > 0) { onAdd(n); setQty(''); setOpen(false) }
          }}
        >✓</button>
        <button
          className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100"
          onClick={() => { setOpen(false); setQty('') }}
        >✕</button>
      </div>
    )
  }

  return (
    <button
      className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
      onClick={() => setOpen(true)}
    >+ Add</button>
  )
}

export default Inventory
