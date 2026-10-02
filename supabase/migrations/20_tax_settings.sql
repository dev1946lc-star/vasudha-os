-- 20_tax_settings.sql

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS default_gst_rate DECIMAL(5,2) DEFAULT 5.0;

CREATE OR REPLACE FUNCTION public.update_tax_settings(
    p_default_gst_rate DECIMAL
) RETURNS VOID AS $$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies 
    SET default_gst_rate = p_default_gst_rate
    WHERE id = v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
