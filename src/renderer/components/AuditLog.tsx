import React, { useEffect, useState, useCallback } from 'react'
import { formatDateTime } from '@/utils/formatters'

interface LogEntry {
  id: number
  timestamp: string
  event_type: string
  entity: string
  action_description: string
  before_value: string
  after_value: string
}

const AUDIT_EVENTS = ['all', 'sale', 'sent_to_plant', 'received_from_plant', 'send_to_shop', 'receive_from_shop', 'correction', 'inventory', 'shop', 'settings', 'credit']
const AUDIT_ENTITIES = ['all', 'godown_product', 'shop_product', 'godown', 'sale', 'cylinder_stock', 'accessory_stock', 'credit', 'settings']

const AuditLog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filterType, setFilterType] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const handler = () => { setOpen(true); loadLogs() }
    window.addEventListener('open-audit-log', handler)
    return () => window.removeEventListener('open-audit-log', handler)
  }, [])

  useEffect(() => { if (open) loadLogs() }, [filterType, filterEntity, dateFrom, dateTo])

  const loadLogs = useCallback(async () => {
    let sql = 'SELECT * FROM audit_log WHERE 1=1'
    const params: any[] = []

    if (filterType !== 'all') { sql += ' AND event_type = ?'; params.push(filterType) }
    if (filterEntity !== 'all') { sql += ' AND entity = ?'; params.push(filterEntity) }
    if (dateFrom) { sql += ' AND timestamp >= ?'; params.push(dateFrom) }
    if (dateTo) { sql += ' AND timestamp <= ?'; params.push(dateTo + 'T23:59:59') }
    sql += ' ORDER BY timestamp DESC LIMIT 200'

    const rows = await window.api.dbAll(sql, params)
    let entries = rows as LogEntry[]

    if (search.trim()) {
      const s = search.toLowerCase()
      entries = entries.filter(e =>
        e.action_description.toLowerCase().includes(s) ||
        e.event_type.toLowerCase().includes(s) ||
        e.entity.toLowerCase().includes(s)
      )
    }

    setLogs(entries)
  }, [filterType, filterEntity, dateFrom, dateTo, search])

  async function exportCsv() {
    await window.api.exportCSV('audit-log', logs.map(l => ({
      timestamp: l.timestamp,
      event: l.event_type,
      entity: l.entity,
      description: l.action_description,
      before: l.before_value,
      after: l.after_value,
    })))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
      <div className="bg-dark-secondary border border-dark-border rounded-lg w-[95vw] h-[90vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">Audit Log <span className="text-gray-500 text-sm font-normal">(Ctrl+Shift+L)</span></h2>
          <button className="btn-ghost !py-1 !px-3" onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-dark-border flex gap-3 items-center flex-wrap">
          <select className="input-field !py-1 !px-2 !text-xs" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {AUDIT_EVENTS.map(e => <option key={e} value={e}>{e === 'all' ? 'All Events' : e}</option>)}
          </select>
          <select className="input-field !py-1 !px-2 !text-xs" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
            {AUDIT_ENTITIES.map(e => <option key={e} value={e}>{e === 'all' ? 'All Entities' : e}</option>)}
          </select>
          <input type="date" className="input-field !py-1 !px-2 !text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
          <input type="date" className="input-field !py-1 !px-2 !text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
          <input className="input-field !py-1 !px-2 !text-xs flex-1 min-w-[150px]" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-primary !py-1 !px-3 !text-xs" onClick={loadLogs}>Refresh</button>
          <button className="btn-ghost !py-1 !px-3 !text-xs" onClick={exportCsv}>Export CSV</button>
        </div>

        {/* Log Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-dark-secondary">
              <tr className="text-left text-gray-400 border-b border-dark-border">
                <th className="px-4 py-2 font-medium">Timestamp</th>
                <th className="px-4 py-2 font-medium w-24">Event</th>
                <th className="px-4 py-2 font-medium w-28">Entity</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-dark-border/50 hover:bg-dark-tertiary">
                  <td className="px-4 py-1.5 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(l.timestamp)}</td>
                  <td className="px-4 py-1.5"><span className="badge-blue badge-green">{l.event_type}</span></td>
                  <td className="px-4 py-1.5 text-gray-400 text-xs">{l.entity}</td>
                  <td className="px-4 py-1.5 text-white text-xs">{l.action_description}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} className="text-center text-gray-500 py-8">No log entries found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AuditLog
