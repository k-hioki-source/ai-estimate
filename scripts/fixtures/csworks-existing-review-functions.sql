-- Test fixture only: existing RPC definitions supplied by the user on 2026-10-26.
-- Used only in a synthetic local database. Never apply as a production migration.

CREATE OR REPLACE FUNCTION public.approve_project(p_project_id uuid)
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

  if v_project.status <> 'customer_review' then
    raise exception 'Only projects under customer review can be approved';
  end if;

  update public.projects
  set status = 'approved'
  where id = v_project.id
  returning * into v_project;

  return v_project;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_project_revision(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
begin
  update public.projects
  set
    status = 'revision',
    updated_at = now()
  where id = p_project_id
    and user_id = auth.uid()
    and status = 'customer_review'
  returning * into v_project;

  if v_project.id is null then
    raise exception 'Project cannot be moved to revision';
  end if;

  return v_project;
end;
$function$;
