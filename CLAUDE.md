# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HP Gas Agency POS** — an Electron desktop application for LPG gas agency management. Built with electron-vite, React 18, TypeScript, Tailwind CSS, Zustand for state management, and better-sqlite3 for local database storage.

## Architecture

```
src/
  main/                 # Electron main process
    index.ts            # IPC handlers: db CRUD, CSV export, print/PDF, backup/restore
    database.ts         # better-sqlite3 setup, migrations, backup logic
    schema.sql          # Full database schema (15+ tables)
  preload/
    index.ts            # contextBridge exposing window.api for renderer
  renderer/             # React frontend
    App.tsx             # HashRouter routes, keyboard shortcuts (F1-F5, Ctrl+Shift+L)
    store/
      sales.ts          # SaleStore: cart, customer, payments, split billing
      app.ts            # Toast notification system
    pages/              # Feature pages: POS, Dashboard, Transactions, Inventory, Credit, Bookings, etc.
    components/         # Shared UI: BillPreview, ConfirmDialog, NumericKeypad, Sidebar, ToastContainer
    utils/              # formatters.ts, constants.ts, types.ts
```

Key architectural decisions:
- **Process separation**: All database queries go through IPC (`window.api.dbRun/dbGet/dbAll`) — never access sqlite3 directly from renderer.
- **Currency**: All monetary values stored in **paise** (integers). Divide by 100 for display.
- **State**: `useSaleStore` (Zustand) manages the sale cart cycle; `useAppStore` handles toasts.
- **Schema-driven DB**: `schema.sql` defines all tables. `database.ts` runs migrations on startup via `USE TABLE IF NOT EXISTS`.
- **Backups**: Automatic daily backup on app launch, retains last 7 days.

## Key Commands

```bash
npm run dev       # Start Electron in dev mode (electron-vite dev)
npm run build     # Production build (electron-vite build)
npm run preview   # Preview production build (electron-vite preview)
```

## Database Schema

Tables: `settings`, `godown_products`, `godown_stock`, `shop_products`, `shop_cylinder_stock`, `customers`, `sales`, `sale_items`, `sale_payments`, `credit_ledger`, `credit_payments`, `audit_log`, `bill_counter`, `bookings`, `delivery_challans`, `cylinder_register`, `service_log`, `shortage_reports`, `supplier_ledger`.

## Keyboard Shortcuts

- `F1` → POS, `F2` → Godown (Inventory), `F3` → Shop, `F4` → Dashboard, `F5` → Transactions
- `Ctrl+Shift+L` → Open Audit Log
