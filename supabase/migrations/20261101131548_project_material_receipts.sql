create table public.project_material_receipts (
 file_id uuid primary key references public.project_files(id) on delete cascade,
 reviewed_at timestamptz not null default now()
);
alter table public.project_material_receipts enable row level security;
revoke all on public.project_material_receipts from public, anon, authenticated;
grant select, insert on public.project_material_receipts to authenticated;
create policy material_receipts_admin_read on public.project_material_receipts for select to authenticated using ((select public.is_admin()));
create policy material_receipts_admin_insert on public.project_material_receipts for insert to authenticated with check (
 (select public.is_admin()) and exists (
 select 1 from public.project_files f join public.projects p on p.id=f.project_id
 where f.id=file_id and f.file_type='reference' and f.uploaded_by=p.user_id
 ));
