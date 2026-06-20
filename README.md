# HP Gas Agency POS

Desktop point-of-sale application for an LPG gas agency (HP / Indane / Bharat style). Local-only, single-counter, single-user. Tuned for the realities of a small-town distributor: cylinder refills with subsidized pricing, empty-cylinder returns, plant reconciliation, advance bookings via passbook OCR, and handwritten-style credit ledgers.

## Stack

- **Electron** (main process, IPC bridge)
- **electron-vite** build/dev
- **React 18** + **TypeScript** + **React Router v7** (HashRouter)
- **Tailwind CSS** for styling
- **Zustand** for renderer state (`useSaleStore`, `useAppStore`)
- **better-sqlite3** for local persistence (WAL mode, schema-driven migrations)
- **tesseract.js** for passbook OCR
- **papaparse** for CSV export
- **Recharts** for dashboard charts
- Native print / PDF via Electron `webContents.print*`

## Getting started

```bash
npm install
npm run dev      # launches Electron with hot reload
npm run build    # production build to ./out
npm run preview  # preview built app
```

> First launch creates `~/.config/hp-pos/` (Linux/macOS) or `%APPDATA%/hp-pos/` (Windows) and seeds an empty database with the default agency settings.

Default dashboard password: **`khevji`** (seeded into `settings` table on first run — change via Settings page).

## Keyboard shortcuts

| Key            | Action                |
| -------------- | --------------------- |
| `F1`           | POS                   |
| `F2`           | Godown (inventory)    |
| `F3`           | Shop (inventory)      |
| `F4`           | Dashboard             |
| `F5`           | Transactions          |
| `Ctrl + Shift + L` | Open Audit Log    |
| `Ctrl + V` (Passbook Scanner) | Paste image |

## Architecture

```
src/
  main/                 # Node / Electron main process
    index.ts            # IPC handlers (db CRUD, CSV export, print/PDF, backup/restore)
    database.ts         # better-sqlite3 setup, migrations, backup logic
    http-server.ts      # localhost OCR endpoint
    passbook-ocr.ts     # tesseract.js worker
    passbook-parser.ts  # passbook text → bookings
    schema.sql          # full database schema
  preload/
    index.ts            # contextBridge exposes window.api
  renderer/             # React frontend
    App.tsx             # Routes + keyboard shortcuts
    pages/              # POS, Dashboard, Inventory, Transactions, Credit, Bookings, …
    components/         # Sidebar, ToastContainer, BillPreview, ConfirmDialog, NumericKeypad, AuditLog
    store/              # Zustand stores (sales, app)
    utils/              # constants, formatters, types
```

### Hard rules

1. **Currency:** all monetary values stored in **paise** (integers). Divide by 100 for display. See `src/renderer/utils/formatters.ts`.
2. **Process separation:** the renderer **never** touches sqlite3 directly. All DB calls go through `window.api.dbRun / dbGet / dbAll` (the preload index exposes them).
3. **Schema-led migrations:** every table is created with `CREATE TABLE IF NOT EXISTS` from `schema.sql` at startup.
4. **Backups:** automatic daily backup on app launch, retains the last 7 days.

### Two-number stock model

Cylinders are tracked by **(full_count, empty_count)** in both `godown_stock` and `shop_cylinder_stock`. Every movement writes a row to `cylinder_register` (action + location_from/to + qty + ts). The order/stock never drifts because both counters update atomically — this is the core invariant.

## Operations supported

- **POS** — refill / new connection / counter sale, multi-payment, walk-in customers, OTP-based booking lookup.
- **Inventory** — godown ↔ shop transfers, plant reconciliation, accessory sale tracking.
- **Bookings & Passbook Scanner** — OCR import of paper passbook leaves; OTP-based delivery tracking.
- **Delivery Challan** — driver manifest printing.
- **Credit Ledger** — auto-credit on underpaid sale; settlement view; CSV export.
- **Refunds** — partial-refund lookup by bill number; reason-coded refund rows.
- **Service Log** — post-sale regulator/stove service jobs.
- **Cylinder Register, Supplier Ledger, Shortage Reports** — operator compliance reports.
- **Transactions** — sales history with filters; CSV export.
- **Audit Log** — entity-level event history; filters by event/date/search.
- **Settings** — agency info, bill prefix/footer, live price updates, dashboard password.

## Domain notes

This POS is tuned for an LPG agency. The UI labels and workflows reflect operator vocabulary:

- "Receive Empty" — accept empties from customer before giving a full
- "Plant Load" — empties leaving the agency for the refinery
- "Mark Delivered" — flag a booking as fulfilled
- "Pending Empties" — subset of customers who've kept an empty beyond the expected return date
- "Subsidized Price" — the headline cylinder price; the printed bill shows the government subsidy as a deduction line.

Items split into **Cylinders** (godown + shop stock, full/empty counts) and **Accessories** (regulator, pipe, stove, hot plate — flat stock, no empty counterpart).

## Conventions

- **Tabs** in components. **Pills** for sale type and payment method.
- **Bill preview** is a slide-over drawer, not a full-screen modal — the operator can keep an eye on the cart while finalizing.
- **Color and density** deliberately split:
  - Cyan tints → Cylinders
  - Violet tints → Accessories
  - Amber → Credit / Pending
  - Emerald → Success, Slate → Surface

## Backups

Daily backup runs automatically on launch (`src/main/index.ts`). Backups live next to the SQLite file (`*.db-*` timestamped copies). Last 7 are kept.

To restore, locate the latest `*.db-YYYY-MM-DDTHH-…` file (manual today — a UI is planned), quit the app, replace the live DB, and relaunch.

## License

Private. Not published.
