-- 15_revenue_trend_rpc.sql

-- Returns daily aggregated revenue for the past N days for the active company
CREATE OR REPLACE FUNCTION public.get_revenue_trend(p_days INT)
RETURNS TABLE (
    payment_date DATE,
    total_revenue DECIMAL(12,2)
) AS $$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    WITH DateSeries AS (
        -- Generate a series of the last N days to ensure no missing dates
        SELECT (CURRENT_DATE - (generate_series(0, p_days - 1) || ' days')::INTERVAL)::DATE AS d_date
    )
    SELECT 
        ds.d_date AS payment_date,
        COALESCE(SUM(p.amount), 0)::DECIMAL(12,2) AS total_revenue
    FROM DateSeries ds
    LEFT JOIN public.payments p 
        ON ds.d_date = p.payment_date 
        AND p.company_id = v_company_id
    GROUP BY ds.d_date
    ORDER BY ds.d_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
