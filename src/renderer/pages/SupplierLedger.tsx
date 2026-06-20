import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'
import { formatDateTime } from '@/utils/formatters'

function db() { return window.api }

interface LedgerEntry {
  id: number
  date: string
  action: string
  product_name: string
  size_weight: string
  quantity: number
}

const SupplierLedger: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([])

  const load = useCallback(async () => {
    const rows = await db().dbAll(`
      SELECT sl.id, sl.date, sl.action, sl.product_id, sl.quantity, gp.name as product_name, gp.size_weight
      FROM (SELECT id, date, action, product_id, quantity FROM supplier_ledger) sl
      LEFT JOIN godown_products gp ON sl.product_id = gp.id
      ORDER BY sl.date DESC, sl.id DESC
    `) as LedgerEntry[]
    setEntries(rows)
  }, [])

  useEffect(() => { load() }, [load])

  // Count total sent/received per product
  const summary = entries.reduce((acc, e) => {
    const key = e.product_name || 'Unknown'
    if (!acc[key]) acc[key] = { sent: 0, received: 0 }
    if (e.action === 'sent_to_plant') acc[key].sent += e.quantity
    else if (e.action === 'received_from_plant') acc[key].received += e.quantity
    return acc
  }, {} as Record<string, { sent: number; received: number }>)

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <div className="page-header shrink-0">
        <div>
          <h2>Plant Movement History</h2>
          <p className="subtitle">Cylinder transfers to/from filling plant</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Summary Cards */}
        {Object.keys(summary).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(summary).map(([name, data]) => (
              <div key={name} className="card">
                <div className="text-sm font-bold text-gray-500 uppercase mb-2">{name}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Sent</div>
                    <div className="text-2xl font-extrabold text-amber-600">{data.sent}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Received</div>
                    <div className="text-2xl font-extrabold text-emerald-600">{data.received}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Transaction Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Movement Transactions</h3>
              <p className="subtitle">Chronological record of plant transfers</p>
            </div>
            <span className="badge badge-neutral">{entries.length} records</span>
          </div>

          {entries.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="title">No transactions yet</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Action</th>
                    <th>Product</th>
                    <th className="text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td className="text-gray-600 text-sm whitespace-nowrap">{formatDateTime(e.date)}</td>
                      <td>
                        <span className={`badge ${e.action === 'sent_to_plant' ? 'badge-warning' : 'badge-success'}`}>
                          {e.action === 'sent_to_plant' ? 'Sent to Plant' : 'Received from Plant'}
                        </span>
                      </td>
                      <td className="text-gray-800 font-medium">{e.product_name} {e.size_weight ? `(${e.size_weight})` : ''}</td>
                      <td className="text-right text-lg font-bold text-emerald-600">{e.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SupplierLedger
