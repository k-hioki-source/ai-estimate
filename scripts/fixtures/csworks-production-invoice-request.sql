-- Production function metadata supplied by user, 2026-10-27. No customer rows or credentials.
CREATE OR REPLACE FUNCTION public.request_project_invoice(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
begin
  select * into v_project
  from public.projects
  where id = p_project_id
    and user_id = auth.uid()
  for update;

  if v_project.id is null then
    raise exception 'Project not found';
  end if;

  if v_project.status <> 'delivered' then
    raise exception 'Only delivered projects can request an invoice';
  end if;

  update public.projects
  set status = 'invoice_requested'
  where id = v_project.id
  returning * into v_project;

  return v_project;
end;
$function$;

revoke all on function public.request_project_invoice(uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_project_invoice(uuid) to authenticated;
