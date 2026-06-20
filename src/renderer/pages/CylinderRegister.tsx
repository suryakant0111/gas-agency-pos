import React, { useEffect, useState, useCallback } from 'react'
import { formatDateTime } from '@/utils/formatters'

function db() { return window.api }

interface RegisterEntry {
  id: number
  product_name: string
  size_weight: string
  action: string
  location_from: string
  location_to: string
  quantity: number
  timestamp: string
  reason: string
  reference_id: string
}

const ACTION_COLORS: Record<string, string> = {
  sent_to_shop: 'badge-info',
  received_from_shop: 'badge-warning',
  sent_to_plant: 'badge-neutral',
  received_from_plant: 'badge-success',
  sale: 'badge-success',
}

const CylinderRegister: React.FC = () => {
  const [entries, setEntries] = useState<RegisterEntry[]>([])

  const load = useCallback(async () => {
    const rows = await db().dbAll(`
      SELECT cr.*, gp.name as product_name, gp.size_weight
      FROM cylinder_register cr
      LEFT JOIN godown_products gp ON cr.product_id = gp.id
      ORDER BY cr.timestamp DESC LIMIT 500
    `)
    setEntries(rows as RegisterEntry[])
  }, [])

  useEffect(() => { load() }, [load])

  async function exportCsv() {
    const data = entries.map(e => ({
      Timestamp: e.timestamp,
      Product: e.product_name || '(unknown)',
      Size: e.size_weight || '',
      Action: e.action,
      From: e.location_from,
      To: e.location_to,
      Quantity: e.quantity,
      Reason: e.reason,
      Reference: e.reference_id,
    }))
    await window.api.exportCSV('cylinder-register', data)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <div className="page-header shrink-0">
        <div>
          <h2>Cylinder Register</h2>
          <p className="subtitle">Complete cylinder movement tracking</p>
        </div>
        <button className="btn btn-blue btn-sm" onClick={exportCsv}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {entries.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-5xl mb-3">📦</div>
            <h4 className="text-lg font-semibold text-gray-700 mb-1">No cylinder movements recorded</h4>
            <p className="text-sm text-gray-500">Transfers will appear here when cylinders are moved</p>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Product</th>
                    <th>Action</th>
                    <th>From → To</th>
                    <th className="text-right">Qty</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td className="text-gray-600 text-sm whitespace-nowrap">{formatDateTime(e.timestamp)}</td>
                      <td className="text-gray-800 font-medium">{e.product_name} {e.size_weight ? `(${e.size_weight})` : ''}</td>
                      <td>
                        <span className={`badge ${ACTION_COLORS[e.action] || 'badge-neutral'}`}>
                          {e.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="text-gray-600 text-sm">
                        <span className="font-semibold">{e.location_from}</span> → <span className="font-semibold">{e.location_to}</span>
                      </td>
                      <td className="text-right text-lg font-bold text-emerald-600">{e.quantity}</td>
                      <td className="text-gray-500 text-sm max-w-xs truncate">
                        {e.reason || (e.reference_id ? `Ref: ${e.reference_id}` : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CylinderRegister
