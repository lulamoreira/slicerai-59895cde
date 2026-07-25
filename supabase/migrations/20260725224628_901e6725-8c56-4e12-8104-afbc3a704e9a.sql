
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_access(uuid) TO authenticated, service_role;
