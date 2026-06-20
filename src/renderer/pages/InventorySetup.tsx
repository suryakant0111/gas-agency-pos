import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'
import { formatDateTime } from '@/utils/formatters'

function db() { return window.api }

interface GodownProduct {
  id: number
  name: string
  category: string
  size_weight: string
  unit: string
  description: string
  default_price_paise: number
  full_count: number
  empty_count: number
}

interface ShopProduct {
  id: number
  name: string
  category: string
  unit: string
  stock_count: number
  low_stock_threshold: number
  price_paise: number
}

const InventorySetup: React.FC = () => {
  const [tab, setTab] = useState<'godown' | 'shop'>('godown')
  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <div className="page-header shrink-0">
        <div>
          <h2>Inventory Setup</h2>
          <p className="subtitle">Manage cylinder and shop products</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'godown' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'}`}
            onClick={() => setTab('godown')}
          >
            Cylinder Products
          </button>
          <button
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'shop' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'}`}
            onClick={() => setTab('shop')}
          >
            Shop Products
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'godown' ? <GodownTab /> : <ShopTab />}
      </div>
    </div>
  )
}

// ─── Godown Tab ───
const GODOWN_PRODUCT_CATEGORIES = ['Domestic', 'Commercial', 'FTL', 'Other']

function GodownTab() {
  const [products, setProducts] = useState<GodownProduct[]>([])
  const [form, setForm] = useState({ name: '', category: 'Domestic', size_weight: '', unit: 'cylinder', description: '', priceRupees: '', initialFull: 0, initialEmpty: 0 })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDelete, setShowDelete] = useState<{ open: boolean, id: number, name: string }>({ open: false, id: 0, name: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    const rows = await db().dbAll(`
      SELECT gp.*, COALESCE(gs.full_count, 0) as full_count,
             COALESCE(gs.empty_count, 0) as empty_count
      FROM godown_products gp
      LEFT JOIN godown_stock gs ON gp.id = gs.product_id
      ORDER BY gp.name
    `)
    setProducts(rows as GodownProduct[])
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Product name is required'
    if (!form.size_weight.trim()) errs.size_weight = 'Size/weight is required'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const pricePaise = Math.round((parseFloat(form.priceRupees || '0') * 100))
    const full = form.initialFull || 0
    const empty = form.initialEmpty || 0

    try {
      if (editingId) {
        await db().dbRun(
          `UPDATE godown_products SET name=?, category=?, size_weight=?, unit=?, description=?, default_price_paise=? WHERE id=?`,
          [form.name, form.category, form.size_weight, form.unit, form.description, pricePaise, editingId]
        )
        await db().dbRun(
          `UPDATE godown_stock SET full_count=?, empty_count=? WHERE product_id=?`,
          [full, empty, editingId]
        )
        addToast('Product updated successfully', 'success')
      } else {
        const result = await db().dbRun(
          `INSERT INTO godown_products (name, category, size_weight, unit, description, default_price_paise) VALUES (?, ?, ?, ?, ?, ?)`,
          [form.name, form.category, form.size_weight, form.unit, form.description, pricePaise]
        )
        const pid = result.lastInsertRowid
        await db().dbRun(
          `INSERT INTO godown_stock (product_id, full_count, empty_count) VALUES (?, ?, ?)`,
          [pid, full, empty]
        )
        await db().dbRun(
          `INSERT INTO shop_cylinder_stock (product_id, full_count, empty_count) VALUES (?, ?, ?)`,
          [pid, full, empty]
        )
        addToast(`Product "${form.name}" added successfully`, 'success')
      }
    } catch (err: any) { addToast(`Error: ${err.message}`, 'error'); return }

    await db().dbRun(
      `INSERT INTO audit_log (event_type, entity, action_description) VALUES ('inventory', 'godown_product', '${editingId ? 'Updated' : 'Added'}: ${form.name}')`
    )
    setForm({ name: '', category: 'Domestic', size_weight: '', unit: 'cylinder', description: '', priceRupees: '', initialFull: 0, initialEmpty: 0 })
    setEditingId(null)
    setErrors({})
    load()
  }

  function editProduct(p: GodownProduct) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      category: p.category,
      size_weight: p.size_weight,
      unit: p.unit,
      description: p.description,
      priceRupees: p.default_price_paise / 100,
      initialFull: p.full_count || 0,
      initialEmpty: p.empty_count || 0,
    })
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteProduct() {
    try {
      await db().dbRun(`DELETE FROM shop_cylinder_stock WHERE product_id = ?`, [showDelete.id])
      await db().dbRun(`DELETE FROM godown_stock WHERE product_id = ?`, [showDelete.id])
      await db().dbRun(`DELETE FROM godown_products WHERE id = ?`, [showDelete.id])
      addToast(`Product "${showDelete.name}" deleted`, 'success')
      setShowDelete({ open: false, id: 0, name: '' })
      load()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  return (
    <div className="space-y-8">
      {/* Add/Edit Form */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>{editingId ? '✏️ Edit Cylinder Product' : '➕ Add Cylinder Product'}</h3>
            <p className="subtitle">Set product details and initial stock levels</p>
          </div>
          {editingId && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setErrors({}); setForm({ name: '', category: 'Domestic', size_weight: '', unit: 'cylinder', description: '', priceRupees: '', initialFull: 0, initialEmpty: 0 }) }}>
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="input-label">Product Name *</label>
              <input className={`input-field ${errors.name ? 'border-red-400' : ''}`} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Domestic 14.2kg" />
              {errors.name && <p className="mt-1 text-sm text-red-600 font-medium">{errors.name}</p>}
            </div>
            <div>
              <label className="input-label">Category</label>
              <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {GODOWN_PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Size / Weight *</label>
              <input className={`input-field ${errors.size_weight ? 'border-red-400' : ''}`} value={form.size_weight} onChange={e => setForm(f => ({ ...f, size_weight: e.target.value }))} placeholder="e.g. 14.2 kg" />
              {errors.size_weight && <p className="mt-1 text-sm text-red-600 font-medium">{errors.size_weight}</p>}
            </div>
            <div>
              <label className="input-label">Default Price (₹)</label>
              <input type="number" className="input-field" step="0.01" min="0" value={form.priceRupees}
                     onChange={e => setForm(f => ({ ...f, priceRupees: e.target.value }))} placeholder="Enter price in rupees" />
            </div>
            <div>
              <label className="input-label">Description</label>
              <input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
          </div>

          {/* Initial Stock */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-3">Initial Stock Setup</h4>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="input-label">Full Cylinders in Godown</label>
                <input type="number" className="input-field" min="0" value={form.initialFull}
                       onChange={e => setForm(f => ({ ...f, initialFull: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="input-label">Empty Cylinders in Godown</label>
                <input type="number" className="input-field" min="0" value={form.initialEmpty}
                       onChange={e => setForm(f => ({ ...f, initialEmpty: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <button type="submit" className={`btn ${editingId ? 'btn-amber' : 'btn-green'} w-full`}>
            {editingId ? '💾 Update Product & Stock' : '➕ Add Product & Set Stock'}
          </button>
        </form>
      </div>

      {/* Products Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Cylinder Products</h3>
            <p className="subtitle">All configured cylinder products</p>
          </div>
          <span className="badge badge-info">{products.length} products</span>
        </div>
        {products.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px' }}>
            <p className="text-gray-500 text-sm">No cylinder products yet. Add one using the form above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th className="text-right">Full</th>
                  <th className="text-right">Empty</th>
                  <th className="text-right">Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td className="font-bold text-gray-900">{p.name}</td>
                    <td><span className="badge badge-info">{p.category}</span></td>
                    <td className="text-gray-600">{p.size_weight}</td>
                    <td className="text-right text-emerald-600 font-bold font-mono text-lg">{p.full_count}</td>
                    <td className="text-right text-gray-700 font-bold font-mono text-lg">{p.empty_count}</td>
                    <td className="text-right price">₹{(p.default_price_paise / 100).toFixed(2)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-blue btn-sm" onClick={() => editProduct(p)}>✏️ Edit</button>
                        <button className="btn btn-red btn-sm" onClick={() => setShowDelete({ open: true, id: p.id, name: p.name })}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {showDelete.open && (
        <div className="modal-backdrop" onClick={() => setShowDelete({ open: false, id: 0, name: '' })}>
          <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header bg-red-50 border-red-200">
              <h3 className="text-red-700">⚠️ Delete Product</h3>
              <p>Are you sure you want to delete this product?</p>
            </div>
            <div className="modal-body">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-600 mb-1">You are about to delete:</p>
                <p className="text-red-700 font-bold text-lg">"{showDelete.name}"</p>
                <p className="text-xs text-red-500 mt-1">This action cannot be undone</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDelete({ open: false, id: 0, name: '' })}>Cancel</button>
              <button className="btn btn-red" onClick={deleteProduct}>Delete Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shop Tab ───
const SHOP_PRODUCT_CATEGORIES = ['Accessories', 'Spares', 'Other']

function ShopTab() {
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [form, setForm] = useState({ name: '', category: 'Accessories', unit: 'piece', stock_count: 0, low_stock_threshold: 5, priceRupees: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showDelete, setShowDelete] = useState<{ open: boolean, id: number, name: string }>({ open: false, id: 0, name: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const addToast = useAppStore(s => s.addToast)

  const load = useCallback(async () => {
    const rows = await db().dbAll('SELECT * FROM shop_products ORDER BY name')
    setProducts(rows as ShopProduct[])
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Product name is required'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const pricePaise = Math.round((parseFloat(form.priceRupees || '0') * 100))
    const stock = parseInt(String(form.stock_count)) || 0

    try {
      if (editingId) {
        await db().dbRun(
          `UPDATE shop_products SET name=?, category=?, unit=?, stock_count=?, low_stock_threshold=?, price_paise=? WHERE id=?`,
          [form.name, form.category, form.unit, stock, form.low_stock_threshold, pricePaise, editingId]
        )
        addToast('Product updated successfully', 'success')
      } else {
        await db().dbRun(
          `INSERT INTO shop_products (name, category, unit, stock_count, low_stock_threshold, price_paise) VALUES (?, ?, ?, ?, ?, ?)`,
          [form.name, form.category, form.unit, stock, form.low_stock_threshold, pricePaise]
        )
        addToast(`Product "${form.name}" added successfully`, 'success')
      }
    } catch (err: any) { addToast(`Error: ${err.message}`, 'error'); return }

    await db().dbRun(
      `INSERT INTO audit_log (event_type, entity, action_description) VALUES ('inventory', 'shop_product', '${editingId ? 'Updated' : 'Added'}: ${form.name}')`
    )
    setForm({ name: '', category: 'Accessories', unit: 'piece', stock_count: 0, low_stock_threshold: 5, priceRupees: '' })
    setEditingId(null)
    setErrors({})
    load()
  }

  function editProduct(p: ShopProduct) {
    setEditingId(p.id)
    setForm({ name: p.name, category: p.category, unit: p.unit, stock_count: p.stock_count, low_stock_threshold: p.low_stock_threshold, priceRupees: p.price_paise / 100 })
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteProduct() {
    try {
      await db().dbRun(`DELETE FROM shop_products WHERE id = ?`, [showDelete.id])
      addToast(`Product "${showDelete.name}" deleted`, 'success')
      setShowDelete({ open: false, id: 0, name: '' })
      load()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  return (
    <div className="space-y-8">
      {/* Add/Edit Form */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>{editingId ? '✏️ Edit Shop Product' : '➕ Add Shop Product'}</h3>
            <p className="subtitle">Set product details, price, and initial stock</p>
          </div>
          {editingId && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setErrors({}); setForm({ name: '', category: 'Accessories', unit: 'piece', stock_count: 0, low_stock_threshold: 5, priceRupees: '' }) }}>
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-3">
              <label className="input-label">Product Name *</label>
              <input className={`input-field ${errors.name ? 'border-red-400' : ''}`} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. LPG Stove" />
              {errors.name && <p className="mt-1 text-sm text-red-600 font-medium">{errors.name}</p>}
            </div>
            <div>
              <label className="input-label">Category</label>
              <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {SHOP_PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Unit</label>
              <input className="input-field" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="piece / set" />
            </div>
            <div>
              <label className="input-label">Stock Qty</label>
              <input type="number" className="input-field" min="0" value={form.stock_count} onChange={e => setForm(f => ({ ...f, stock_count: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <button type="submit" className={`btn ${editingId ? 'btn-amber' : 'btn-green'} w-full`}>
            {editingId ? '💾 Update Product' : '➕ Add Product'}
          </button>
        </form>
      </div>

      {/* Products Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Shop Products</h3>
            <p className="subtitle">All accessories and spares</p>
          </div>
          <span className="badge badge-info">{products.length} products</span>
        </div>
        {products.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px' }}>
            <p className="text-gray-500 text-sm">No shop products yet. Add one using the form above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Price</th>
                  <th className="text-center">Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const isLow = p.stock_count <= p.low_stock_threshold
                  return (
                    <tr key={p.id}>
                      <td className="font-bold text-gray-900">{p.name}</td>
                      <td><span className="badge badge-info">{p.category}</span></td>
                      <td className="text-gray-600">{p.unit}</td>
                      <td className="text-right font-bold text-lg">{p.stock_count}</td>
                      <td className="text-right price">₹{(p.price_paise / 100).toFixed(2)}</td>
                      <td className="text-center">
                        {isLow
                          ? <span className="badge badge-danger">LOW STOCK</span>
                          : <span className="badge badge-success">In Stock</span>}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-blue btn-sm" onClick={() => editProduct(p)}>✏️ Edit</button>
                          <button className="btn btn-red btn-sm" onClick={() => setShowDelete({ open: true, id: p.id, name: p.name })}>🗑️</button>
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

      {/* Delete Confirmation */}
      {showDelete.open && (
        <div className="modal-backdrop" onClick={() => setShowDelete({ open: false, id: 0, name: '' })}>
          <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header bg-red-50 border-red-200">
              <h3 className="text-red-700">⚠️ Delete Product</h3>
              <p>Are you sure you want to delete this product?</p>
            </div>
            <div className="modal-body">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-600 mb-1">You are about to delete:</p>
                <p className="text-red-700 font-bold text-lg">"{showDelete.name}"</p>
                <p className="text-xs text-red-500 mt-1">This action cannot be undone</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDelete({ open: false, id: 0, name: '' })}>Cancel</button>
              <button className="btn btn-red" onClick={deleteProduct}>Delete Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InventorySetup
