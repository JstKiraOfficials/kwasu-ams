-- Enable Row Level Security on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow INSERT for all authenticated database users
CREATE POLICY audit_logs_insert_policy ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Allow SELECT for all authenticated database users
CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  USING (true);

-- Explicitly deny UPDATE and DELETE at the privilege level
-- (no UPDATE/DELETE policy = denied by default when RLS is enabled)
-- Belt-and-suspenders: also revoke at the privilege level
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

-- Revoke UPDATE and DELETE from the application database user explicitly.
-- This ensures the app role cannot bypass RLS via direct privilege.
-- Replace 'kwasu' with your actual application database role name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kwasu') THEN
    REVOKE UPDATE, DELETE ON audit_logs FROM kwasu;
  END IF;
END
$$;
