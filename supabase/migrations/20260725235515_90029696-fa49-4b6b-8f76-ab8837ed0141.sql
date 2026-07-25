
-- 1. Extra columns on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS app_name text NOT NULL DEFAULT 'SlicerAI',
  ADD COLUMN IF NOT EXISTS trial_welcome_message text NOT NULL DEFAULT 'Bem-vindo ao seu trial de 7 dias com acesso completo.';

-- 2. Admin manage policies (missing ones)
DROP POLICY IF EXISTS "admins manage user_roles" ON public.user_roles;
CREATE POLICY "admins manage user_roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "admins manage app_settings" ON public.app_settings;
CREATE POLICY "admins manage app_settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- 3. Protect the owner role from any modification
CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' THEN
      IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
        RAISE EXCEPTION 'O papel de owner já foi atribuído e é único.';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'O papel de owner não pode ser alterado.';
    END IF;
    IF NEW.role = 'owner' AND OLD.role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Não é possível promover a owner.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      RAISE EXCEPTION 'O papel de owner não pode ser removido.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_owner_role ON public.user_roles;
CREATE TRIGGER trg_protect_owner_role
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();
