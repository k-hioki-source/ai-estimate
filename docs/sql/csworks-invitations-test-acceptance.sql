-- Existing test identities, simulated JWT database claims; no Auth login or email.
-- Every test write is rolled back.
begin;
create temp table invitation_test_results(name text, passed boolean);
grant insert,select on invitation_test_results to authenticated,service_role;
select set_config('test.customer_email',(select email from auth.users where id='14ccb4e9-0433-4243-9b5d-df9c048d2f88'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','1f2cd06c-34d0-4231-88db-e03840cdae89',true);
do $$ declare i jsonb; begin
 i:=public.csworks_save_intake(null,0,jsonb_build_object('company_name','Invitation integration test','contact_name','Test customer','email',current_setting('test.customer_email'),'title','Invitation integration rollback test','description','Synthetic test data','production_category','photo_trace','quote_deadline','2026-12-01','quote_items',jsonb_build_array(jsonb_build_object('item_key',gen_random_uuid(),'number','01','name','Test illustration','description','','amount',9000,'hours',3))));
 perform set_config('test.intake_id',i->>'id',true);
 perform set_config('test.project_id',i->>'project_id',true);
 if exists(select 1 from public.projects where id=(i->>'project_id')::uuid) then raise exception 'Premature project'; end if;
 insert into invitation_test_results values('admin creates private intake',true);
end $$;
reset role;
set local role service_role;
do $$ declare v jsonb; begin
 v:=public.csworks_issue_invitation(current_setting('test.intake_id')::uuid,1,'1f2cd06c-34d0-4231-88db-e03840cdae89',repeat('a',64));
 perform public.csworks_finish_invitation((v->>'id')::uuid,'captured',null);
 insert into invitation_test_results values('server issues captured invitation without email',true);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e3f57ba9-a0ed-4283-965d-d3acc4a25d3f',true);
do $$ begin
 if exists(select 1 from public.project_intakes) then raise exception 'Intake leak'; end if;
 if public.csworks_accept_invitation(repeat('a',64))->>'error' is distinct from 'invalid_invitation' then raise exception 'Wrong customer accepted'; end if;
 begin perform public.csworks_list_intakes(); raise exception 'Customer list succeeded'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.project_invitations; raise exception 'Token leak'; exception when insufficient_privilege then null; end;
 begin perform public.csworks_save_intake(null,0,'{}'); raise exception 'Customer create succeeded'; exception when insufficient_privilege then null; end;
 insert into invitation_test_results values('customer cannot read private intakes or tokens',true),('wrong customer cannot accept',true),('customer cannot create intakes',true);
end $$;
reset role;
update public.project_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where intake_id=current_setting('test.intake_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','14ccb4e9-0433-4243-9b5d-df9c048d2f88',true);
do $$ begin
 if public.csworks_accept_invitation(repeat('a',64))->>'error' is distinct from 'invalid_invitation' then raise exception 'Expired accepted'; end if;
 insert into invitation_test_results values('expired invitation rejected',true);
end $$;
reset role;
update public.project_invitations set expires_at=now()+interval '1 day',revoked_at=now() where intake_id=current_setting('test.intake_id')::uuid;
set local role authenticated;
do $$ begin
 if public.csworks_accept_invitation(repeat('a',64))->>'error' is distinct from 'invalid_invitation' then raise exception 'Revoked accepted'; end if;
 insert into invitation_test_results values('revoked invitation rejected',true);
end $$;
reset role;
update public.project_invitations set revoked_at=null where intake_id=current_setting('test.intake_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','14ccb4e9-0433-4243-9b5d-df9c048d2f88',true);
do $$ declare r jsonb; p public.projects%rowtype; o public.project_orders%rowtype; begin
 r:=public.csworks_accept_invitation(repeat('a',64));
 if r->>'projectId' is distinct from current_setting('test.project_id') then raise exception 'Acceptance failed: %',r; end if;
 select * into strict p from public.projects where id=current_setting('test.project_id')::uuid;
 if p.user_id<>auth.uid() or p.quoted_amount<>9000 or p.status<>'quote_presented' then raise exception 'Wrong terms'; end if;
 if exists(select 1 from public.project_orders where project_id=p.id) then raise exception 'Premature order'; end if;
 insert into invitation_test_results values('confirmed customer accepts with fixed owner and terms',true),('acceptance does not place order',true);
 if public.csworks_accept_invitation(repeat('a',64))->>'error' is distinct from 'invalid_invitation' then raise exception 'Replay succeeded'; end if;
 insert into invitation_test_results values('replay rejected',true);
 perform public.csworks_order_quote(p.id,p.formal_quote_id,gen_random_uuid());
 select * into strict o from public.project_orders where project_id=p.id;
 if o.total_amount<>9900 or o.formal_quote_id<>p.formal_quote_id then raise exception 'Wrong order'; end if;
 insert into invitation_test_results values('explicit formal order totals 9900',true);
end $$;
select set_config('request.jwt.claim.sub','e3f57ba9-a0ed-4283-965d-d3acc4a25d3f',true);
do $$ begin
 if exists(select 1 from public.projects where id=current_setting('test.project_id')::uuid) then raise exception 'Project leak'; end if;
 if exists(select 1 from public.project_quotes where project_id=current_setting('test.project_id')::uuid) then raise exception 'Quote leak'; end if;
 insert into invitation_test_results values('other customer cannot read accepted project or quote',true);
end $$;
reset role;
select * from invitation_test_results;
rollback;

