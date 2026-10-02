-- 17_sales_report.sql

-- 1. Sales by Product
CREATE OR REPLACE FUNCTION public.get_sales_by_product(p_start DATE, p_end DATE)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    total_quantity DECIMAL(10,2),
    total_revenue DECIMAL(12,2)
) AS $$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
    
    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(SUM(ci.quantity), 0)::DECIMAL(10,2) AS total_quantity,
        COALESCE(SUM(ci.amount), 0)::DECIMAL(12,2) AS total_revenue
    FROM public.products p
    JOIN public.collection_items ci ON p.id = ci.product_id
    JOIN public.collections c ON ci.collection_id = c.id
    WHERE c.company_id = v_company_id
      AND c.status IN ('completed', 'verified')
      AND c.collection_date >= p_start 
      AND c.collection_date <= p_end
    GROUP BY p.id, p.name
    ORDER BY total_revenue DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Sales by Restaurant
CREATE OR REPLACE FUNCTION public.get_sales_by_restaurant(p_start DATE, p_end DATE)
RETURNS TABLE (
    restaurant_id UUID,
    restaurant_name TEXT,
    total_quantity DECIMAL(10,2),
    total_revenue DECIMAL(12,2)
) AS $$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
    
    RETURN QUERY
    SELECT 
        r.id AS restaurant_id,
        r.name AS restaurant_name,
        COALESCE(SUM(ci.quantity), 0)::DECIMAL(10,2) AS total_quantity,
        COALESCE(SUM(ci.amount), 0)::DECIMAL(12,2) AS total_revenue
    FROM public.restaurants r
    JOIN public.collections c ON r.id = c.restaurant_id
    JOIN public.collection_items ci ON c.id = ci.collection_id
    WHERE c.company_id = v_company_id
      AND c.status IN ('completed', 'verified')
      AND c.collection_date >= p_start 
      AND c.collection_date <= p_end
    GROUP BY r.id, r.name
    ORDER BY total_revenue DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
