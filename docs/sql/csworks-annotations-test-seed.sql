-- TEST ONLY. Run only after setup and after creating these three CONFIRMED Auth test users.
-- Passwords are set privately in Supabase Authentication; do not put passwords in this file.
-- csworks-admin@example.com / csworks-customer@example.com / csworks-other@example.com
-- Target: cs-works-test / jjiebuuasaimaqemhiua
begin;
do $$
declare admin_id uuid; customer_id uuid; other_id uuid;
begin
 if not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then
  raise exception 'STOP: this is not the prepared annotation test environment';
 end if;
 select id into admin_id from auth.users where email='csworks-admin@example.com' and email_confirmed_at is not null;
 select id into customer_id from auth.users where email='csworks-customer@example.com' and email_confirmed_at is not null;
 select id into other_id from auth.users where email='csworks-other@example.com' and email_confirmed_at is not null;
 if admin_id is null or customer_id is null or other_id is null or admin_id=customer_id or admin_id=other_id or customer_id=other_id then
  raise exception 'Create the three confirmed test Auth users first (no email invitations)';
 end if;
 if (select count(*) from public.profiles where id=any(array[admin_id,customer_id,other_id]))<>3 then
  raise exception 'Test profiles are missing; inspect the test Auth profile trigger';
 end if;
 update public.profiles set role='admin',company_name='CS Works 検証管理者',contact_name='検証管理者' where id=admin_id;
 update public.profiles set role='customer',company_name='検証用A社',contact_name='検証用A担当者' where id=customer_id;
 update public.profiles set role='customer',company_name='検証用B社',contact_name='検証用B担当者' where id=other_id;
 insert into public.projects(id,project_code,user_id,title,status,description)
 values('c5100000-0000-4000-8000-000000000001','TEST-ANNOTATION-A',customer_id,'画像修正指示テスト A社','in_production','検証用。実際の顧客情報を登録しない。'),
       ('c5100000-0000-4000-8000-000000000002','TEST-ANNOTATION-B',other_id,'画像修正指示テスト B社','in_production','他社アクセス拒否の確認用。')
 on conflict(id) do nothing;
end $$;
commit;
select id,project_code,status from public.projects
where id in ('c5100000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000002')
order by project_code;
