-- TEST ONLY: inspected cs-works-test policies; never apply to production.
begin;
do $$ begin
 if to_regclass('public.csworks_annotation_test_environment') is null then raise exception 'Test environment required'; end if;
end $$;
alter policy csworks_test_files_delete on public.project_files using (
 public.csworks_test_admin() or (file_type='reference' and uploaded_by=auth.uid()
 and split_part(storage_path,'/',1)=project_id::text
 and exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid() and p.status in ('ordered','in_production','customer_review','revision'))));
alter policy csworks_test_storage_delete on storage.objects using (
 bucket_id='project-files' and (public.csworks_test_admin() or exists(
 select 1 from public.project_files f join public.projects p on p.id=f.project_id
 where f.storage_path=name and split_part(name,'/',1)=p.id::text and f.file_type='reference'
 and f.uploaded_by=auth.uid() and p.user_id=auth.uid() and p.status in ('ordered','in_production','customer_review','revision'))));
create policy intake_admin_storage_insert on storage.objects for insert to authenticated with check (
 bucket_id='project-files' and public.is_admin() and exists(select 1 from public.project_intakes i
 where i.project_id::text=split_part(name,'/',1) and i.accepted_at is null));
create policy intake_admin_storage_read on storage.objects for select to authenticated using (
 bucket_id='project-files' and public.is_admin() and exists(select 1 from public.project_intakes i
 where i.project_id::text=split_part(name,'/',1) and i.accepted_at is null));
commit;

