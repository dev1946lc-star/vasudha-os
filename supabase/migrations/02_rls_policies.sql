-- 02_rls_policies.sql

-- Helper function to extract company_id from JWT
CREATE OR REPLACE FUNCTION public.get_company_id() RETURNS UUID AS $$
  SELECT (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
$$ LANGUAGE SQL STABLE;

-- Helper function to extract role from JWT
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT AS $$
  SELECT current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'role';
$$ LANGUAGE SQL STABLE;

-- 1. Companies
-- Owners can read and update their own company.
CREATE POLICY "owner_read_company" ON companies FOR SELECT USING (id = public.get_company_id());
CREATE POLICY "owner_update_company" ON companies FOR UPDATE USING (id = public.get_company_id() AND public.get_user_role() = 'owner');

-- 2. Profiles
-- Users can read profiles in their company. Owners can update them.
CREATE POLICY "company_read_profiles" ON profiles FOR SELECT USING (company_id = public.get_company_id());
CREATE POLICY "owner_update_profiles" ON profiles FOR ALL USING (company_id = public.get_company_id() AND public.get_user_role() = 'owner');

-- 3. Restaurants
-- Everyone in the company can read. Owners and Managers can modify.
CREATE POLICY "company_read_restaurants" ON restaurants FOR SELECT USING (company_id = public.get_company_id());
CREATE POLICY "manager_owner_modify_restaurants" ON restaurants FOR ALL USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'manager')
);

-- 4. Inventory & Products
-- Everyone in the company can read. Owners and Managers can modify.
CREATE POLICY "company_read_products" ON products FOR SELECT USING (company_id = public.get_company_id());
CREATE POLICY "manager_owner_modify_products" ON products FOR ALL USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'manager')
);

CREATE POLICY "company_read_inventory" ON inventory FOR SELECT USING (company_id = public.get_company_id());
CREATE POLICY "manager_owner_modify_inventory" ON inventory FOR ALL USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'manager')
);

-- 5. Collections & Items
-- Everyone in the company can read. Owners, Managers, and Agents can modify.
CREATE POLICY "company_read_collections" ON collections FOR SELECT USING (company_id = public.get_company_id());
CREATE POLICY "agent_manager_owner_modify_collections" ON collections FOR ALL USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'manager', 'agent')
);

CREATE POLICY "company_read_collection_items" ON collection_items FOR SELECT USING (
  collection_id IN (SELECT id FROM collections WHERE company_id = public.get_company_id())
);
CREATE POLICY "agent_manager_owner_modify_collection_items" ON collection_items FOR ALL USING (
  collection_id IN (SELECT id FROM collections WHERE company_id = public.get_company_id()) AND 
  public.get_user_role() IN ('owner', 'manager', 'agent')
);

-- 6. Billing (Invoices & Payments)
-- Only Owners and Accountants can read/modify. Managers physically cannot access these.
CREATE POLICY "accountant_owner_read_invoices" ON invoices FOR SELECT USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'accountant')
);
CREATE POLICY "accountant_owner_modify_invoices" ON invoices FOR ALL USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'accountant')
);

CREATE POLICY "accountant_owner_read_payments" ON payments FOR SELECT USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'accountant')
);
CREATE POLICY "accountant_owner_modify_payments" ON payments FOR ALL USING (
  company_id = public.get_company_id() AND 
  public.get_user_role() IN ('owner', 'accountant')
);
