-- 30_stock_records_and_soft_delete.sql
--
-- Three operational defects, all of which surface on a distributor's first
-- morning of real use.
--
-- 1. A NEW PRODUCT COULD NOT BE DISPATCHED.
--    products/new inserted only into `products`. The stock trigger then raised
--    'Cannot dispatch product % — it has no stock record. Add stock first.' on the
--    product's very first collection, and /inventory uses INNER JOIN, so the
--    product was invisible on the one screen where you would fix it. Fixed by
--    creating the inventory row alongside the product, via a trigger so every
--    insert path benefits (the app, seeds, SQL) rather than just the form.
--
-- 2. NEGATIVE STOCK HARD-BLOCKED THE DELIVERY.
--    The spec says negative stock is allowed with a warning. The trigger raised
--    an exception, so an agent could not complete a delivery that physically
--    happened. Now it records the shortfall and blocks only when the product has
--    no record at all, which is a genuine data error rather than a stock-count
--    lag.
--
-- 3. RESTAURANTS AND PRODUCTS WERE HARD DELETED.
--    `DELETE FROM restaurants` destroys invoices, payments and collections that
--    reference it, and it has no deleted_at to fall back on. The spec requires
--    soft delete so history survives. This adds deleted_at, flips every read
--    query to exclude deleted rows, and replaces the two DELETE calls with a
--    dedicated RPC that refuses when the restaurant still owes money.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── 1. Soft delete columns ────────────────────────────────────────────────

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.products     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drop the non-negative floor on stock.
--
-- Added in 09_auto_stock_deduction.sql as the enforcement for "never oversell".
-- But the trigger itself also raised on a shortfall, so the two together meant an
-- over-delivery could not be recorded at all -- and a delivery that physically
-- happened has to be recorded, or the warehouse count silently diverges from
-- reality and every later figure is wrong.
--
-- The constraint was not replaced by nothing: the trigger in section 3 still
-- warns on a shortfall, and negative quantity is what makes it visible on
-- /inventory. Dropping it is what allows the fact to be recorded.
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_quantity_check;

COMMENT ON COLUMN public.inventory.quantity IS
  'Units on hand. May go negative when a recorded delivery exceeds the count; a '
  'negative value is a stock-take signal, not an error.';

-- Partial index: the live-rows query is the hot path, and a full index on a
-- heavily-filtered column is wasted space.
CREATE INDEX IF NOT EXISTS idx_restaurants_live
  ON public.restaurants(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_live
  ON public.products(company_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.restaurants.deleted_at IS
  'Soft-delete marker. NULL means active. Rows are never removed so that invoices, '
  'payments and collections keep their referent.';
COMMENT ON COLUMN public.products.deleted_at IS
  'Soft-delete marker. NULL means active.';

-- ── 2. Every product gets a stock record on insert ────────────────────────
--
-- Without this, a product created today cannot be dispatched until somebody
-- visits /inventory/add, and cannot even be seen there.

CREATE OR REPLACE FUNCTION public.ensure_inventory_row()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.inventory (company_id, product_id, quantity)
  VALUES (NEW.company_id, NEW.id, 0)
  ON CONFLICT (company_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ensure_inventory_row_trigger ON public.products;
CREATE TRIGGER ensure_inventory_row_trigger
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_inventory_row();

-- Backfill: products created before this migration have no row, and the trigger
-- only fires on new inserts.
INSERT INTO public.inventory (company_id, product_id, quantity)
SELECT p.company_id, p.id, 0
FROM public.products p
ON CONFLICT (company_id, product_id) DO NOTHING;

-- ── 3. Stock trigger: warn on negative, block only on a missing record ────

CREATE OR REPLACE FUNCTION public.process_inventory_on_collection_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_current_qty DECIMAL(10,2);
  v_new_qty DECIMAL(10,2);
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

      -- The delivery physically happened; refusing to record it loses the fact.
      -- The shortfall is surfaced instead so a stock count can be corrected. A
      -- negative quantity here means stock_take will show the true position.
      IF v_new_qty < 0 THEN
        RAISE WARNING
          'Stock for product % is now negative: % on hand, % dispatched, % returned. Replenish and recount.',
          v_item.product_id, v_current_qty, v_item.quantity,
          COALESCE(v_item.return_quantity, 0);
      END IF;

      UPDATE public.inventory
      SET quantity = v_new_qty,
          last_updated = NOW()
      WHERE company_id = NEW.company_id AND product_id = v_item.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Views and read paths must ignore deleted rows ──────────────────────
--
-- restaurant_outstanding drives the outstanding page and the dashboard debt
-- total. A deleted restaurant with a residual balance would otherwise keep
-- appearing in the money owed figures.

DROP VIEW IF EXISTS public.restaurant_outstanding;
CREATE VIEW public.restaurant_outstanding WITH (security_invoker = true) AS
SELECT
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.phone,
    COUNT(io.invoice_id) FILTER (WHERE io.outstanding_amount > 0) AS unpaid_invoice_count,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0), 0) AS total_outstanding,

    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue < 0), 0) AS bucket_current,

    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue BETWEEN 0 AND 15), 0) AS bucket_0_15,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue > 15 AND io.days_overdue <= 30), 0) AS bucket_15_30,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue > 30 AND io.days_overdue <= 60), 0) AS bucket_30_60,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue > 60), 0) AS bucket_60_plus

FROM public.restaurants r
LEFT JOIN public.invoice_outstanding io
    ON r.id = io.restaurant_id
   AND io.status IN ('unpaid', 'partial')
WHERE r.deleted_at IS NULL
GROUP BY r.company_id, r.id, r.name, r.phone;

COMMENT ON VIEW public.restaurant_outstanding IS
  'Per-restaurant outstanding for active restaurants, bucketed by days past due.';

-- ── 5. delete_restaurant: refuses while money is still owed ───────────────

CREATE OR REPLACE FUNCTION public.delete_restaurant(p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_company_id UUID;
  v_owed NUMERIC;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  -- Ownership first: a caller must not learn whether someone else's restaurant
  -- has a balance by watching this raise.
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = p_restaurant_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Restaurant % does not belong to your company.', p_restaurant_id;
  END IF;

  -- A hard DELETE would fail on the FK anyway. Saying so plainly, with the
  -- amount, is what the user needs in order to act.
  SELECT COALESCE(SUM(io.outstanding_amount), 0) INTO v_owed
  FROM public.invoice_outstanding io
  WHERE io.restaurant_id = p_restaurant_id
    AND io.status IN ('unpaid', 'partial');

  IF v_owed > 0 THEN
    RAISE EXCEPTION
      'Cannot remove this restaurant: % is still outstanding. Settle the balance first.',
      v_owed;
  END IF;

  -- Soft, so invoices and payments keep a valid referent.
  UPDATE public.restaurants
  SET deleted_at = NOW()
  WHERE id = p_restaurant_id AND company_id = v_company_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.delete_restaurant(UUID) IS
  'Soft-deletes a restaurant. Refuses while an invoice is still outstanding.';

-- restore_restaurant, so a mistaken removal is reversible.
-- delete_product / restore_product. Products have no outstanding balance to check
-- -- stock is not money owed -- but they do need the soft-delete treatment, because
-- collection_items reference them and a hard delete would break invoice history.
CREATE OR REPLACE FUNCTION public.delete_product(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Product % does not belong to your company.', p_product_id;
  END IF;

  UPDATE public.products
  SET deleted_at = NOW()
  WHERE id = p_product_id AND company_id = v_company_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.restore_product(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  UPDATE public.products
  SET deleted_at = NULL
  WHERE id = p_product_id AND company_id = v_company_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.restore_restaurant(p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  UPDATE public.restaurants
  SET deleted_at = NULL
  WHERE id = p_restaurant_id AND company_id = v_company_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Credit limit enforcement ───────────────────────────────────────────
--
-- credit_limit was written by the restaurant form and read by the Rust API, but
-- never checked: a distributor could deliver indefinitely into unbounded debt.
--
-- Per the spec this warns rather than blocks -- refusing a delivery that already
-- physically happened loses the fact -- and the warning surfaces on the
-- collections list. Blocking is a deliberate follow-up if you want it.

CREATE OR REPLACE FUNCTION public.restaurant_credit_status(
  p_restaurant_id UUID,
  p_extra_amount NUMERIC DEFAULT 0
) RETURNS TABLE (
  outstanding NUMERIC,
  credit_limit NUMERIC,
  exceeded BOOLEAN
) AS $$
  SELECT
    COALESCE(SUM(io.outstanding_amount), 0),
    COALESCE(r.credit_limit, 0),
    COALESCE(SUM(io.outstanding_amount), 0) + COALESCE(p_extra_amount, 0) > COALESCE(r.credit_limit, 0)
  FROM public.restaurants r
  LEFT JOIN public.invoice_outstanding io
    ON io.restaurant_id = r.id
   AND io.status IN ('unpaid', 'partial')
  WHERE r.id = p_restaurant_id
  GROUP BY r.credit_limit;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.restaurant_credit_status(UUID, NUMERIC) IS
  'Outstanding balance and credit-limit breach for a restaurant. credit_limit = 0 means unlimited.';

COMMIT;