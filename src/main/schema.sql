-- Enable WAL mode for better concurrent read/write performance
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS godown_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN ('Domestic','Commercial','FTL','Other')),
    size_weight TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'cylinder',
    description TEXT DEFAULT '',
    default_price_paise INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS godown_stock (
    product_id INTEGER PRIMARY KEY REFERENCES godown_products(id),
    full_count INTEGER NOT NULL DEFAULT 0,
    empty_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shop_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN ('Accessories','Spares','Other')),
    unit TEXT NOT NULL DEFAULT 'piece',
    stock_count INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    price_paise INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_cylinder_stock (
    product_id INTEGER PRIMARY KEY REFERENCES godown_products(id),
    full_count INTEGER NOT NULL DEFAULT 0,
    empty_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    consumer_number TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    total_visits INTEGER NOT NULL DEFAULT 0,
    last_seen TEXT DEFAULT (datetime('now')),
    UNIQUE(name, consumer_number)
);

CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL DEFAULT (date('now')),
    customer_name TEXT NOT NULL DEFAULT 'Walk-in',
    consumer_number TEXT DEFAULT '',
    otp TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    sale_type TEXT NOT NULL CHECK(sale_type IN ('Refill','New Connection','Counter Sale')),
    empty_received TEXT NOT NULL DEFAULT 'No' CHECK(empty_received IN ('Yes','No','Partial')),
    empty_count_received INTEGER NOT NULL DEFAULT 0,
    total_paise INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    product_type TEXT NOT NULL CHECK(product_type IN ('cylinder','accessory')),
    qty INTEGER NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    total_paise INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK(method IN ('UPI','Cash','Credit','Cheque')),
    amount_paise INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    sale_id INTEGER REFERENCES sales(id),
    original_paise INTEGER NOT NULL,
    paid_paise INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Outstanding' CHECK(status IN ('Outstanding','Partial','Closed')),
    created_at TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS credit_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_id INTEGER NOT NULL REFERENCES credit_ledger(id),
    amount_paise INTEGER NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('UPI','Cash','Cheque')),
    date TEXT NOT NULL DEFAULT (date('now')),
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    event_type TEXT NOT NULL,
    entity TEXT NOT NULL,
    action_description TEXT NOT NULL,
    before_value TEXT DEFAULT '',
    after_value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bill_counter (
    id INTEGER PRIMARY KEY CHECK(id=1),
    prefix TEXT NOT NULL DEFAULT 'BILL',
    next_number INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consumer_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    booking_date TEXT NOT NULL DEFAULT (date('now')),
    otp TEXT NOT NULL,
    product_id INTEGER REFERENCES godown_products(id),
    delivered INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    sale_id INTEGER REFERENCES sales(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS delivery_challans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challan_number TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL DEFAULT (date('now')),
    customer_name TEXT NOT NULL,
    address TEXT DEFAULT '',
    items TEXT NOT NULL,
    total_paise INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Delivered','Cancelled')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cylinder_register (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES godown_products(id),
    serial_number TEXT DEFAULT '',
    action TEXT NOT NULL CHECK(action IN ('received_full','sent_empty','sent_to_plant','received_from_plant','sent_to_shop','received_from_shop','sale')),
    location_from TEXT NOT NULL,
    location_to TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    reason TEXT DEFAULT '',
    reference_id TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS service_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    item_type TEXT NOT NULL,
    issue_description TEXT NOT NULL,
    charge_paise INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Completed','Rejected')),
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refund_number TEXT NOT NULL UNIQUE,
    original_sale_id INTEGER NOT NULL REFERENCES sales(id),
    original_bill_number TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT 'Walk-in',
    reason TEXT NOT NULL,
    reason_code TEXT NOT NULL CHECK(reason_code IN ('wrong_product','overcharged','cancelled','duplicate','quality','other')),
    items TEXT NOT NULL,
    refund_amount_paise INTEGER NOT NULL,
    refund_method TEXT NOT NULL CHECK(refund_method IN ('UPI','Cash','Cheque','Original')),
    status TEXT NOT NULL DEFAULT 'Completed' CHECK(status IN ('Completed','Pending')),
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_date ON refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_sale ON refunds(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_refunds_bill ON refunds(original_bill_number);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

CREATE TABLE IF NOT EXISTS shortage_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES godown_products(id),
    quantity INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Damaged','Short')),
    reason TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT (date('now')),
    reference TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS supplier_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL DEFAULT (date('now')),
    action TEXT NOT NULL CHECK(action IN ('sent_to_plant','received_from_plant')),
    product_id INTEGER REFERENCES godown_products(id),
    quantity INTEGER NOT NULL,
    balance_at_plant INTEGER
    reference TEXT DEFAULT ''
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_bill ON sales(bill_number);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_credit_status ON credit_ledger(status);
CREATE INDEX IF NOT EXISTS idx_bookings_delivered ON bookings(delivered);
CREATE INDEX IF NOT EXISTS idx_challans_date ON delivery_challans(date);
CREATE INDEX IF NOT EXISTS idx_service_status ON service_log(status);
CREATE INDEX IF NOT EXISTS idx_register_timestamp ON cylinder_register(timestamp);
