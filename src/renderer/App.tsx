import React, { useCallback, useEffect } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ToastContainer from './components/ToastContainer'
import Settings from './pages/Settings'
import InventorySetup from './pages/InventorySetup'
import Inventory from './pages/Inventory'
import POS from './pages/POS'
import Transactions from './pages/Transactions'
import CreditManagement from './pages/CreditManagement'
import Dashboard from './pages/Dashboard'
import BookingRegister from './pages/BookingRegister'
import DeliveryChallan from './pages/DeliveryChallan'
import CylinderRegister from './pages/CylinderRegister'
import ServiceLog from './pages/ServiceLog'
import ShortageReports from './pages/ShortageReports'
import SupplierLedger from './pages/SupplierLedger'
import PassbookScanner from './pages/PassbookScanner'
import Refunds from './pages/Refunds'
import AuditLog from './components/AuditLog'

// Internal component to wire keyboard shortcuts to navigation
function KeyboardRouter() {
  const navigate = useNavigate()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Global: Ctrl+Shift+L for audit log
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('open-audit-log'))
      return
    }

    // Don't intercept when user is typing in inputs
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return

    switch (e.key) {
      case 'F1': e.preventDefault(); navigate('/pos'); break
      case 'F2': e.preventDefault(); navigate('/godown'); break
      case 'F3': e.preventDefault(); navigate('/shop'); break
      case 'F4': e.preventDefault(); navigate('/'); break
      case 'F5': e.preventDefault(); navigate('/transactions'); break
    }
  }, [navigate])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return null
}

function AppLayout() {
  return (
    <div className="flex h-full bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-hidden bg-gray-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory-setup" element={<InventorySetup />} />
          <Route path="/credit" element={<CreditManagement />} />
          <Route path="/bookings" element={<BookingRegister />} />
          <Route path="/challan" element={<DeliveryChallan />} />
          <Route path="/cylinder-register" element={<CylinderRegister />} />
          <Route path="/service-log" element={<ServiceLog />} />
          <Route path="/shortages" element={<ShortageReports />} />
          <Route path="/supplier-ledger" element={<SupplierLedger />} />
          <Route path="/passbook-scanner" element={<PassbookScanner />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <ToastContainer />
      <AuditLog />
      <KeyboardRouter />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  )
}
