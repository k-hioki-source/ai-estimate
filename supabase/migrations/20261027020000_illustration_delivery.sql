-- Additive: test DB first. No production execution or existing-file conversion.
begin;
create table public.project_delivery_assets (
 file_id uuid primary key,project_id uuid not null,illustration_id uuid,
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 foreign key(file_id,project_id) references public.project_files(id,project_id) on delete restrict,
 foreign key(illustration_id,project_id) references public.project_illustrations(id,project_id) on delete restrict
);
create index delivery_assets_project on public.project_delivery_assets(project_id);
alter table public.project_delivery_assets enable row level security;
revoke all on public.project_delivery_assets from public,anon,authenticated,service_role;
grant select on public.project_delivery_assets to authenticated;
create policy delivery_assets_read on public.project_delivery_assets for select to authenticated using (
 public.csworks_can_read_review(project_id) and (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.status in ('delivered','invoice_requested','invoiced','completed')))
);
create function public.csworks_delivery_file_readable(p_project_id uuid,p_file_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(select 1 from public.projects p where p.id=p_project_id and p.user_id=auth.uid() and (not p.illustration_workflow or (p.status in ('delivered','invoice_requested','invoiced','completed') and (exists(select 1 from public.project_delivery_assets a where a.project_id=p.id and a.file_id=p_file_id) or not exists(select 1 from public.project_delivery_assets a where a.project_id=p.id)))))
$$;
create policy illustration_delivery_file_visibility on public.project_files as restrictive for select to authenticated using(file_type::text<>'delivery' or public.csworks_delivery_file_readable(project_id,id));
create function public.csworks_delivery_path_readable(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(select 1 from public.project_delivery_assets a join public.project_files f on f.id=a.file_id join public.projects p on p.id=a.project_id where f.storage_path=p_path and p.user_id=auth.uid() and p.status in ('delivered','invoice_requested','invoiced','completed'))
$$;
-- Existing bucket policies continue to authorize normal files. This restriction applies only to the new prefix.
create policy illustration_delivery_storage_visibility on storage.objects as restrictive for select to authenticated using(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_readable(name));
create function public.csworks_guard_delivery_asset() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 pid:=case when tg_op='DELETE' then old.project_id else new.project_id end;
 perform 1 from public.projects where id=pid and status='approved' and illustration_workflow for update;
 if not found then raise exception 'Delivery list is frozen or not ready' using errcode='40001'; end if;
 if tg_op='UPDATE' then raise exception 'Replace via delivery operations' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 if not exists(select 1 from public.project_files where id=new.file_id and project_id=pid and file_type::text='delivery') then raise exception 'Invalid delivery file' using errcode='22023'; end if;
 return new;
end $$;
create trigger csworks_guard_delivery_asset before insert or update or delete on public.project_delivery_assets for each row execute function public.csworks_guard_delivery_asset();
create function public.csworks_guard_delivery_file() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.project_delivery_assets where file_id=old.id) then raise exception 'Registered delivery file is immutable' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger csworks_guard_delivery_file before update or delete on public.project_files for each row execute function public.csworks_guard_delivery_file();
create function public.csworks_guard_delivery_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.illustration_workflow and old.status in ('delivered','invoice_requested','invoiced','completed') and new.status not in ('delivered','invoice_requested','invoiced','completed') then raise exception 'Delivered project cannot reopen delivery preparation' using errcode='42501'; end if;
 if new.illustration_workflow and old.status not in ('delivered','invoice_requested','invoiced','completed') and new.status in ('delivered','invoice_requested','invoiced','completed') then
  if exists(select 1 from public.project_delivery_assets a join public.project_files f on f.id=a.file_id where a.project_id=new.id and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name=f.storage_path)) then raise exception 'Delivery object missing' using errcode='40001'; end if;
  if new.status<>'delivered' or not exists(select 1 from public.project_deliveries where project_id=new.id) or not exists(select 1 from public.project_illustrations where project_id=new.id) or exists(select 1 from public.project_illustrations i where i.project_id=new.id and (i.state<>'approved' or not exists(select 1 from public.project_delivery_assets a where a.illustration_id=i.id and a.project_id=new.id))) then raise exception 'Every illustration requires final delivery files' using errcode='40001'; end if;
 end if;
 return new;
end $$;
create trigger csworks_guard_delivery_complete before update on public.projects for each row execute function public.csworks_guard_delivery_complete();
create function public.csworks_get_delivery_manifest(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; published boolean;
begin
 if not public.csworks_can_read_review(p_project_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id;
 if not p.illustration_workflow then raise exception 'Illustration workflow required' using errcode='22023'; end if;
 published:=p.status in ('delivered','invoice_requested','invoiced','completed');
 if published and not exists(select 1 from public.project_delivery_assets where project_id=p.id) then
  return jsonb_build_object('project',jsonb_build_object('id',p.id,'project_code',p.project_code,'status',p.status),'published',true,'items','[]'::jsonb,'assets',coalesce((select jsonb_agg(jsonb_build_object('illustration_id',null,'file',to_jsonb(f)) order by f.created_at,f.id) from public.project_files f where f.project_id=p.id and f.file_type::text='delivery'),'[]'::jsonb));
 end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'project_code',p.project_code,'status',p.status),'published',published,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.number,'name',i.name,'state',i.state) order by i.position) from public.project_illustrations i where i.project_id=p.id),'[]'::jsonb),
 'assets',case when public.is_admin() or published then coalesce((select jsonb_agg(jsonb_build_object('illustration_id',a.illustration_id,'file',to_jsonb(f)) order by a.created_at,a.file_id) from public.project_delivery_assets a join public.project_files f on f.id=a.file_id where a.project_id=p.id),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create function public.csworks_register_delivery_file(p_project_id uuid,p_illustration_id uuid,p_request_id uuid,p_name text,p_path text,p_mime text,p_size bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; a public.project_delivery_assets%rowtype; f public.project_files%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or not p.illustration_workflow then raise exception 'Wrong project' using errcode='42501'; end if;
 select * into a from public.project_delivery_assets where file_id=p_request_id;
 if found then
  select * into f from public.project_files where id=a.file_id;
  if a.project_id<>p.id or a.illustration_id is distinct from p_illustration_id or f.file_name is distinct from p_name or f.storage_path is distinct from p_path or f.mime_type is distinct from p_mime or f.file_size is distinct from p_size then raise exception 'Request changed' using errcode='40001'; end if;
  return to_jsonb(a);
 end if;
 if p.status<>'approved' then raise exception 'Delivery list is frozen or not ready' using errcode='40001'; end if;
 if p_illustration_id is not null and not exists(select 1 from public.project_illustrations where id=p_illustration_id and project_id=p.id and state='approved') then raise exception 'Wrong illustration' using errcode='42501'; end if;
 if p_request_id is null or p_name is null or length(trim(p_name)) not between 1 and 255 or p_name ~ '[[:cntrl:]]' or p_size is null or p_size not between 1 and 52428800 or p_mime is null or length(p_mime) not between 1 and 150 or p_path is distinct from p.id::text||'/delivery-final/'||p_request_id::text then raise exception 'Invalid file' using errcode='22023'; end if;
 if (select count(*) from public.project_delivery_assets where project_id=p.id)>=1000 then raise exception 'Too many delivery files' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id='project-files' and name=p_path) then raise exception 'Uploaded object not found' using errcode='22023'; end if;
 insert into public.project_files(id,project_id,uploaded_by,file_name,storage_path,file_type,mime_type,file_size) values(p_request_id,p.id,auth.uid(),p_name,p_path,'delivery',p_mime,p_size);
 insert into public.project_delivery_assets(file_id,project_id,illustration_id,created_by) values(p_request_id,p.id,p_illustration_id,auth.uid()) returning * into a;
 return to_jsonb(a);
end $$;
create function public.csworks_remove_delivery_file(p_project_id uuid,p_file_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 perform 1 from public.projects where id=p_project_id and status='approved' and illustration_workflow for update;
 if not found then raise exception 'Delivery list is frozen or not ready' using errcode='40001'; end if;
 delete from public.project_delivery_assets where file_id=p_file_id and project_id=p_project_id;
 -- Original bytes and metadata are retained privately; never automatically delete Storage.
end $$;
revoke all on function public.csworks_guard_delivery_asset(),public.csworks_guard_delivery_file(),public.csworks_guard_delivery_complete(),public.csworks_delivery_file_readable(uuid,uuid),public.csworks_delivery_path_readable(text),public.csworks_get_delivery_manifest(uuid),public.csworks_register_delivery_file(uuid,uuid,uuid,text,text,text,bigint),public.csworks_remove_delivery_file(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.csworks_delivery_file_readable(uuid,uuid),public.csworks_delivery_path_readable(text),public.csworks_get_delivery_manifest(uuid),public.csworks_register_delivery_file(uuid,uuid,uuid,text,text,text,bigint),public.csworks_remove_delivery_file(uuid,uuid) to authenticated;

create function public.csworks_delivery_path_mutable(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.project_delivery_assets a join public.project_files f on f.id=a.file_id where f.storage_path=p_path)
$$;
create policy illustration_delivery_storage_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_mutable(name)) with check(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_mutable(name));
create policy illustration_delivery_storage_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_mutable(name));
revoke all on function public.csworks_delivery_path_mutable(text) from public,anon,authenticated,service_role;
grant execute on function public.csworks_delivery_path_mutable(text) to authenticated;

commit;
