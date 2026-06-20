export const SALE_TYPES = ['Refill', 'New Connection', 'Counter Sale'] as const
export const PAYMENT_METHODS = ['UPI', 'Cash', 'Credit', 'Cheque'] as const
export const CREDIT_PAYMENT_METHODS = ['UPI', 'Cash', 'Cheque'] as const
export const GODOWN_PRODUCT_CATEGORIES = ['Domestic', 'Commercial', 'FTL', 'Other'] as const
export const SHOP_PRODUCT_CATEGORIES = ['Accessories', 'Spares', 'Other'] as const
export const EMPTY_RECEIVE_OPTIONS = ['Yes', 'No', 'Partial'] as const

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', shortcut: 'F4', group: 'main' },
  { id: 'pos', label: 'POS Sales', shortcut: 'F1', group: 'main' },
  { id: 'transactions', label: 'Transactions', shortcut: 'F5', group: 'main' },
  { id: 'inventory', label: 'Inventory', shortcut: 'F2', group: 'stock' },
  { id: 'inventory-setup', label: 'Inventory Setup', shortcut: '', group: 'stock' },
  { id: 'credit', label: 'Credit Mgmt', shortcut: '', group: 'extra' },
  { id: 'bookings', label: 'Bookings', shortcut: '', group: 'extra' },
  { id: 'challan', label: 'Challans', shortcut: '', group: 'extra' },
  { id: 'cylinder-register', label: 'Cylinder Register', shortcut: '', group: 'extra' },
  { id: 'service-log', label: 'Service Log', shortcut: '', group: 'extra' },
  { id: 'shortages', label: 'Shortage Reports', shortcut: '', group: 'extra' },
  { id: 'supplier-ledger', label: 'Supplier Ledger', shortcut: '', group: 'extra' },
  { id: 'settings', label: 'Settings', shortcut: '', group: 'extra' },
  { id: 'passbook-scanner', label: 'Passbook Scanner', shortcut: '', group: 'extra' },
  { id: 'refunds', label: 'Refunds', shortcut: '', group: 'extra' },
] as const
