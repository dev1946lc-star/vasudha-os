-- 21_user_management.sql

-- 1. Add is_active to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2. Update RLS policies to block inactive users?
-- The easiest way to block access instantly is to ensure all RLS policies verify is_active, 
-- but since we rely on JWT claims for speed, we can create an RPC to revoke access 
-- which changes the profile AND attempts to clear the JWT. 
-- For MVP, we will rely on checking `is_active` on critical paths, or simply changing their `role` to 'revoked'.
-- Let's add 'revoked' as a valid role.
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'manager', 'agent', 'accountant', 'revoked'));

-- 3. Create RPC to securely update profile status (only owner/manager can do this)
CREATE OR REPLACE FUNCTION public.update_user_status(
  p_user_id UUID,
  p_is_active BOOLEAN,
  p_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_company UUID;
  v_target_company UUID;
BEGIN
  v_caller_company := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  v_caller_role := current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'role';
  
  IF v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;

  IF v_target_company != v_caller_company THEN
    RAISE EXCEPTION 'User not found in your company';
  END IF;

  UPDATE public.profiles 
  SET 
    is_active = p_is_active,
    role = p_role
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
