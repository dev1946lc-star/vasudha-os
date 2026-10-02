-- User Profiles. The application authenticates with Clerk, whose ids are strings
-- like `user_2abcDEF...`, so this is TEXT rather than a UUID FK to auth.users.
-- Clerk owns identity; this table owns authorisation. See 26_clerk_identity.sql.
--
-- Note: 01_jwt_claims.sql attached a trigger mirroring role/company_id into
-- auth.users.raw_app_meta_data. That is the Supabase Auth mechanism; under Clerk
-- it never fired usefully, and once profiles.id became TEXT it failed every
-- profile write. The working replacement is the clerk_metadata mirror in
-- 26_clerk_identity.sql.
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL,
  role TEXT CHECK (role IN ('owner', 'manager', 'agent', 'accountant')) NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company / Settings
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gst_number TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurants
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  payment_terms_days INT DEFAULT 15,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Catalog
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  hsn_code TEXT,
  price DECIMAL(10,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 5.0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Stock
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Collections (Daily Entry)
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  agent_id TEXT REFERENCES profiles(id) NOT NULL,
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT CHECK (status IN ('draft', 'completed', 'verified')) DEFAULT 'draft',
  notes TEXT,
  total_quantity DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collection Items
CREATE TABLE collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  return_quantity DECIMAL(10,2) DEFAULT 0,
  price_per_unit DECIMAL(10,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  collection_id UUID REFERENCES collections(id),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  status TEXT CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled')) DEFAULT 'unpaid',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  invoice_id UUID REFERENCES invoices(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_mode TEXT CHECK (payment_mode IN ('cash', 'bank_transfer', 'upi', 'cheque')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
