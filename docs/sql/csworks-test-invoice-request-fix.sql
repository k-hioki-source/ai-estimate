-- TEST ONLY: cs-works-test / jjiebuuasaimaqemhiua.
-- Complements a missing test-environment RPC. Never replace a Production function.
-- Does not request an invoice or change any existing project by running this setup.
begin;
do $$ begin
 if to_regclass('public.csworks_annotation_test_environment') is null then raise exception 'STOP: dedicated test marker required'; end if;
 if not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then raise exception 'STOP: wrong test marker'; end if;
 if (select count(*) from auth.users)<>3 or exists(select 1 from auth.users where email is null or email not in ('csworks-admin@example.com','csworks-customer@example.com','csworks-other@example.com')) then raise exception 'STOP: only the three dedicated test users are allowed'; end if;
 if exists(select 1 from public.projects where project_code not like 'TEST-%') then raise exception 'STOP: unexpected project data'; end if;
 if to_regclass('public.project_delivery_assets') is null then raise exception 'STOP: final delivery test setup required'; end if;
 if to_regprocedure('public.request_project_invoice(uuid)') is not null then raise exception 'STOP: function already exists; inspect it instead of replacing'; end if;
end $$;

create function public.request_project_invoice(p_project_id uuid)
returns setof public.projects language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 if auth.uid() is null or public.is_admin() then raise exception 'Customer required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or p.user_id is distinct from auth.uid() then raise exception 'Not authorized' using errcode='42501'; end if;
 if p.project_code not like 'TEST-%' or not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then raise exception 'Dedicated test projects only' using errcode='42501'; end if;
 if not exists(select 1 from public.project_deliveries where project_id=p.id) then raise exception 'Delivery document required' using errcode='40001'; end if;
 if p.status='invoice_requested' then return next p; return; end if;
 if p.status<>'delivered' then raise exception 'Only delivered projects may request an invoice' using errcode='40001'; end if;
 update public.projects set status='invoice_requested' where id=p.id returning * into p;
 insert into public.project_messages(project_id,user_id,message,message_type,sender_type)
 values(p.id,auth.uid(),'請求書の発行を依頼しました。','message','customer');
 return next p;
end $$;
revoke all on function public.request_project_invoice(uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_project_invoice(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
select 'INVOICE_REQUEST_TEST_READY' as result;
