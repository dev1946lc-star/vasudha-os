# VASUDHA OS — Database Schema

<p align="center">
  <strong>SQL Schemas, RLS Policies & Database Optimization</strong><br/>
  <em>Production-ready DDL for Supabase PostgreSQL</em>
</p>

---

## Table of Contents

- [Schema Overview](#schema-overview)
- [DDL — Core Tables](#ddl--core-tables)
- [DDL — Supporting Tables](#ddl--supporting-tables)
- [Indexes](#indexes)
- [Views](#views)
- [Supabase RLS Policies](#supabase-rls-policies)
- [Seed Data](#seed-data)
- [Query Patterns](#query-patterns)
- [PostgreSQL-Specific Considerations](#postgresql-specific-considerations)
- [Performance Optimization](#performance-optimization)
- [Backup Strategy](#backup-strategy)

---

## Schema Overview

### Schema Version History

| Version | Description | Date |
|---------|-------------|------|
| 1 | Initial schema — core tables | v1.0 |
| 2 | Add areas, routes, tax_rates | v1.0 |
| 3 | Add stock_adjustments, route_restaurants | v1.0 |
| 4 | Add employees, attendance, expenses | v1.5 |
| 5 | Add vehicles, fuel_entries, maintenance | v1.5 |
| 6 | Add sync_queue, audit_log | v2.0 |

### Table Count by Version

| Version | New Tables | Total Tables |
|---------|-----------|-------------|
| v1.0 | 14 | 14 |
| v1.5 | 7 | 21 |
| v2.0 | 4 | 25 |

---

## DDL — Core Tables

### companies

```sql
CREATE TABLE companies (
    id                      TEXT PRIMARY KEY NOT NULL,
    name                    TEXT NOT NULL,
    legal_name              TEXT,
    owner_name              TEXT NOT NULL,
    mobile                  TEXT NOT NULL UNIQUE,
    alt_mobile              TEXT,
    email                   TEXT,
    address_line1           TEXT NOT NULL,
    address_line2           TEXT,
    city                    TEXT NOT NULL,
    state                   TEXT NOT NULL,
    pincode                 TEXT NOT NULL,
    gstin                   TEXT UNIQUE,
    pan                     TEXT,
    fssai_number            TEXT,
    logo_path               TEXT,
    invoice_prefix          TEXT NOT NULL DEFAULT 'INV',
    invoice_counter         INTEGER NOT NULL DEFAULT 1,
    financial_year_start    INTEGER NOT NULL DEFAULT 4,
    currency                TEXT NOT NULL DEFAULT 'INR',
    default_payment_cycle   TEXT NOT NULL DEFAULT 'monthly',
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### users

```sql
CREATE TABLE users (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name                TEXT NOT NULL,
    mobile              TEXT NOT NULL UNIQUE,
    email               TEXT,
    pin_hash            TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN ('owner','manager','agent','driver','accountant','viewer')),
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','locked')),
    avatar_path         TEXT,
    last_login_at       TEXT,
    login_attempts      INTEGER NOT NULL DEFAULT 0,
    locked_until        TEXT,
    permissions         TEXT, -- JSON
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    created_by          TEXT REFERENCES users(id),
    deleted_at          TEXT
);
```

### restaurants

```sql
CREATE TABLE restaurants (
    id                      TEXT PRIMARY KEY NOT NULL,
    company_id              TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name                    TEXT NOT NULL,
    owner_name              TEXT,
    contact_person          TEXT,
    mobile                  TEXT NOT NULL,
    alt_mobile              TEXT,
    email                   TEXT,
    address                 TEXT NOT NULL,
    landmark                TEXT,
    area_id                 TEXT REFERENCES areas(id),
    latitude                REAL,
    longitude               REAL,
    gstin                   TEXT,
    fssai_number            TEXT,
    payment_cycle           TEXT NOT NULL DEFAULT 'monthly'
                            CHECK (payment_cycle IN ('weekly','biweekly','monthly','custom')),
    credit_limit            REAL NOT NULL DEFAULT 0,
    credit_days             INTEGER NOT NULL DEFAULT 30,
    opening_balance         REAL NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','inactive','suspended','blacklisted')),
    type                    TEXT NOT NULL DEFAULT 'restaurant'
                            CHECK (type IN ('restaurant','hotel','hospital','caterer','canteen','shop','other')),
    priority                TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('high','normal','low')),
    notes                   TEXT,
    tags                    TEXT, -- JSON array
    delivery_instructions   TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    created_by              TEXT REFERENCES users(id),
    deleted_at              TEXT
);
```

### products

```sql
CREATE TABLE products (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name                TEXT NOT NULL,
    sku                 TEXT,
    description         TEXT,
    unit                TEXT NOT NULL CHECK (unit IN ('can','liter','kg','packet','bottle','crate','piece')),
    unit_price          REAL NOT NULL CHECK (unit_price >= 0),
    purchase_price      REAL CHECK (purchase_price >= 0),
    tax_rate_id         TEXT REFERENCES tax_rates(id),
    hsn_code            TEXT,
    category            TEXT,
    min_stock_level     REAL NOT NULL DEFAULT 0,
    max_stock_level     REAL,
    is_returnable       INTEGER NOT NULL DEFAULT 1,
    is_active           INTEGER NOT NULL DEFAULT 1,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    image_path          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at          TEXT,
    UNIQUE(company_id, sku)
);
```

### collections

```sql
CREATE TABLE collections (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    restaurant_id       TEXT NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    collected_by        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    route_id            TEXT REFERENCES routes(id),
    collection_date     TEXT NOT NULL, -- ISO 8601 date (YYYY-MM-DD)
    collection_number   TEXT NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in_progress','completed','verified','cancelled','not_available')),
    total_amount        REAL NOT NULL DEFAULT 0,
    return_amount       REAL NOT NULL DEFAULT 0,
    net_amount          REAL NOT NULL DEFAULT 0,
    notes               TEXT,
    started_at          TEXT,
    completed_at        TEXT,
    verified_by         TEXT REFERENCES users(id),
    verified_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at          TEXT
);
```

### collection_items

```sql
CREATE TABLE collection_items (
    id                  TEXT PRIMARY KEY NOT NULL,
    collection_id       TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity            REAL NOT NULL CHECK (quantity > 0),
    unit_price          REAL NOT NULL CHECK (unit_price >= 0),
    amount              REAL NOT NULL,
    returned_quantity   REAL NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
    return_reason       TEXT,
    net_quantity        REAL NOT NULL,
    net_amount          REAL NOT NULL,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (returned_quantity <= quantity)
);
```

### bills

```sql
CREATE TABLE bills (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    restaurant_id       TEXT NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    bill_number         TEXT NOT NULL UNIQUE,
    bill_date           TEXT NOT NULL,
    due_date            TEXT NOT NULL,
    period_start        TEXT NOT NULL,
    period_end          TEXT NOT NULL,
    subtotal            REAL NOT NULL,
    tax_amount          REAL NOT NULL,
    cgst_amount         REAL NOT NULL DEFAULT 0,
    sgst_amount         REAL NOT NULL DEFAULT 0,
    igst_amount         REAL NOT NULL DEFAULT 0,
    discount_amount     REAL NOT NULL DEFAULT 0,
    round_off           REAL NOT NULL DEFAULT 0,
    total_amount        REAL NOT NULL,
    paid_amount         REAL NOT NULL DEFAULT 0,
    balance_amount      REAL NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','approved','sent','partially_paid','paid','overdue','cancelled')),
    notes               TEXT,
    terms               TEXT,
    pdf_path            TEXT,
    generated_by        TEXT NOT NULL REFERENCES users(id),
    approved_by         TEXT REFERENCES users(id),
    approved_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at          TEXT,
    CHECK (period_end >= period_start),
    CHECK (due_date >= bill_date),
    CHECK (total_amount >= 0),
    CHECK (paid_amount >= 0),
    CHECK (balance_amount >= 0)
);
```

### bill_items

```sql
CREATE TABLE bill_items (
    id                  TEXT PRIMARY KEY NOT NULL,
    bill_id             TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    collection_item_id  TEXT REFERENCES collection_items(id),
    description         TEXT NOT NULL,
    hsn_code            TEXT,
    quantity            REAL NOT NULL CHECK (quantity > 0),
    unit                TEXT NOT NULL,
    unit_price          REAL NOT NULL CHECK (unit_price >= 0),
    amount              REAL NOT NULL,
    tax_rate            REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    cgst_rate           REAL NOT NULL DEFAULT 0,
    sgst_rate           REAL NOT NULL DEFAULT 0,
    igst_rate           REAL NOT NULL DEFAULT 0,
    tax_amount          REAL NOT NULL DEFAULT 0,
    total_amount        REAL NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### payments

```sql
CREATE TABLE payments (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    restaurant_id       TEXT NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    bill_id             TEXT REFERENCES bills(id),
    payment_number      TEXT NOT NULL UNIQUE,
    payment_date        TEXT NOT NULL,
    amount              REAL NOT NULL CHECK (amount > 0),
    payment_mode        TEXT NOT NULL
                        CHECK (payment_mode IN ('cash','upi','bank_transfer','cheque','credit_note','other')),
    reference_number    TEXT,
    bank_name           TEXT,
    notes               TEXT,
    receipt_path        TEXT,
    is_advance          INTEGER NOT NULL DEFAULT 0,
    recorded_by         TEXT NOT NULL REFERENCES users(id),
    verified_by         TEXT REFERENCES users(id),
    verified_at         TEXT,
    status              TEXT NOT NULL DEFAULT 'recorded'
                        CHECK (status IN ('recorded','deposited','cleared','bounced','verified','cancelled')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at          TEXT
);
```

### stock_entries

```sql
CREATE TABLE stock_entries (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    entry_date          TEXT NOT NULL,
    entry_type          TEXT NOT NULL
                        CHECK (entry_type IN ('purchase','return_from_customer','opening_stock','transfer_in')),
    quantity            REAL NOT NULL CHECK (quantity > 0),
    unit_cost           REAL CHECK (unit_cost >= 0),
    total_cost          REAL CHECK (total_cost >= 0),
    supplier_name       TEXT,
    batch_number        TEXT,
    expiry_date         TEXT,
    invoice_number      TEXT,
    notes               TEXT,
    recorded_by         TEXT NOT NULL REFERENCES users(id),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at          TEXT
);
```

### stock_adjustments

```sql
CREATE TABLE stock_adjustments (
    id                  TEXT PRIMARY KEY NOT NULL,
    company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    adjustment_date     TEXT NOT NULL,
    adjustment_type     TEXT NOT NULL
                        CHECK (adjustment_type IN ('wastage','damage','expired','counting_correction','other')),
    quantity            REAL NOT NULL, -- Can be negative
    reason              TEXT NOT NULL,
    notes               TEXT,
    adjusted_by         TEXT NOT NULL REFERENCES users(id),
    approved_by         TEXT REFERENCES users(id),
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## DDL — Supporting Tables

### areas

```sql
CREATE TABLE areas (
    id              TEXT PRIMARY KEY NOT NULL,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### routes

```sql
CREATE TABLE routes (
    id                          TEXT PRIMARY KEY NOT NULL,
    company_id                  TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name                        TEXT NOT NULL,
    area_id                     TEXT REFERENCES areas(id),
    assigned_to                 TEXT REFERENCES users(id),
    restaurant_count            INTEGER NOT NULL DEFAULT 0,
    estimated_time_minutes      INTEGER,
    is_active                   INTEGER NOT NULL DEFAULT 1,
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### route_restaurants (Join Table)

```sql
CREATE TABLE route_restaurants (
    id              TEXT PRIMARY KEY NOT NULL,
    route_id        TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    sequence_order  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(route_id, restaurant_id)
);
```

### tax_rates

```sql
CREATE TABLE tax_rates (
    id              TEXT PRIMARY KEY NOT NULL,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    rate            REAL NOT NULL CHECK (rate >= 0 AND rate <= 100),
    cgst_rate       REAL NOT NULL DEFAULT 0,
    sgst_rate       REAL NOT NULL DEFAULT 0,
    igst_rate       REAL NOT NULL DEFAULT 0,
    is_default      INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    effective_from  TEXT NOT NULL,
    effective_to    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### app_settings

```sql
CREATE TABLE app_settings (
    key             TEXT PRIMARY KEY NOT NULL,
    value           TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'string'
                    CHECK (type IN ('string','integer','boolean','json')),
    description     TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Indexes

```sql
-- ==========================================
-- RESTAURANT INDEXES
-- ==========================================
CREATE INDEX idx_restaurants_company
    ON restaurants(company_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_restaurants_area
    ON restaurants(area_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_restaurants_status
    ON restaurants(company_id, status) WHERE deleted_at IS NULL;

CREATE INDEX idx_restaurants_name
    ON restaurants(name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE INDEX idx_restaurants_mobile
    ON restaurants(mobile);

-- ==========================================
-- COLLECTION INDEXES
-- ==========================================
CREATE INDEX idx_collections_date
    ON collections(company_id, collection_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_collections_restaurant_date
    ON collections(restaurant_id, collection_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_collections_agent_date
    ON collections(collected_by, collection_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_collections_status
    ON collections(status, collection_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_collections_route
    ON collections(route_id, collection_date) WHERE deleted_at IS NULL;

-- ==========================================
-- COLLECTION ITEMS INDEXES
-- ==========================================
CREATE INDEX idx_collection_items_collection
    ON collection_items(collection_id);

CREATE INDEX idx_collection_items_product
    ON collection_items(product_id);

-- ==========================================
-- BILL INDEXES
-- ==========================================
CREATE INDEX idx_bills_restaurant
    ON bills(restaurant_id, bill_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_bills_date
    ON bills(company_id, bill_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_bills_status
    ON bills(status, due_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_bills_overdue
    ON bills(due_date) WHERE status IN ('sent', 'partially_paid') AND deleted_at IS NULL;

-- ==========================================
-- PAYMENT INDEXES
-- ==========================================
CREATE INDEX idx_payments_restaurant
    ON payments(restaurant_id, payment_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_payments_bill
    ON payments(bill_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_payments_date
    ON payments(company_id, payment_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_payments_mode
    ON payments(payment_mode, payment_date) WHERE deleted_at IS NULL;

-- ==========================================
-- STOCK INDEXES
-- ==========================================
CREATE INDEX idx_stock_entries_product
    ON stock_entries(product_id, entry_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_stock_entries_date
    ON stock_entries(company_id, entry_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_stock_adjustments_product
    ON stock_adjustments(product_id, adjustment_date);
```

---

## Views

### v_restaurant_outstanding

```sql
CREATE VIEW v_restaurant_outstanding AS
SELECT
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.area_id,
    COALESCE(r.opening_balance, 0)
        + COALESCE(bill_totals.total_billed, 0)
        - COALESCE(payment_totals.total_paid, 0) AS outstanding_balance,
    COALESCE(bill_totals.total_billed, 0) AS total_billed,
    COALESCE(payment_totals.total_paid, 0) AS total_paid,
    bill_totals.last_bill_date,
    payment_totals.last_payment_date
FROM restaurants r
LEFT JOIN (
    SELECT
        restaurant_id,
        SUM(total_amount) AS total_billed,
        MAX(bill_date) AS last_bill_date
    FROM bills
    WHERE status NOT IN ('draft', 'cancelled')
      AND deleted_at IS NULL
    GROUP BY restaurant_id
) bill_totals ON r.id = bill_totals.restaurant_id
LEFT JOIN (
    SELECT
        restaurant_id,
        SUM(amount) AS total_paid,
        MAX(payment_date) AS last_payment_date
    FROM payments
    WHERE status NOT IN ('bounced', 'cancelled')
      AND deleted_at IS NULL
    GROUP BY restaurant_id
) payment_totals ON r.id = payment_totals.restaurant_id
WHERE r.deleted_at IS NULL;
```

### v_current_stock

```sql
CREATE VIEW v_current_stock AS
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.unit,
    p.min_stock_level,
    COALESCE(stock_in.total_in, 0)
        - COALESCE(stock_out.total_out, 0)
        + COALESCE(adjustments.net_adjustment, 0) AS current_stock,
    CASE
        WHEN (COALESCE(stock_in.total_in, 0)
              - COALESCE(stock_out.total_out, 0)
              + COALESCE(adjustments.net_adjustment, 0)) <= p.min_stock_level
        THEN 1
        ELSE 0
    END AS is_low_stock
FROM products p
LEFT JOIN (
    SELECT product_id, SUM(quantity) AS total_in
    FROM stock_entries WHERE deleted_at IS NULL
    GROUP BY product_id
) stock_in ON p.id = stock_in.product_id
LEFT JOIN (
    SELECT product_id, SUM(net_quantity) AS total_out
    FROM collection_items ci
    INNER JOIN collections c ON ci.collection_id = c.id
    WHERE c.status NOT IN ('cancelled') AND c.deleted_at IS NULL
    GROUP BY product_id
) stock_out ON p.id = stock_out.product_id
LEFT JOIN (
    SELECT product_id, SUM(quantity) AS net_adjustment
    FROM stock_adjustments
    GROUP BY product_id
) adjustments ON p.id = adjustments.product_id
WHERE p.deleted_at IS NULL AND p.is_active = 1;
```

### v_daily_summary

```sql
CREATE VIEW v_daily_summary AS
SELECT
    c.collection_date AS report_date,
    c.company_id,
    COUNT(DISTINCT c.id) AS total_collections,
    COUNT(DISTINCT c.restaurant_id) AS restaurants_served,
    SUM(c.net_amount) AS total_delivery_value,
    SUM(c.return_amount) AS total_return_value,
    COALESCE(payments.cash_collected, 0) AS cash_collected,
    COALESCE(payments.digital_collected, 0) AS digital_collected,
    COALESCE(payments.total_collected, 0) AS total_collected
FROM collections c
LEFT JOIN (
    SELECT
        payment_date,
        company_id,
        SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END) AS cash_collected,
        SUM(CASE WHEN payment_mode != 'cash' THEN amount ELSE 0 END) AS digital_collected,
        SUM(amount) AS total_collected
    FROM payments
    WHERE status NOT IN ('bounced', 'cancelled') AND deleted_at IS NULL
    GROUP BY payment_date, company_id
) payments ON c.collection_date = payments.payment_date
         AND c.company_id = payments.company_id
WHERE c.status NOT IN ('cancelled') AND c.deleted_at IS NULL
GROUP BY c.collection_date, c.company_id;
```

---

## Migration Strategy

### Migration Runner

```dart
class MigrationRunner {
  static const int currentVersion = 3;

  static Future<void> migrate(Database db, int oldVersion, int newVersion) async {
    for (int version = oldVersion + 1; version <= newVersion; version++) {
      switch (version) {
        case 1:
          await MigrationV1.up(db);
          break;
        case 2:
          await MigrationV2.up(db);
          break;
        case 3:
          await MigrationV3.up(db);
          break;
      }
    }
  }
}
```

### Migration Rules

1. **Migrations are forward-only** — no `down()` methods in production
2. **Never modify existing migration files** — create new migrations for changes
3. **Always test migrations** with real-world data volumes
4. **Backup before migration** — auto-backup database before running migrations
5. **Migrations are atomic** — wrap in a transaction; rollback on failure

### Example Migration

```dart
class MigrationV2 {
  static Future<void> up(Database db) async {
    await db.execute('''
      CREATE TABLE areas (
        id          TEXT PRIMARY KEY NOT NULL,
        company_id  TEXT NOT NULL REFERENCES companies(id),
        name        TEXT NOT NULL,
        description TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    ''');

    // Add area_id column to restaurants
    await db.execute('ALTER TABLE restaurants ADD COLUMN area_id TEXT REFERENCES areas(id)');

    // Create index
    await db.execute('CREATE INDEX idx_restaurants_area ON restaurants(area_id) WHERE deleted_at IS NULL');
  }
}
```

---

## Seed Data

### Default Tax Rates

```sql
INSERT INTO tax_rates (id, company_id, name, rate, cgst_rate, sgst_rate, igst_rate, is_default, is_active, effective_from)
VALUES
    ('tax-gst-0',   '{company_id}', 'GST 0% (Exempt)',  0,   0,   0,   0,   0, 1, '2017-07-01'),
    ('tax-gst-5',   '{company_id}', 'GST 5%',           5,   2.5, 2.5, 5,   1, 1, '2017-07-01'),
    ('tax-gst-12',  '{company_id}', 'GST 12%',          12,  6,   6,   12,  0, 1, '2017-07-01'),
    ('tax-gst-18',  '{company_id}', 'GST 18%',          18,  9,   9,   18,  0, 1, '2017-07-01'),
    ('tax-gst-28',  '{company_id}', 'GST 28%',          28,  14,  14,  28,  0, 1, '2017-07-01');
```

### Default App Settings

```sql
INSERT INTO app_settings (key, value, type, description) VALUES
    ('app.version', '1.0.0', 'string', 'Current app version'),
    ('app.db_version', '3', 'integer', 'Current database schema version'),
    ('app.theme', 'light', 'string', 'UI theme (light/dark)'),
    ('app.language', 'en', 'string', 'UI language'),
    ('app.date_format', 'dd/MM/yyyy', 'string', 'Date display format'),
    ('app.currency_symbol', '₹', 'string', 'Currency display symbol'),
    ('security.auto_lock_minutes', '5', 'integer', 'Auto-lock timeout'),
    ('security.max_login_attempts', '5', 'integer', 'Max failed login attempts'),
    ('security.lock_duration_minutes', '15', 'integer', 'Account lock duration'),
    ('billing.auto_round_off', '1', 'boolean', 'Round off invoice totals'),
    ('billing.round_off_threshold', '0.50', 'string', 'Max round-off amount'),
    ('inventory.low_stock_alert', '1', 'boolean', 'Enable low stock alerts'),
    ('collection.require_verification', '0', 'boolean', 'Require manager verification'),
    ('backup.auto_backup', '1', 'boolean', 'Enable automatic daily backup'),
    ('backup.retention_days', '30', 'integer', 'Number of backup copies to keep');
```

---

## Query Patterns

### Most Common Queries

#### Today's Collections for Agent

```sql
SELECT c.*, r.name AS restaurant_name, r.address, r.mobile
FROM collections c
INNER JOIN restaurants r ON c.restaurant_id = r.id
WHERE c.collected_by = ?
  AND c.collection_date = date('now')
  AND c.deleted_at IS NULL
ORDER BY c.status, r.name;
```

#### Restaurant Outstanding Balance

```sql
SELECT
    r.id, r.name,
    COALESCE(r.opening_balance, 0) +
    COALESCE(SUM(CASE WHEN b.status NOT IN ('draft','cancelled') THEN b.total_amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN p.status NOT IN ('bounced','cancelled') THEN p.amount ELSE 0 END), 0)
    AS outstanding
FROM restaurants r
LEFT JOIN bills b ON r.id = b.restaurant_id AND b.deleted_at IS NULL
LEFT JOIN payments p ON r.id = p.restaurant_id AND p.deleted_at IS NULL
WHERE r.id = ? AND r.deleted_at IS NULL
GROUP BY r.id;
```

#### Aging Analysis

```sql
SELECT
    r.id, r.name,
    SUM(CASE WHEN julianday('now') - julianday(b.due_date) <= 0 THEN b.balance_amount ELSE 0 END) AS current_due,
    SUM(CASE WHEN julianday('now') - julianday(b.due_date) BETWEEN 1 AND 15 THEN b.balance_amount ELSE 0 END) AS overdue_1_15,
    SUM(CASE WHEN julianday('now') - julianday(b.due_date) BETWEEN 16 AND 30 THEN b.balance_amount ELSE 0 END) AS overdue_16_30,
    SUM(CASE WHEN julianday('now') - julianday(b.due_date) BETWEEN 31 AND 60 THEN b.balance_amount ELSE 0 END) AS overdue_31_60,
    SUM(CASE WHEN julianday('now') - julianday(b.due_date) > 60 THEN b.balance_amount ELSE 0 END) AS overdue_60_plus,
    SUM(b.balance_amount) AS total_outstanding
FROM restaurants r
INNER JOIN bills b ON r.id = b.restaurant_id
WHERE b.balance_amount > 0
  AND b.status NOT IN ('draft', 'cancelled')
  AND b.deleted_at IS NULL
  AND r.deleted_at IS NULL
  AND r.company_id = ?
GROUP BY r.id
ORDER BY total_outstanding DESC;
```

#### GST Report Summary

```sql
SELECT
    bi.hsn_code,
    bi.tax_rate,
    SUM(bi.amount) AS taxable_value,
    SUM(bi.cgst_rate * bi.amount / 100) AS cgst_amount,
    SUM(bi.sgst_rate * bi.amount / 100) AS sgst_amount,
    SUM(bi.igst_rate * bi.amount / 100) AS igst_amount,
    SUM(bi.tax_amount) AS total_tax,
    SUM(bi.total_amount) AS total_value
FROM bill_items bi
INNER JOIN bills b ON bi.bill_id = b.id
WHERE b.bill_date BETWEEN ? AND ?
  AND b.status NOT IN ('draft', 'cancelled')
  AND b.deleted_at IS NULL
  AND b.company_id = ?
GROUP BY bi.hsn_code, bi.tax_rate
ORDER BY bi.hsn_code;
```

---

## SQLite-Specific Considerations

### Data Types

SQLite has a flexible type system. We use TEXT for dates and UUIDs:

| Declared Type | SQLite Affinity | Storage | Notes |
|--------------|----------------|---------|-------|
| TEXT | TEXT | UTF-8 | UUIDs, dates (ISO 8601), enums |
| REAL | REAL | 8-byte float | Decimal amounts (use ROUND for precision) |
| INTEGER | INTEGER | 1–8 bytes | Booleans (0/1), counts, sequences |

### Date Handling

```sql
-- Store dates as ISO 8601 text
'2026-07-06'              -- Date only
'2026-07-06T17:30:00Z'    -- Datetime with timezone

-- Date functions
date('now')               -- Current date
datetime('now')           -- Current datetime
julianday(date1) - julianday(date2)  -- Date difference
```

### Decimal Precision

SQLite REAL is a floating-point type. For financial calculations:

```sql
-- Always round monetary calculations
ROUND(quantity * unit_price, 2) AS amount
ROUND(amount * tax_rate / 100, 2) AS tax_amount

-- For critical financial reports, validate with:
-- ABS(computed - stored) < 0.01
```

### WAL Mode

```sql
-- Enable Write-Ahead Logging for better concurrent read/write performance
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -2000;  -- 2MB cache
PRAGMA foreign_keys = ON;
```

---

## Performance Optimization

### Query Optimization Tips

1. **Use covering indexes** for frequently queried column combinations
2. **Avoid SELECT \*** — specify only needed columns
3. **Use EXISTS instead of IN** for subqueries
4. **Limit result sets** — paginate with `LIMIT ? OFFSET ?`
5. **Pre-compute aggregates** for dashboard using triggers or application logic
6. **EXPLAIN QUERY PLAN** to verify index usage

### Data Archiving (for scale)

```sql
-- Archive collections older than configured period
INSERT INTO collections_archive SELECT * FROM collections
WHERE collection_date < date('now', '-365 days');

DELETE FROM collections
WHERE collection_date < date('now', '-365 days')
  AND status = 'verified';
```

---

## Backup Strategy

### Automatic Backup

```dart
Future<String> createBackup() async {
  final dbPath = await getDatabasesPath();
  final backupDir = await getApplicationDocumentsDirectory();
  final timestamp = DateTime.now().toIso8601String().replaceAll(':', '-');
  final backupPath = '${backupDir.path}/backups/vasudha_$timestamp.db';

  // Close database connections
  await database.close();

  // Copy database file
  File(dbPath).copySync(backupPath);

  // Reopen database
  await database.open();

  return backupPath;
}
```

## Supabase RLS Policies

To secure our data, Row-Level Security (RLS) policies are configured in Supabase. These policies restrict access to rows based on user role and company association.

### Enabling RLS

```sql
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;
```

### Policy Examples

#### 1. Companies (Only matching company users can view/edit)
```sql
CREATE POLICY "Users can view their own company"
    ON companies
    FOR SELECT
    USING (id = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'company_id');

CREATE POLICY "Owners can update their own company"
    ON companies
    FOR UPDATE
    USING (
        id = (auth.jwt() ->> 'user_metadata')::jsonb ->> 'company_id'
        AND (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'owner'
    );
```

#### 2. Restaurants (Access scoped to company_id)
```sql
CREATE POLICY "Allow select on restaurants for same company"
    ON restaurants
    FOR SELECT
    USING (company_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'company_id')::uuid);

CREATE POLICY "Allow insert/update on restaurants for owners/managers"
    ON restaurants
    FOR ALL
    USING (
        company_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'company_id')::uuid
        AND (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('owner', 'manager')
    );
```

---

## PostgreSQL-Specific Considerations

### Data Types

PostgreSQL provides robust, native data types that eliminate the precision limitations of SQLite:

| Declared Type | Storage | Range/Details | Usage |
|--------------|---------|---------------|-------|
| `UUID` | 16 bytes | RFC 4122 compliant | Primary/foreign keys |
| `DECIMAL(12,2)` | Variable | Exact numeric up to 131,072 digits before decimal | Financial amounts |
| `DECIMAL(12,3)` | Variable | Exact numeric | Quantities |
| `TIMESTAMPTZ` | 8 bytes | Date and time with timezone (UTC) | Audited dates, timestamps |
| `BOOLEAN` | 1 byte | TRUE, FALSE, NULL | Active/inactive states |
| `JSONB` | Variable | Binary representation of JSON | Audit logs, settings, metadata |

### Date & Time Operations

We use standard PostgreSQL timezone-aware functions:

```sql
-- Get current timestamp with timezone
NOW()

-- Extract date calculations
NOW() - INTERVAL '7 days'

-- Calculate age in days
EXTRACT(DAY FROM NOW() - due_date)
```

### Decimal Operations

No float rounding issue is present with `DECIMAL` / `NUMERIC` types:

```sql
-- Precise arithmetic without floating point issues
quantity * unit_price AS amount
amount * tax_rate / 100 AS tax_amount
```

---

<p align="center">
  <strong>VASUDHA OS Database Schema</strong> — Built for reliability, optimized for Supabase PostgreSQL. 🗄️
</p>
