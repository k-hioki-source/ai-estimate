-- Coupon SQL regression tests, isolated fixture only.
do $$ begin if current_database()<>'coupon_ci' then raise exception 'Fixture requires coupon_ci'; end if; end $$;
begin;
update public.trial_coupon_settings set enabled=true,starts_at=clock_timestamp()-interval '1 day';
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'FAILED: %',label; end if;raise notice 'PASS: %',label;end $$;

select pg_temp.assert_true(csworks_private.company_key('株式会社 ＡＢＣ')=csworks_private.company_key('（株）ABC'),'company normalization');
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','a@example.test','{"company_name":"株式会社 ＡＢＣ"}'),
 ('10000000-0000-4000-8000-000000000002','b@example.test','{"company_name":"（株）ABC"}'),
 ('10000000-0000-4000-8000-000000000003','c@example.test','{"company_name":"別会社"}'),
 ('10000000-0000-4000-8000-000000000004','admin@example.test','{"company_name":"管理会社"}');
update public.profiles set role='admin' where id='10000000-0000-4000-8000-000000000004';
select pg_temp.assert_true((select count(*)=0 from public.trial_coupon_grants),'no grant before email confirmation');
update auth.users set email_confirmed_at=clock_timestamp() where id='10000000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=clock_timestamp() where email_confirmed_at is null;
select pg_temp.assert_true((select count(*)=2 from public.trial_coupon_grants),'new customer grants and one-company limit');
update auth.users set email_confirmed_at=clock_timestamp();
select pg_temp.assert_true((select count(*)=2 from public.trial_coupon_grants),'confirmation replay does not duplicate grant');

insert into auth.users(id,email,created_at,email_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000005','old@example.test',clock_timestamp()-interval '2 days',clock_timestamp(),'{"company_name":"既存会員"}');
select pg_temp.assert_true(not exists(select 1 from public.trial_coupon_grants where user_id='10000000-0000-4000-8000-000000000005'),'no retroactive grant');

select pg_temp.assert_true((public.csworks_trial_coupon_promotion()->>'active')::boolean,'enabled campaign visible');
update public.trial_coupon_settings set grant_limit=2;
select pg_temp.assert_true(not (public.csworks_trial_coupon_promotion()->>'active')::boolean,'exhausted campaign hidden');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000006','limit@example.test',clock_timestamp(),'{"company_name":"上限確認会社"}');
select pg_temp.assert_true(not exists(select 1 from public.trial_coupon_grants where user_id='10000000-0000-4000-8000-000000000006'),'configurable grant limit');
update public.trial_coupon_settings set grant_limit=null,redemption_limit=0;
select pg_temp.assert_true(csworks_private.available_trial_coupon('10000000-0000-4000-8000-000000000001') is null,'configurable redemption limit');
update public.trial_coupon_settings set redemption_limit=null;
update public.trial_coupon_grants set expires_at=clock_timestamp()-interval '1 second' where user_id='10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(csworks_private.available_trial_coupon('10000000-0000-4000-8000-000000000001') is null,'configurable expiry');
update public.trial_coupon_grants set expires_at=null;

set local role service_role;
select pg_temp.assert_true((select count(*)=1 from public.csworks_claim_trial_coupon_mail('10000000-0000-4000-8000-000000000001')),'registration mail can be claimed once');
select pg_temp.assert_true((select count(*)=0 from public.csworks_claim_trial_coupon_mail('10000000-0000-4000-8000-000000000001')),'mail claim suppresses immediate duplicate send');
reset role;

insert into public.projects(id,user_id,title) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','3000 zero delivery'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000 second candidate'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','10000 discount delivery');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$
declare pid uuid; amt integer; r jsonb;
begin
 for pid,amt in select id,case when title like '3000%' then 3000 else 10000 end from public.projects order by id loop
  r:=public.csworks_save_quote(pid,null,null,0,current_date+10,jsonb_build_array(jsonb_build_object('item_key',gen_random_uuid(),'number','01','name','制作','description','','amount',amt,'hours',1)),true,gen_random_uuid());
 end loop;
end $$;
select pg_temp.assert_true((select subtotal=0 and coupon_application='full' from public.project_quotes where project_id='20000000-0000-4000-8000-000000000001'),'3000 zero quote');
select pg_temp.assert_true((select subtotal=7000 and coupon_application='partial' from public.project_quotes where project_id='20000000-0000-4000-8000-000000000003'),'10000 automatic discount');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
create temporary table request_keys(project_id uuid,request_id uuid);
insert into request_keys values('20000000-0000-4000-8000-000000000001',gen_random_uuid());
select public.csworks_order_quote_checked(q.project_id,q.id,k.request_id,0,q.edit_version)
 from public.project_quotes q join request_keys k on k.project_id=q.project_id;
select pg_temp.assert_true((select count(*)=1 from public.project_orders),'first order created');
select pg_temp.assert_true((select consumed_at is not null from public.trial_coupon_grants where user_id=auth.uid()),'grant consumed on order');
select pg_temp.assert_true((select subtotal=10000 and coupon_application='ineligible' and edit_version=2 from public.project_quotes where project_id='20000000-0000-4000-8000-000000000002'),'remaining quote repriced without coupon');
select pg_temp.assert_true((public.csworks_order_quote_checked(
 '20000000-0000-4000-8000-000000000002',
 (select id from public.project_quotes where project_id='20000000-0000-4000-8000-000000000002'),gen_random_uuid(),7700,1)->>'quoteChanged')::boolean,'stale price requires confirmation');
select pg_temp.assert_true((select count(*)=1 from public.project_orders),'stale price did not create an order');
select public.csworks_order_quote_checked(q.project_id,q.id,k.request_id,0,q.edit_version)
 from public.project_quotes q join request_keys k on k.project_id=q.project_id;
select pg_temp.assert_true((select count(*)=1 from public.project_orders),'successful order replay is idempotent');
select public.csworks_order_quote_checked(project_id,id,gen_random_uuid(),11000,edit_version)
 from public.project_quotes where project_id='20000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select total_amount=11000 from public.project_orders where project_id='20000000-0000-4000-8000-000000000002'),'second order does not reuse coupon');
select pg_temp.assert_true((public.csworks_trial_coupon_status()->>'consumed')::boolean,'status reports coupon used');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select public.csworks_order_quote_checked(project_id,id,gen_random_uuid(),7700,edit_version)
 from public.project_quotes where project_id='20000000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select total_amount=7700 and tax_amount=700 from public.project_orders where project_id='20000000-0000-4000-8000-000000000003'),'10000 becomes 7700 on order document');

-- RLS and RPC restrictions for an actual authenticated role.
set local role authenticated;
do $$ begin
 begin perform public.csworks_trial_coupon_monthly(current_date,current_date);raise exception 'FAILED: customer accessed monthly';exception when insufficient_privilege then raise notice 'PASS: monthly restricted to admin';end;
 begin perform public.csworks_trial_coupon_status('10000000-0000-4000-8000-000000000001');raise exception 'FAILED: other member status';exception when insufficient_privilege then raise notice 'PASS: other member status denied';end;
end $$;
select pg_temp.assert_true((select count(*)=1 from public.trial_coupon_grants),'RLS exposes only own grant');
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
update public.projects set status='approved';
insert into public.project_files(project_id,file_type) select id,'delivery' from public.projects;
select public.deliver_project(id) from public.projects order by id;
select pg_temp.assert_true((select status='completed' and coupon_zero_delivery from public.projects where id='20000000-0000-4000-8000-000000000001'),'zero delivery completes automatically');
select pg_temp.assert_true((select count(*)=0 from public.project_invoices),'no zero invoice created');
do $$ begin
 begin insert into public.project_invoices(project_id,user_id,project_code,project_title,project_description,subtotal_amount,tax_rate,tax_amount,total_amount,quoted_hours,confirmed_deadline,formal_quote_id)
 select project_id,user_id,project_code,project_title,project_description,subtotal_amount,tax_rate,tax_amount,total_amount,quoted_hours,confirmed_deadline,formal_quote_id from public.project_orders where project_id='20000000-0000-4000-8000-000000000001';
 raise exception 'FAILED: zero invoice accepted';exception when invalid_parameter_value then raise notice 'PASS: zero invoice rejected';end;
end $$;
select pg_temp.assert_true((public.csworks_trial_coupon_monthly(current_date,current_date)->0->>'redemptions')::integer=2,'monthly redemption total');
select pg_temp.assert_true((public.csworks_trial_coupon_monthly(current_date,current_date)->0->>'full_redemptions')::integer=1,'monthly full total');
select pg_temp.assert_true((public.csworks_trial_coupon_monthly(current_date,current_date)->0->>'partial_redemptions')::integer=1,'monthly partial total');
select pg_temp.assert_true((public.csworks_trial_coupon_monthly(current_date,current_date)->0->>'first_revenue_ex_tax')::integer=7000,'monthly first revenue net tax excluded');
select pg_temp.assert_true((public.csworks_trial_coupon_monthly(current_date,current_date)->0->>'repeat_revenue_ex_tax')::integer=10000,'monthly repeat revenue separate');
select pg_temp.assert_true((public.csworks_trial_coupon_monthly(current_date,current_date)->0->>'repeat_customers')::integer=1,'repeat order detected');
select pg_temp.assert_true(jsonb_array_length(public.csworks_trial_coupon_repeat_members(current_date,current_date))=2,'per-member repeat flags');

-- Existing CS Works order history also excludes a newly confirmed account.
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000007','ordered@example.test','{"company_name":"過去発注会社"}');
insert into public.projects(id,user_id,title,status) values
 ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','既存発注','ordered');
insert into public.project_orders(project_id,user_id,customer_company_name,subtotal_amount,tax_amount,total_amount)
 values('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','過去発注会社',3000,300,3300);
update auth.users set email_confirmed_at=clock_timestamp() where id='10000000-0000-4000-8000-000000000007';
select pg_temp.assert_true(not exists(select 1 from public.trial_coupon_grants where user_id='10000000-0000-4000-8000-000000000007'),'past CS Works orders exclude grant');

set local role authenticated;
do $$ begin
 begin update public.trial_coupon_grants set consumed_at=null;raise exception 'FAILED: direct grant update allowed';exception when insufficient_privilege then raise notice 'PASS: direct grant update denied';end;
end $$;
reset role;

rollback;
