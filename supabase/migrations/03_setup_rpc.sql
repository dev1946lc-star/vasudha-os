-- 03_setup_rpc.sql

-- Function to handle new company onboarding atomically
CREATE OR REPLACE FUNCTION public.setup_company_and_profile(
  p_company_name TEXT,
  p_gst_number TEXT,
  p_address TEXT,
  p_user_name TEXT
) RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_user_id TEXT;
BEGIN
  -- Get the current authenticated user ID
  v_user_id := public.current_user_id();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has a profile
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  -- Insert the new company
  INSERT INTO public.companies (name, gst_number, address)
  VALUES (p_company_name, p_gst_number, p_address)
  RETURNING id INTO v_company_id;

  -- Insert the owner profile
  INSERT INTO public.profiles (id, company_id, role, name)
  VALUES (v_user_id, v_company_id, 'owner', p_user_name);

  -- The JWT trigger (01_jwt_claims.sql) will automatically fire here 
  -- and set the raw_app_meta_data with the role and company_id.

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
