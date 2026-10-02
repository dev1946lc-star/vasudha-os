-- 08_collection_state_machine.sql

-- 1. Drop the old constraint and add the new one
ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_status_check;
ALTER TABLE public.collections ADD CONSTRAINT collections_status_check 
  CHECK (status IN ('pending', 'draft', 'completed', 'verified', 'cancelled'));

-- 2. Create the Trigger Function to enforce the state machine
CREATE OR REPLACE FUNCTION public.enforce_collection_state_machine()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- get_user_role() is defined in 02_rls_policies.sql and reads the JWT app_metadata.
  v_role := public.get_user_role();
  
  -- If bypassing via service role or backend tasks, allow it
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. A verified collection is permanently locked from agents. 
  IF OLD.status = 'verified' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot edit a verified collection.';
  END IF;

  -- 2. Agents cannot transition a collection to verified.
  IF NEW.status = 'verified' AND OLD.status != 'verified' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot verify collections.';
  END IF;

  -- 3. Agents cannot edit a completed collection. (It locks after they submit it)
  IF OLD.status = 'completed' AND NEW.status = 'completed' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Record is locked. Agents cannot edit completed collections.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS collection_state_machine_trigger ON public.collections;
CREATE TRIGGER collection_state_machine_trigger
  BEFORE UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_collection_state_machine();
