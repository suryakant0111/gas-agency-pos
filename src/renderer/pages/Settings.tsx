import React, { useEffect, useState } from 'react'
import { useAppStore } from '@/store/app'
import { rupeesToPaise } from '@/utils/formatters'

const Settings: React.FC = () => {
  const [values, setValues] = useState<Record<string, string>>({})
  const [priceConfig, setPriceConfig] = useState<any[]>([])
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const addToast = useAppStore(s => s.addToast)

  useEffect(() => { loadSettings(); loadPrices() }, [])

  async function loadSettings() {
    const rows = await window.api.dbAll('SELECT key, value FROM settings')
    const map: Record<string, string> = {}
    for (const r of (rows as any[])) map[r.key] = r.value ?? ''
    setValues(map)
  }

  async function loadPrices() {
    const rows = await window.api.dbAll('SELECT id, name, size_weight, default_price_paise FROM godown_products ORDER BY name')
    setPriceConfig(rows as any[])
  }

  async function saveValue(key: string, value: string) {
    await window.api.dbRun("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", [key, value, value])
  }

  async function saveAgencySettings() {
    for (const key of ['agency_name', 'agency_address', 'agency_phone', 'agency_gstin', 'bill_prefix', 'bill_footer']) {
      await saveValue(key, values[key] || '')
    }
    addToast('Settings saved', 'success')
  }

  async function handleChangePassword() {
    const current = await window.api.dbGet("SELECT value FROM settings WHERE key = 'dashboard_password'") as any
    if (current?.value !== passwordForm.current) { addToast('Current password is incorrect', 'error'); return }
    if (passwordForm.new !== passwordForm.confirm) { addToast('New passwords do not match', 'error'); return }
    if (passwordForm.new.length < 3) { addToast('Password must be at least 3 characters', 'error'); return }
    await saveValue('dashboard_password', passwordForm.new)
    setPasswordForm({ current: '', new: '', confirm: '' })
    addToast('Password changed', 'success')
  }

  async function updatePrice(productId: number, priceStr: string) {
    const paise = rupeesToPaise(parseFloat(priceStr) || 0)
    await window.api.dbRun(`UPDATE godown_products SET default_price_paise = ? WHERE id = ?`, [paise, productId])
    addToast('Price updated', 'success')
    loadPrices()
  }

  async function updateBillCounter() {
    await window.api.dbRun("INSERT INTO settings (key, value) VALUES ('bill_prefix', ?) ON CONFLICT(key) DO UPDATE SET value = ?", [values.bill_prefix, values.bill_prefix])
    await window.api.dbRun("UPDATE bill_counter SET prefix = ?", [values.bill_prefix])
    addToast('Bill counter updated', 'success')
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h2 className="sec-title">⚙️ Settings</h2>

      {/* Agency Info */}
      <div className="card">
        <h3 className="sec-title text-accent-gold">🏢 Agency Information</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Agency Name', key: 'agency_name' },
            { label: 'Address', key: 'agency_address' },
            { label: 'Phone', key: 'agency_phone' },
            { label: 'GSTIN', key: 'agency_gstin' },
          ].map(f => (
            <div key={f.key}>
              <span className="lbl">{f.label}</span>
              <input className="inp w-full" value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <button className="btn-primary mt-4" onClick={saveAgencySettings}>💾 Save</button>
      </div>

      {/* Bill Settings */}
      <div className="card">
        <h3 className="sec-title text-accent-gold">📄 Bill Settings</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="lbl">Bill Prefix</span>
            <input className="inp w-full" value={values.bill_prefix || 'BILL'} onChange={e => setValues(v => ({ ...v, bill_prefix: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <span className="lbl">Bill Footer Note</span>
            <input className="inp w-full" value={values.bill_footer || ''} onChange={e => setValues(v => ({ ...v, bill_footer: e.target.value }))} />
          </div>
        </div>
        <button className="btn-primary mt-4" onClick={updateBillCounter}>💾 Save Bill Settings</button>
      </div>

      {/* Price Config */}
      {priceConfig.length > 0 && (
        <div className="card">
          <h3 className="sec-title text-accent-gold">💲 Cylinder Default Prices (₹) — Editable at POS too</h3>
          <div className="space-y-2">
            {priceConfig.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
                <span className="text-white font-medium text-sm">{p.name} ({p.size_weight})</span>
                <input type="number" className="inp !w-28 !py-1 !px-2 font-mono text-accent-green" step="0.01"
                       defaultValue={p.default_price_paise / 100}
                       onBlur={e => updatePrice(p.id, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change Password */}
      <div className="card">
        <h3 className="sec-title text-accent-gold">🔐 Change Dashboard Password</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="lbl">Current Password</span>
            <input type="password" className="inp w-full" value={passwordForm.current} onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))} />
          </div>
          <div>
            <span className="lbl">New Password</span>
            <input type="password" className="inp w-full" value={passwordForm.new} onChange={e => setPasswordForm(f => ({ ...f, new: e.target.value }))} />
          </div>
          <div>
            <span className="lbl">Confirm New Password</span>
            <input type="password" className="inp w-full" value={passwordForm.confirm} onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
        </div>
        <button className="btn-primary mt-4" onClick={handleChangePassword}>🔑 Change Password</button>
      </div>
    </div>
  )
}

export default Settings
