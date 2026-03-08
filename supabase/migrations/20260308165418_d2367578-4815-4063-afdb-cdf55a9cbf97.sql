
-- Fix: restrict audit_log insert to users who own the project
DROP POLICY "Authenticated can insert audit logs" ON public.audit_log;
CREATE POLICY "Users can insert audit logs for their projects" ON public.audit_log FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
