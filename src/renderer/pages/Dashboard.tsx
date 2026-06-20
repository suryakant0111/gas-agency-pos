import React, { useEffect, useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, BarChart, Bar } from 'recharts'
import { formatCurrency } from '@/utils/formatters'

function db() { return window.api }

interface TodayStats {
  total_sales: number
  total_revenue: number
  total_units: number
  cash: number
  upi: number
  credit: number
  cheque: number
}

const Dashboard: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [todayStats, setTodayStats] = useState<TodayStats>({ total_sales: 0, total_revenue: 0, total_units: 0, cash: 0, upi: 0, credit: 0, cheque: 0 })
  const [chartData, setChartData] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [outstanding, setOutstanding] = useState(0)
  const [pendingEmpties, setPendingEmpties] = useState(0)
  const [uncollectedRevenue, setUncollectedRevenue] = useState(0)
  const [debtors, setDebtors] = useState<{ customer_name: string; phone: string; amount: number; empties: number }[]>([])
  const [allPayments, setAllPayments] = useState<{ name: string; value: number }[]>([])

  useEffect(() => { if (authenticated) loadData() }, [authenticated])

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)

    try {
      const todayResult = await db().dbGet(`
        SELECT COUNT(*) as total_sales, COALESCE(SUM(total_paise), 0) as total_revenue
        FROM sales WHERE date = ?
      `, [today]) as any
      const unitsResult = await db().dbGet(`
        SELECT COALESCE(SUM(qty), 0) as total_units FROM sale_items
        JOIN sales ON sale_items.sale_id = sales.id WHERE sales.date = ?
      `, [today]) as any

      const paymentResult = await db().dbAll(`
        SELECT method, COALESCE(SUM(amount_paise), 0) as total
        FROM sale_payments sp JOIN sales s ON sp.sale_id = s.id
        WHERE s.date = ? AND method != 'Credit'
        GROUP BY method
      `, [today]) as any[]

      const creditPaymentResult = await db().dbAll(`
        SELECT method, COALESCE(SUM(amount_paise), 0) as total
        FROM sale_payments sp JOIN sales s ON sp.sale_id = s.id
        WHERE s.date = ? AND method = 'Credit'
        GROUP BY method
      `, [today]) as any[]
      const creditTotal = creditPaymentResult.reduce((s, p) => s + p.total, 0)

      const paymentBreakdown: Record<string, number> = {}
      for (const p of paymentResult) paymentBreakdown[p.method] = p.total

      // Revenue = only payments actually collected (cash + UPI + cheque), NOT credit
      const collectedRevenue = (paymentBreakdown['Cash'] || 0) + (paymentBreakdown['UPI'] || 0) + (paymentBreakdown['Cheque'] || 0)

      setTodayStats({
        total_sales: todayResult?.total_sales || 0,
        total_revenue: collectedRevenue,
        total_units: unitsResult?.total_units || 0,
        cash: paymentBreakdown['Cash'] || 0,
        upi: paymentBreakdown['UPI'] || 0,
        credit: creditTotal,
        cheque: paymentBreakdown['Cheque'] || 0,
      })

      const chartResult = await db().dbAll(`
        SELECT s.date, COUNT(DISTINCT s.id) as num_sales, COALESCE(SUM(sp.amount_paise), 0) as revenue
        FROM sales s
        LEFT JOIN sale_payments sp ON sp.sale_id = s.id AND sp.method != 'Credit'
        WHERE s.date >= date('now', '-14 days')
        GROUP BY s.date ORDER BY s.date
      `) as any[]
      setChartData(chartResult)

      const topResult = await db().dbAll(`
        SELECT product_name, SUM(qty) as total_qty, SUM(total_paise) as total_rev
        FROM sale_items
        GROUP BY product_name ORDER BY total_qty DESC LIMIT 8
      `) as any[]
      setTopProducts(topResult)

      const lowResult = await db().dbAll(`
        SELECT name, stock_count, low_stock_threshold FROM shop_products
        WHERE stock_count <= low_stock_threshold ORDER BY stock_count
      `) as any[]
      setLowStock(lowResult)

      const creditResult = await db().dbGet(`
        SELECT COALESCE(SUM(original_paise - paid_paise), 0) as outstanding
        FROM credit_ledger WHERE status != 'Closed'
      `) as any
      setOutstanding(creditResult?.outstanding || 0)
      setUncollectedRevenue(creditResult?.outstanding || 0)

      // Pending empty cylinders from audit_log
      const emptiesResult = await db().dbGet(`
        SELECT COALESCE(SUM(CAST(after_value AS INTEGER)), 0) as pending
        FROM audit_log WHERE event_type = 'empty_not_returned'
        AND CAST(after_value AS INTEGER) > 0
      `) as any
      setPendingEmpties(emptiesResult?.pending || 0)

      // All-time payment totals for pie chart
      const allPay = await db().dbAll(`
        SELECT method, COALESCE(SUM(amount_paise), 0) as value
        FROM sale_payments GROUP BY method
      `) as any[]
      setAllPayments(allPay.map(p => ({ name: p.method, value: p.value })))

      // Top debtors (customers with outstanding balances)
      const debtorRows = await db().dbAll(`
        SELECT customer_name, phone, COALESCE(SUM(original_paise - paid_paise), 0) as amount
        FROM credit_ledger WHERE status != 'Closed'
        GROUP BY customer_name ORDER BY amount DESC
      `) as any[]

      // Pending empties per customer (from audit_log)
      const emptyRows = await db().dbAll(`
        SELECT entity as customer_name, CAST(after_value AS INTEGER) as empties
        FROM audit_log WHERE event_type = 'empty_not_returned'
        AND CAST(after_value AS INTEGER) > 0
      `) as any[]

      const emptyMap = new Map<string, number>()
      for (const r of emptyRows) {
        emptyMap.set(r.customer_name, (emptyMap.get(r.customer_name) || 0) + r.empties)
      }

      const debtorList = debtorRows.map((d: any) => ({
        customer_name: d.customer_name,
        phone: d.phone || '',
        amount: d.amount,
        empties: emptyMap.get(d.customer_name) || 0,
      }))
      setDebtors(debtorList)
    } catch (err: any) {
      console.error('Dashboard load error:', err)
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    try {
      const settings = await db().dbGet("SELECT value FROM settings WHERE key = 'dashboard_password'") as any
      if (settings?.value === password) {
        setAuthenticated(true)
        setError('')
      } else {
        setError('Incorrect password')
      }
    } catch (err) {
      setError('Failed to verify password')
    }
  }

  if (!authenticated) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200 p-4">
        <div className="card w-full max-w-md p-10">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Dashboard Access</h2>
            <p className="text-sm text-gray-500 mt-1">Enter your password to view analytics</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="input-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input-field text-lg"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
              {error && (
                <div className="mt-3 flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-blue w-full btn-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    )
  }

  const paymentData = [
    { name: 'UPI', value: todayStats.upi },
    { name: 'Cash', value: todayStats.cash },
    { name: 'Credit', value: todayStats.credit },
    { name: 'Cheque', value: todayStats.cheque }
  ].filter(d => d.value > 0)

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard</h2>
          <p className="subtitle">Overview of today&apos;s business performance</p>
        </div>
        <button className="btn btn-blue btn-sm" onClick={loadData}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Data
        </button>
      </div>

      <div className="p-8 space-y-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <div className="stat-card">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today&apos;s Sales</p>
            <p className="stat-value text-blue-600">{todayStats.total_sales}</p>
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</p>
            <p className="stat-value text-emerald-600">{formatCurrency(todayStats.total_revenue)}</p>
            {uncollectedRevenue > 0 && (
              <p className="text-[10px] font-bold text-amber-600 mt-1">⚠ {formatCurrency(uncollectedRevenue)} yet to receive (credit)</p>
            )}
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Units Sold</p>
            <p className="stat-value text-violet-600">{todayStats.total_units}</p>
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credit Outstanding</p>
            <p className={`stat-value ${outstanding > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{formatCurrency(outstanding)}</p>
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-600 mb-2">Payment Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">UPI</span>
                <span className="font-bold text-blue-600">{formatCurrency(todayStats.upi)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cash</span>
                <span className="font-bold text-emerald-600">{formatCurrency(todayStats.cash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Credit</span>
                <span className="font-bold text-amber-600">{formatCurrency(todayStats.credit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cheque</span>
                <span className="font-bold text-violet-600">{formatCurrency(todayStats.cheque)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Empty Cylinders Card */}
        {pendingEmpties > 0 && (
          <div className="card border-2 border-red-200 bg-red-50">
            <div className="card-header">
              <div>
                <h3 className="text-red-700">⚠️ Pending Empty Cylinders</h3>
                <p className="subtitle" style={{ color: '#b91c1c' }}>{pendingEmpties} empty cylinder(s) not returned by customers</p>
              </div>
            </div>
          </div>
        )}

        {/* Customer Debtors Table */}
        {debtors.length > 0 && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>Customer Debtors</h3>
                <p className="subtitle">{debtors.length} customer{debtors.length !== 1 ? 's' : ''} with outstanding balances</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-center">Pending Empties</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d, i) => (
                    <tr key={i}>
                      <td className="font-semibold text-gray-900">{d.customer_name}</td>
                      <td className="text-gray-600">{d.phone || '-'}</td>
                      <td className="text-right font-bold text-red-600">{formatCurrency(d.amount)}</td>
                      <td className="text-center">
                        {d.empties > 0 ? (
                          <span className="badge badge-danger">{d.empties} empty(s)</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Sales Trend */}
          <div className="xl:col-span-2 card">
            <div className="card-header">
              <div>
                <h3>Sales Trend</h3>
                <p className="subtitle">Revenue over the last 14 days</p>
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickMargin={10} />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `₹${(v/100).toFixed(0)}`} tickMargin={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      color: '#1e293b',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      padding: '8px 12px'
                    }}
                    labelStyle={{ color: '#94a3b8', fontWeight: '600' }}
                    formatter={(value: number) => [`₹${(value / 100).toFixed(2)}`, 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#ffffff' }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px' }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="title">No sales data</p>
              </div>
            )}
          </div>

          {/* Payment Distribution - Today */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3>Payment Mix</h3>
                <p className="subtitle">Today&apos;s payment methods</p>
              </div>
            </div>
            {paymentData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {paymentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`₹${(value/100).toFixed(2)}`, 'Amount']}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        color: '#1e293b',
                        fontSize: '13px',
                        fontWeight: '500',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {paymentData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span>{entry.name}</span>
                      <span className="text-gray-400 font-normal">₹{(entry.value/100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '20px' }}>
                <p className="text-gray-500 text-sm">No payment data today</p>
              </div>
            )}
          </div>
        </div>

        {/* All-time Payment Pie Chart */}
        {allPayments.length > 0 && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>All-Time Payment Distribution</h3>
                <p className="subtitle">Breakdown of all payments collected</p>
              </div>
              {outstanding > 0 && (
                <span className="badge badge-danger animate-pulse">₹{formatCurrency(outstanding)} outstanding credit</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={allPayments}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {allPayments.map((entry, index) => {
                      const colorIndex = ['UPI', 'Cash', 'Credit', 'Cheque'].indexOf(entry.name)
                      const fill = COLORS[colorIndex >= 0 ? colorIndex : index % COLORS.length]
                      return <Cell key={`cell-${index}`} fill={fill} />
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`₹${(value/100).toFixed(2)}`, 'Amount']}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      color: '#1e293b',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-4">
                {allPayments
                  .sort((a, b) => b.value - a.value)
                  .map((entry) => {
                    const idx = ['UPI', 'Cash', 'Credit', 'Cheque'].indexOf(entry.name)
                    const color = COLORS[idx >= 0 ? idx : COLORS.length - 1]
                    const pct = allPayments.reduce((s, e) => s + e.value, 0) > 0
                      ? ((entry.value / allPayments.reduce((s, e) => s + e.value, 0)) * 100).toFixed(1)
                      : 0
                    return (
                      <div key={entry.name} className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                        <span className="text-sm font-semibold text-gray-700 flex-1">{entry.name}</span>
                        <span className="text-sm font-mono font-bold text-gray-900">₹{(entry.value / 100).toFixed(0)}</span>
                        <span className="text-xs text-gray-400 w-12 text-right">{pct}%</span>
                        {entry.name === 'Credit' && outstanding > 0 && (
                          <span className="badge badge-danger text-[10px]">₹{formatCurrency(outstanding)} owed</span>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Low Stock Alerts */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3><svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>Low Stock Alerts</h3>
                <p className="subtitle">Items below minimum threshold</p>
              </div>
              {lowStock.length > 0 && (
                <span className="badge badge-danger">{lowStock.length} items</span>
              )}
            </div>
            {lowStock.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">Current Stock</th>
                      <th className="text-right">Minimum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((item: any) => (
                      <tr key={item.name}>
                        <td className="text-primary">{item.name}</td>
                        <td className="text-right">
                          <span className="text-red-600 font-bold text-lg">{item.stock_count}</span>
                        </td>
                        <td className="text-right text-gray-500 font-medium">{item.low_stock_threshold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px' }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="title">All stock levels healthy</p>
              </div>
            )}
          </div>

          {/* Weekly Summary */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3><svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Weekly Performance</h3>
                <p className="subtitle">Last 7 days of sales activity</p>
              </div>
            </div>
            <div className="space-y-4">
              {chartData.slice(-7).map((day: any) => (
                <div key={day.date} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-700">{day.date}</div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-gray-400 font-semibold">Sales</div>
                      <div className="font-bold text-gray-900">{day.num_sales}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 font-semibold">Revenue</div>
                      <div className="font-bold text-emerald-600 text-base">₹{(day.revenue/100).toFixed(0)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {chartData.length === 0 && (
                <div className="empty-state" style={{ padding: '30px' }}>
                  <p className="text-gray-500 text-sm">No sales data for last 7 days</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
