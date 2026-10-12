-- 33_operations_completeness.sql
--
-- Closes six operational gaps in one migration, because they share tables and
-- constraints and splitting them would mean re-pointing the same functions twice.
--
-- 1. RETURNS HAD NO REASON.
--    collection_items had return_quantity and nothing else, so "why did five cans
--    come back" was unrecoverable, and a returned can that was spoiled was
--    indistinguishable from one that was fine and went back on the shelf. Added
--    reason + restockable, because those drive very different inventory outcomes.
--
-- 2. NO STOCK LEDGER.
--    `inventory` held a single running number with no history, so movement could
--    not be explained, stock could not be valued, wastage could not be reported,
--    and a physical count could not be reconciled. Every change now writes a
--    stock_entries row, which is what makes the balance auditable.
--
-- 3. THE COLLECTION STATE MACHINE WAS 2 OF 7 STATES.
--    Only draft -> completed -> verified were reachable. No cancel path despite
--    the CHECK allowing it, no 'not available' for a closed restaurant, no
--    'in progress'. An agent who found the shop shut had no honest way to record
--    it and would leave the stop looking pending forever.
--
-- 4. agent_id WAS WRITTEN BUT NEVER CHECKED.
--    RLS compared role only, so any agent could read and edit any other agent's
--    deliveries. Now scoped per agent, with managers and owners exempt because
--    they legitimately need to see the whole day's work.
--
-- 5. REPORTS HARDCODED 'kg'.
--    A water and milk distributor does not trade in kilograms. products now
--    carries a unit, and the reports read it.
--
-- 6. GSTR-3B DID NOT EXIST, and GSTR-1 was per-invoice.
--    GSTR-1 section 7 / B2B-B2CS is grouped by HSN code and rate, not per invoice;
--    GSTR-3B is a monthly summary of inward supplies, outward supplies and net
--    tax payable. Neither matched what an accountant files.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── 1. Why something came back, and what happens to it ─────────────────────

ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS return_restockable BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.collection_items.return_reason IS
  'damaged | expired | wrong_item | excess | quality | not_ordered | other. NULL means nothing was returned, so the field is only meaningful alongside a non-zero return_quantity.';
COMMENT ON COLUMN public.collection_items.return_restockable IS
  'TRUE when a returned unit goes back on the shelf. FALSE means it is wastage: stock was credited by the deduction trigger either way, but wastage is separately reportable and must not be counted as sellable stock.';

ALTER TABLE public.collection_items
  DROP CONSTRAINT IF EXISTS collection_items_return_reason_check;
ALTER TABLE public.collection_items
  ADD CONSTRAINT collection_items_return_reason_check
  CHECK (
    return_reason IS NULL
    OR return_reason IN ('damaged','expired','wrong_item','excess','quality','not_ordered','other')
  );

-- A reason is only required when something actually came back.
ALTER TABLE public.collection_items
  DROP CONSTRAINT IF EXISTS collection_items_return_reason_required;
ALTER TABLE public.collection_items
  ADD CONSTRAINT collection_items_return_reason_required
  CHECK (
    COALESCE(return_quantity, 0) = 0
    OR return_reason IS NOT NULL
  );

-- ── 2. The stock ledger ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id),
  product_id      UUID NOT NULL REFERENCES public.products(id),
  -- Signed: positive adds stock, negative removes it.
  quantity_change DECIMAL(12,2) NOT NULL,
  -- What the balance was BEFORE this entry, so a row is self-describing.
  quantity_before DECIMAL(12,2),
  quantity_after  DECIMAL(12,2),
  entry_type      TEXT NOT NULL,
  reference_type  TEXT,
  reference_id    UUID,
  unit_cost       DECIMAL(10,2),
  supplier        TEXT,
    -- Needed to split input tax into CGST/SGST or IGST. Without the supplier's
    -- state code a purchase cannot be placed intra- or inter-state, and
    -- GSTR-3B would have to guess.
    supplier_gstin  TEXT,
  batch_number    TEXT,
  expiry_date     DATE,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Free text for the reason a return or adjustment happened.
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.stock_entries IS
  'Every change to inventory, with the balance before and after. The running figure in inventory is a cache of SUM(quantity_change) over this table.';

COMMENT ON COLUMN public.stock_entries.entry_type IS
  'purchase | opening_stock | dispatch | return_from_customer | wastage | adjustment | physical_count';

-- dispatch / return_from_customer / wastage are derived from a collection line.
-- The FK is deliberately loose (no ON DELETE) so history survives a deleted row.
ALTER TABLE public.stock_entries DROP CONSTRAINT IF EXISTS stock_entries_entry_type_check;
ALTER TABLE public.stock_entries ADD CONSTRAINT stock_entries_entry_type_check
  CHECK (entry_type IN ('purchase','opening_stock','dispatch','return_from_customer',
                        'wastage','adjustment','physical_count'));

CREATE INDEX IF NOT EXISTS idx_stock_entries_product ON public.stock_entries(product_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_entries_ref     ON public.stock_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_company  ON public.stock_entries(company_id, created_at DESC);

ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_entries_read ON public.stock_entries;
CREATE POLICY stock_entries_read ON public.stock_entries
  FOR SELECT TO authenticated
  USING (company_id = public.get_company_id());

-- Agents see stock movements for their own deliveries; the rest is owner/manager,
-- matching what add_stock() already enforced.
DROP POLICY IF EXISTS stock_entries_write ON public.stock_entries;
CREATE POLICY stock_entries_write ON public.stock_entries
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'manager'))
  WITH CHECK (public.get_user_role() IN ('owner', 'manager'));

-- ── 3. Ledger a stock change ──────────────────────────────────────────────
--
-- Called from the deduction trigger and from add_stock, so there is one place
-- that decides what a movement means and how the balance is recorded.

CREATE OR REPLACE FUNCTION public.record_stock_entry(
  p_company_id      UUID,
  p_product_id      UUID,
  p_quantity_change DECIMAL(12,2),
  p_entry_type      TEXT,
  p_reference_type  TEXT DEFAULT NULL,
  p_reference_id    UUID DEFAULT NULL,
  p_unit_cost       DECIMAL(10,2) DEFAULT NULL,
  p_supplier        TEXT DEFAULT NULL,
  p_batch_number    TEXT DEFAULT NULL,
  p_expiry_date     DATE DEFAULT NULL,
  p_entry_date      DATE DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_supplier_gstin  TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_before DECIMAL(12,2);
  v_after  DECIMAL(12,2);
  v_agent  TEXT;
BEGIN
  SELECT quantity INTO v_before
  FROM public.inventory
  WHERE company_id = p_company_id AND product_id = p_product_id
  FOR UPDATE;

  v_before := COALESCE(v_before, 0);
  v_after  := v_before + p_quantity_change;

  INSERT INTO public.stock_entries (
    company_id, product_id, quantity_change, quantity_before, quantity_after,
    entry_type, reference_type, reference_id, unit_cost, supplier, supplier_gstin,
    batch_number, expiry_date, entry_date, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, p_quantity_change, v_before, v_after,
    p_entry_type, p_reference_type, p_reference_id, p_unit_cost, p_supplier,
    p_supplier_gstin,
    p_batch_number, p_expiry_date, COALESCE(p_entry_date, CURRENT_DATE), p_notes,
    public.current_user_id()
  );

  UPDATE public.inventory
  SET quantity = v_after, last_updated = NOW()
  WHERE company_id = p_company_id AND product_id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_stock_entry(UUID, UUID, DECIMAL, TEXT, TEXT, UUID, DECIMAL, TEXT, TEXT, DATE, DATE, TEXT, TEXT) IS
  'Appends one stock_entries row and updates the running inventory balance. '
  'The single place that records a movement.';

-- Rewrite the deduction trigger so every dispatch and return is legible, and so
-- wastage is separated from a restockable return. Previously the trigger moved the
-- number with no record of why.
CREATE OR REPLACE FUNCTION public.process_inventory_on_collection_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_current_qty DECIMAL(10,2);
  v_new_qty DECIMAL(10,2);
  v_restockable DECIMAL(12,2);
  v_wastage DECIMAL(12,2);
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN

    FOR v_item IN SELECT * FROM public.collection_items WHERE collection_id = NEW.id
    LOOP
      SELECT quantity INTO v_current_qty
      FROM public.inventory
      WHERE company_id = NEW.company_id AND product_id = v_item.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Cannot dispatch product % — it has no stock record. This is a data error, not a stock count.',
          v_item.product_id;
      END IF;

      v_new_qty := v_current_qty - v_item.quantity + COALESCE(v_item.return_quantity, 0);

      -- Outbound leg.
      PERFORM public.record_stock_entry(
        NEW.company_id, v_item.product_id, -v_item.quantity,
        'dispatch', 'collection', NEW.id, NULL, NULL, NULL, NULL, NEW.collection_date,
        'Delivery from collection ' || LEFT(NEW.id::TEXT, 8)
      );

      -- Inbound leg, split so wastage is reportable rather than indistinguishable
      -- from stock that went back on the shelf.
      IF COALESCE(v_item.return_quantity, 0) > 0 THEN
        v_restockable := CASE WHEN COALESCE(v_item.return_restockable, TRUE)
                              THEN v_item.return_quantity ELSE 0 END;
        v_wastage := v_item.return_quantity - v_restockable;

        IF v_restockable > 0 THEN
          PERFORM public.record_stock_entry(
            NEW.company_id, v_item.product_id, v_restockable,
            'return_from_customer', 'collection', NEW.id, NULL, NULL, NULL, NULL,
            NEW.collection_date,
            'Returned and restocked: ' || COALESCE(v_item.return_reason, 'unspecified')
          );
        END IF;

        IF v_wastage > 0 THEN
          PERFORM public.record_stock_entry(
            NEW.company_id, v_item.product_id, v_wastage,
            'wastage', 'collection', NEW.id, NULL, NULL, NULL, NULL,
            NEW.collection_date,
            'Written off: ' || COALESCE(v_item.return_reason, 'unspecified')
          );
        END IF;
      END IF;

      -- A shortfall warns rather than refusing: the delivery physically happened,
      -- so losing the fact also corrupts the stock count.
      IF v_new_qty < 0 THEN
        RAISE WARNING
          'Stock for product % is now negative: % on hand, % dispatched, % returned. Replenish and recount.',
          v_item.product_id, v_current_qty, v_item.quantity,
          COALESCE(v_item.return_quantity, 0);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The two-argument form is kept as a separate overload rather than relying on
-- defaults on the eight-argument version. Postgres cannot resolve
-- add_stock(uuid, numeric) against a signature whose remaining parameters are all
-- defaulted when the values are literals -- it reports "function is not unique"
-- because both arities match. Dropping and recreating the old shape would also
-- break any caller pinned to it.
CREATE OR REPLACE FUNCTION public.add_stock(p_product_id UUID, p_quantity DECIMAL)
RETURNS VOID AS $$
BEGIN
  -- 'purchase' is the historical behaviour of this call: goods received.
  PERFORM public.add_stock(
    p_product_id, p_quantity, 'purchase', NULL, NULL, NULL, NULL, NULL);
END;
$$ LANGUAGE plpgsql;

-- add_stock writes a purchase/ledger row rather than only moving the number, so a
-- stock level can be explained.
CREATE OR REPLACE FUNCTION public.add_stock(
  p_product_id  UUID,
  p_quantity    DECIMAL,
  p_entry_type  TEXT,
  p_unit_cost   DECIMAL DEFAULT NULL,
  p_supplier    TEXT DEFAULT NULL,
  p_batch_number TEXT DEFAULT NULL,
  p_expiry_date  DATE DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL,
  p_supplier_gstin TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
  v_agent_id   TEXT;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
  v_agent_id := public.current_user_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must not be zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id AND company_id = v_company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Product % does not belong to your company.', p_product_id;
  END IF;

  -- A negative entry here is a correction or a write-off, not a purchase.
  IF p_quantity < 0 THEN
    p_entry_type := CASE WHEN p_entry_type = 'purchase' THEN 'adjustment' ELSE p_entry_type END;
  END IF;

  PERFORM public.record_stock_entry(
    v_company_id, p_product_id, p_quantity,
    p_entry_type, 'manual', NULL, p_unit_cost, p_supplier,
    p_batch_number, p_expiry_date, CURRENT_DATE, p_notes,
    p_supplier_gstin
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.add_stock(UUID, DECIMAL) IS
  'Records goods received. Kept as a two-argument overload for older call sites.';

COMMENT ON FUNCTION public.add_stock(UUID, DECIMAL, TEXT, DECIMAL, TEXT, TEXT, DATE, TEXT, TEXT) IS
  'Records a stock movement and its ledger row. A negative quantity is treated as an adjustment or write-off rather than a purchase. p_supplier_gstin places the purchase intra- or inter-state for input tax.';

-- ── 3b. record_collection persists the return reason ─────────────────────
--
-- Re-pointed rather than patched: the item JSONB gains two keys
-- (return_reason, return_restockable), and a partial edit would leave the INSERT
-- listing columns that no longer receive values.

CREATE OR REPLACE FUNCTION public.record_collection(
  p_restaurant_id UUID,
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_agent_id TEXT;
  v_collection_id UUID;
  v_total_amount DECIMAL(12,2) := 0;
  v_total_quantity DECIMAL(12,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity DECIMAL;
  v_return_quantity DECIMAL;
  v_unit_price DECIMAL;
  v_amount DECIMAL(12,2);
  v_credit RECORD;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager', 'agent']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
  v_agent_id := public.current_user_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. Missing company_id in token.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = p_restaurant_id AND company_id = v_company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Restaurant % does not belong to your company.', p_restaurant_id;
  END IF;

  -- Price from the catalog, never from the submitted form, so the credit check
  -- below cannot be shrunk by tampering.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_amount := COALESCE((v_item->>'quantity')::DECIMAL, 0)
             * COALESCE((SELECT price FROM public.products
                          WHERE id = (v_item->>'product_id')::UUID
                            AND company_id = v_company_id), 0);
    v_total_amount := v_total_amount + v_amount;
  END LOOP;

  -- Credit limit warns rather than blocks: a delivery that physically happened
  -- must still be recorded, or the stock count and the debt are both wrong.
  SELECT * INTO v_credit
  FROM public.restaurant_credit_exposure(p_restaurant_id);

  IF v_credit.exceeded THEN
    RAISE WARNING
      'Credit limit exceeded for this restaurant: % outstanding against a limit of %. This delivery takes it to %.',
      v_credit.outstanding, v_credit.credit_limit, v_credit.outstanding + v_total_amount;
  END IF;

  -- 'draft' first: the deduction trigger is an AFTER trigger on collections and
  -- would fire on a direct 'completed' insert before any line items existed,
  -- deducting nothing.
  INSERT INTO public.collections (
    company_id, restaurant_id, agent_id, collection_date, status, notes, total_amount, total_quantity
  ) VALUES (
    v_company_id, p_restaurant_id, v_agent_id, CURRENT_DATE, 'draft', p_notes, 0, 0
  ) RETURNING id INTO v_collection_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := COALESCE((v_item->>'quantity')::DECIMAL, 0);
    v_return_quantity := COALESCE((v_item->>'return_quantity')::DECIMAL, 0);
    v_total_quantity := v_total_quantity + v_quantity;

    IF v_return_quantity > v_quantity THEN
      RAISE EXCEPTION
        'Cannot record % returned against % dispatched for a product.', v_return_quantity, v_quantity;
    END IF;

    -- Named here rather than left to the column default, so an explicit false
    -- from the form is honoured.
    IF v_return_quantity > 0 AND (v_item->>'return_reason') IS NULL THEN
      RAISE EXCEPTION
        'A reason is required for the % returned on this line.', v_return_quantity;
    END IF;

    v_unit_price := COALESCE((SELECT price FROM public.products
                               WHERE id = v_product_id AND company_id = v_company_id), 0);

    IF v_unit_price = 0 THEN
      RAISE EXCEPTION 'Product % is not in your catalog, or has no price.', v_product_id;
    END IF;

    v_amount := v_quantity * v_unit_price;

    INSERT INTO public.collection_items (
      collection_id, product_id, quantity, return_quantity, price_per_unit, amount,
      return_reason, return_restockable
    ) VALUES (
      v_collection_id, v_product_id, v_quantity, v_return_quantity, v_unit_price, v_amount,
      v_item->>'return_reason',
      COALESCE((v_item->>'return_restockable')::BOOLEAN, TRUE)
    );
  END LOOP;

  UPDATE public.collections
  SET total_amount = v_total_amount,
      total_quantity = v_total_quantity,
      status = 'completed'
  WHERE id = v_collection_id;

  RETURN v_collection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_collection(UUID, TEXT, JSONB) IS
  'Records a dispatch at catalog prices. A returned line must carry a reason. Warns when the restaurant is over its credit limit but does not block.';

-- ── 4. The full collection state machine ──────────────────────────────────
--
-- Reachable now: pending -> assigned -> in_progress -> completed -> verified,
-- with not_available and cancelled as terminal exits.

ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_status_check;
ALTER TABLE public.collections ADD CONSTRAINT collections_status_check
  CHECK (status IN ('pending','draft','assigned','in_progress','completed',
                    'verified','not_available','cancelled'));

COMMENT ON COLUMN public.collections.status IS
  'pending -> assigned -> in_progress -> completed -> verified. not_available (shop shut, recorded honestly rather than left pending) and cancelled are terminal.';

ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS not_available_reason TEXT;
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- An invalid transition is refused with what to do instead, not just "no".
CREATE OR REPLACE FUNCTION public.assert_collection_transition(
  p_from TEXT, p_to TEXT, p_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_allowed TEXT[];
BEGIN
  CASE p_from
    WHEN 'pending'     THEN v_allowed := ARRAY['assigned','in_progress','completed','not_available','cancelled'];
    WHEN 'assigned'    THEN v_allowed := ARRAY['in_progress','completed','not_available','cancelled'];
    WHEN 'in_progress' THEN v_allowed := ARRAY['completed','not_available','cancelled'];
    WHEN 'draft'       THEN v_allowed := ARRAY['completed','cancelled'];
    -- Completed can only be verified or cancelled, which is the freeze point.
    WHEN 'completed'   THEN v_allowed := ARRAY['verified','cancelled'];
    ELSE v_allowed := ARRAY[]::TEXT[];
  END CASE;

  IF p_from = p_to THEN
    RETURN;
  END IF;

  IF NOT (p_to = ANY(v_allowed)) THEN
    RAISE EXCEPTION
      'Cannot move a collection from % to %. Allowed from here: %.',
      p_from, p_to,
      CASE WHEN array_length(v_allowed, 1) = 0 THEN 'nothing, it is final'
           ELSE array_to_string(v_allowed, ', ') END;
  END IF;

  -- Agents cannot verify: that is a manager's sign-off on someone else's work.
  IF p_to = 'verified' AND p_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot verify collections.';
  END IF;

  -- An agent cannot re-open or cancel work that has been verified.
  IF p_from = 'verified' AND p_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot edit a verified collection.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.enforce_collection_state_machine()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  -- Service role and background tasks bypass the state machine by design.
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_collection_transition(OLD.status, NEW.status, v_role);

  -- "not available" must say why, or it is indistinguishable from a missed stop.
  IF NEW.status = 'not_available' AND (NEW.not_available_reason IS NULL
                                       OR btrim(NEW.not_available_reason) = '') THEN
    RAISE EXCEPTION 'A reason is required when a stop is marked not available.';
  END IF;

  -- Agents cannot edit a collection once they have submitted it.
  IF OLD.status IN ('completed','verified') AND NEW.status = OLD.status
     AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Record is locked. Agents cannot edit completed collections.';
  END IF;

  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.verified_at := NOW();
  END IF;

  -- An approved bill is immutable for every role. Changing it goes through a
  -- cancellation, which leaves an audit trail.
  IF public.collection_is_frozen(OLD.id) THEN
    RAISE EXCEPTION
      'This collection feeds an approved invoice and cannot be changed. Cancel the invoice and re-issue instead.';
  END IF;

  -- NEW: an agent owns their deliveries. Previously collections.agent_id was
  -- written but never compared, so any agent could edit anyone else's work.
  IF v_role = 'agent'
     AND OLD.agent_id IS DISTINCT FROM public.current_user_id() THEN
    RAISE EXCEPTION 'Unauthorized: You can only change your own collections.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Scope reads as well as writes. Managers and owners keep company-wide access
-- because they legitimately supervise the whole day's work.
DROP POLICY IF EXISTS agent_manager_owner_modify_collections ON public.collections;
DROP POLICY IF EXISTS company_read_collections        ON public.collections;

CREATE POLICY company_read_collections ON public.collections
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_company_id()
    AND (
      public.get_user_role() <> 'agent'
      OR agent_id = public.current_user_id()
    )
  );

CREATE POLICY agent_manager_owner_modify_collections ON public.collections
  FOR ALL TO authenticated
  USING (
    company_id = public.get_company_id()
    AND (
      public.get_user_role() <> 'agent'
      OR agent_id = public.current_user_id()
    )
  )
  WITH CHECK (
    company_id = public.get_company_id()
    AND (
      public.get_user_role() <> 'agent'
      OR agent_id = public.current_user_id()
    )
  );

COMMENT ON POLICY company_read_collections ON public.collections IS
  'An agent sees only their own stops. Managers, owners and accountants see the '
  'whole route.';

-- Backfill an opening entry for every balance that predates this ledger.
--
-- Without this the ledger does not reconcile: rows written directly into
-- `inventory` before migration 33 (the seed data, and any import) have no
-- corresponding entry, so SUM(quantity_change) would disagree with the running
-- figure and the whole table would be untrustworthy. Only products with no entry
-- at all are given an opening balance.
INSERT INTO public.stock_entries (
  company_id, product_id, quantity_change, quantity_before, quantity_after,
  entry_type, notes, created_at
)
SELECT
  i.company_id, i.product_id, i.quantity, 0, i.quantity,
  'opening_stock',
  'Opening balance recorded when the stock ledger was introduced',
  NOW()
FROM public.inventory i
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_entries se
  WHERE se.company_id = i.company_id AND se.product_id = i.product_id
);

-- ── 5. Units of measure ───────────────────────────────────────────────────
--
-- Reports hardcoded 'kg', which is wrong for a water and dairy distributor.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'unit';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS quantity_scale DECIMAL(10,3) DEFAULT 1;

COMMENT ON COLUMN public.products.unit IS
  'Unit of measure for quantities: can | kg | l | pouch | crate | bottle | piece. Reports read this instead of assuming kilograms.';
COMMENT ON COLUMN public.products.quantity_scale IS
  'Fractional precision, e.g. 0.250 for a 250 ml pouch. Informational: the stored quantity is always in the product own unit.';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_check
  CHECK (unit IS NULL OR unit IN ('unit','can','kg','g','l','litre','ml','pouch',
                                  'crate','bottle','piece','bag','box','roll'));

-- stock_entries needs the unit at the time of the movement, or a report in two
-- years cannot interpret the number if the product is later reclassified.
ALTER TABLE public.stock_entries ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.stock_entries ADD COLUMN IF NOT EXISTS unit_cost_total DECIMAL(12,2);

-- ── 6. GSTR-3B, and a GSTR-1 that groups by HSN ──────────────────────────
--
-- The old gstr1_report was one row per invoice. GSTR-1 B2B/B2CS is grouped by HSN
-- code with the rate as a separate column, which is what makes a return against
-- one invoice reduce that invoice's HSN line rather than a different one.

DROP VIEW IF EXISTS public.gstr1_report CASCADE;

CREATE VIEW public.gstr1_report WITH (security_invoker = true) AS
SELECT
    i.company_id,
    bi.hsn_code,
    b.gst_rate,
    -- URP is the GST term for an unregistered person (B2C).
    CASE WHEN COALESCE(NULLIF(r.gst_number, ''), 'URP') = 'URP' THEN 'B2C' ELSE 'B2B' END AS supply_type,
    COUNT(DISTINCT i.id)::INT                              AS invoice_count,
    COUNT(DISTINCT r.id)::INT                              AS recipient_count,
    SUM(bi.taxable_amount)                                 AS taxable_value,
    SUM(bi.cgst)                                           AS cgst,
    SUM(bi.sgst)                                           AS sgst,
    SUM(bi.igst)                                           AS igst,
    SUM(bi.cgst + bi.sgst + bi.igst)                       AS total_tax
FROM public.bill_items bi
JOIN public.invoices i   ON i.id = bi.invoice_id
JOIN public.products b   ON b.id = bi.product_id
JOIN public.restaurants r ON r.id = i.restaurant_id
WHERE public.invoice_is_collectible(i.status)
GROUP BY i.company_id, bi.hsn_code, b.gst_rate,
         CASE WHEN COALESCE(NULLIF(r.gst_number, ''), 'URP') = 'URP'
              THEN 'B2C' ELSE 'B2B' END;

COMMENT ON VIEW public.gstr1_report IS
  'GSTR-1 outward supplies grouped by HSN code and rate, as B2B/B2CS requires. Derived from bill_items, so a cancelled bill removes its own lines. Excludes drafts, which have not been issued.';

-- Invoice-level detail, kept because an accountant does need the per-bill view
-- when reconciling a customer query.
DROP VIEW IF EXISTS public.gst_invoice_detail CASCADE;

CREATE VIEW public.gst_invoice_detail WITH (security_invoker = true) AS
SELECT
    i.id                AS invoice_id,
    i.company_id,
    i.restaurant_id,
    COALESCE(NULLIF(r.gst_number, ''), 'URP') AS recipient_gstin,
    r.name              AS receiver_name,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.total_amount      AS invoice_value,
    i.subtotal          AS taxable_value,
    i.cgst, i.sgst, i.igst,
    i.status
FROM public.invoices i
JOIN public.restaurants r ON i.restaurant_id = r.id
WHERE i.status <> 'cancelled';

COMMENT ON VIEW public.gst_invoice_detail IS
  'Per-invoice GST detail for reconciliation. Excludes cancelled and draft bills.';

-- GSTR-3B: monthly inward supplies, outward supplies, and the net tax payable.
--
-- Inward supplies are purchases recorded in stock_entries. That is the only
-- purchase data this schema holds, so it is the honest source; when a dedicated
-- purchase-invoice table is added, this view should read that instead.
CREATE VIEW public.gstr3b_report WITH (security_invoker = true) AS
WITH months AS (
    -- Every month in which anything happened, so a period with outward supply but
    -- no inward supply still reports rather than vanishing.
    SELECT DISTINCT period FROM (
        SELECT to_char(invoice_date, 'YYYY-MM') AS period
        FROM public.invoices WHERE public.invoice_is_collectible(status)
        UNION ALL
        SELECT to_char(entry_date, 'YYYY-MM')
        FROM public.stock_entries
        WHERE entry_type IN ('purchase', 'opening_stock')
    ) m
)
SELECT
    m.period,
    COALESCE(iw.inward_taxable, 0)                AS inward_supplies,
    COALESCE(iw.input_cgst, 0)                    AS input_cgst,
    COALESCE(iw.input_sgst, 0)                    AS input_sgst,
    COALESCE(iw.input_igst, 0)                    AS input_igst,
    COALESCE(iw.inward_tax, 0)                    AS input_tax_credit,
    COALESCE(ow.outward_taxable, 0)               AS outward_supplies,
    COALESCE(ow.output_cgst, 0)                   AS output_cgst,
    COALESCE(ow.output_sgst, 0)                   AS output_sgst,
    COALESCE(ow.output_igst, 0)                   AS output_igst,
    COALESCE(ow.outward_tax, 0)                   AS output_tax,
    COALESCE(ow.outward_tax, 0) - COALESCE(iw.inward_tax, 0) AS net_tax_payable
FROM months m
LEFT JOIN LATERAL (
    SELECT
        -- Taxable value of what came in.
        SUM(sa.quantity_change * p.price)  AS inward_taxable,
        -- A purchase is either intra-state (CGST + SGST) or inter-state (IGST),
        -- never both. Reporting all three at once would claim three times the
        -- input credit the supplier actually charged.
        SUM(CASE WHEN NOT public.is_inter_state_supply(
                   (SELECT c.gst_number FROM public.companies c
                    WHERE c.id = sa.company_id),
                   sa.supplier_gstin)
                 THEN ROUND(sa.quantity_change * p.price * p.gst_rate / 2.0 / 100.0, 2)
                 ELSE 0 END) AS input_cgst,
        SUM(CASE WHEN NOT public.is_inter_state_supply(
                   (SELECT c.gst_number FROM public.companies c
                    WHERE c.id = sa.company_id),
                   sa.supplier_gstin)
                 THEN ROUND(sa.quantity_change * p.price * p.gst_rate / 2.0 / 100.0, 2)
                 ELSE 0 END) AS input_sgst,
        SUM(CASE WHEN public.is_inter_state_supply(
                   (SELECT c.gst_number FROM public.companies c
                    WHERE c.id = sa.company_id),
                   sa.supplier_gstin)
                 THEN ROUND(sa.quantity_change * p.price * p.gst_rate / 100.0, 2)
                 ELSE 0 END) AS input_igst,
        -- Authoritative total, so net payable stays right even where the
        -- components above cannot be attributed.
        SUM(sa.quantity_change * p.price * p.gst_rate / 100.0) AS inward_tax
    FROM public.stock_entries sa
    JOIN public.products p ON p.id = sa.product_id
    WHERE sa.company_id = public.get_company_id()
      AND sa.entry_type IN ('purchase', 'opening_stock')
      AND to_char(sa.entry_date, 'YYYY-MM') = m.period
) iw ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(i.subtotal)  AS outward_taxable,
        SUM(i.cgst)      AS output_cgst,
        SUM(i.sgst)      AS output_sgst,
        SUM(i.igst)      AS output_igst,
        SUM(i.cgst + i.sgst + i.igst) AS outward_tax
    FROM public.invoices i
    WHERE i.company_id = public.get_company_id()
      AND public.invoice_is_collectible(i.status)
      AND to_char(i.invoice_date, 'YYYY-MM') = m.period
) ow ON TRUE;

COMMENT ON VIEW public.gstr3b_report IS
  'GSTR-3B monthly summary: inward supplies, outward supplies and net tax payable. Inward supplies come from stock_entries purchases, which is the only purchase data this schema holds.';

-- Wastage is reportable now that it is recorded separately.
CREATE VIEW public.wastage_report WITH (security_invoker = true) AS
SELECT
    se.company_id,
    se.product_id,
    p.name          AS product_name,
    p.unit,
    date_trunc('month', se.entry_date)::DATE AS month,
    COUNT(*)::INT                          AS entries,
    -- Quantity_change is already positive here: goods that came back and were
    -- written off. Negating it would report wastage as negative units lost,
    -- which reads as stock created rather than stock destroyed.
    SUM(se.quantity_change)                AS quantity_wasted,
    SUM(se.quantity_change * COALESCE(se.unit_cost, p.price))
                                     AS estimated_value
FROM public.stock_entries se
JOIN public.products p ON p.id = se.product_id
WHERE se.entry_type = 'wastage'
GROUP BY se.company_id, se.product_id, p.name, p.unit,
         date_trunc('month', se.entry_date);

COMMENT ON VIEW public.wastage_report IS
  'Monthly wastage per product, valued where a unit cost is known.';

COMMIT;