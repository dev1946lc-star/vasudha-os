-- 19_company_metadata.sql

-- Add logo_url to companies table if it doesn't exist
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create an RPC to update company profile
CREATE OR REPLACE FUNCTION public.update_company_profile(
    p_name TEXT,
    p_address TEXT,
    p_gst_number TEXT,
    p_logo_url TEXT
) RETURNS VOID AS $$
DECLARE
    v_company_id UUID;
BEGIN
    -- Securely get company_id from token
    v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies 
    SET 
        name = p_name,
        address = p_address,
        gst_number = p_gst_number,
        logo_url = p_logo_url
    WHERE id = v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
