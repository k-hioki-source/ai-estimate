-- Production project-files policy definitions, metadata only, 2026-10-27.
create policy "Admins can delete project storage files" on storage.objects for DELETE to authenticated using (((bucket_id = 'project-files'::text) AND is_admin()));
create policy "Admins can update project storage files" on storage.objects for UPDATE to authenticated using (((bucket_id = 'project-files'::text) AND is_admin())) with check (((bucket_id = 'project-files'::text) AND is_admin()));
create policy "Admins can upload project storage files" on storage.objects for INSERT to authenticated with check (((bucket_id = 'project-files'::text) AND is_admin()));
create policy "Admins can view all project storage files" on storage.objects for SELECT to authenticated using (((bucket_id = 'project-files'::text) AND is_admin()));
create policy "Users can delete own project reference storage files" on storage.objects for DELETE to authenticated using (((bucket_id = 'project-files'::text) AND (EXISTS ( SELECT 1
   FROM (project_files pf
     JOIN projects p ON ((p.id = pf.project_id)))
  WHERE ((pf.storage_path = objects.name) AND (pf.uploaded_by = auth.uid()) AND (pf.file_type = 'reference'::text) AND (p.user_id = auth.uid()))))));
create policy "Users can upload own project storage files" on storage.objects for INSERT to authenticated with check (((bucket_id = 'project-files'::text) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE (((projects.id)::text = (storage.foldername(objects.name))[1]) AND (projects.user_id = auth.uid()))))));
create policy "Users can view own project storage files" on storage.objects for SELECT to authenticated using (((bucket_id = 'project-files'::text) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE (((projects.id)::text = (storage.foldername(objects.name))[1]) AND (projects.user_id = auth.uid()))))));
