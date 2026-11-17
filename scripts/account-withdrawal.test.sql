-- 実DB用。全変更をロールバックし、メール送信APIは呼ばない。
begin;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
 values(current_setting('request.jwt.claim.sub')::uuid,
 'withdrawal-test-'||current_setting('request.jwt.claim.sub')||'@example.test',
 '{"company_name":"退会導線検証"}'::jsonb);
set local role authenticated;
do $$ declare a jsonb; b jsonb; own_uid text := auth.uid()::text;
begin
 begin
  perform public.csworks_submit_account_withdrawal('', '{}'::jsonb);
  raise exception 'missing confirmations accepted';
 exception when invalid_parameter_value then null; end;
 if has_function_privilege('authenticated','public.csworks_request_account_withdrawal(text)','execute') then raise exception 'legacy path available'; end if;
 a:=public.csworks_submit_account_withdrawal('','{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
 b:=public.csworks_submit_account_withdrawal('再送','{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
 if a->>'threadId'<>b->>'threadId' or b->>'alreadyRequested'<>'true' then raise exception 'idempotency failed'; end if;
 if (select count(*) from public.support_threads where subject='【退会申請】CS Worksアカウント')<>1 then raise exception 'thread count failed'; end if;
 if (select count(*) from public.support_messages where thread_id=(a->>'threadId')::uuid and message like '%未回答%')<>1 then raise exception 'optional reason failed'; end if;
 begin
  perform public.csworks_submit_account_withdrawal(repeat('x',1001),'{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
  raise exception 'length accepted';
 exception when invalid_parameter_value then null; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.support_threads where id=(a->>'threadId')::uuid) then raise exception 'RLS isolation failed'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.csworks_submit_account_withdrawal('','{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
  raise exception 'anonymous accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',own_uid,true);
 update public.profiles set newsletter_enabled=false where id=auth.uid();
 if not exists(select 1 from public.profiles where id=auth.uid() and newsletter_enabled=false) then raise exception 'newsletter update failed'; end if;
end $$;
reset role;
insert into public.projects(id,user_id,project_code,title,status)
 values(gen_random_uuid(),current_setting('request.jwt.claim.sub')::uuid,'WITHDRAWAL-TEST-'||gen_random_uuid(),'退会制限検証','invoiced');
set local role authenticated;
do $$ begin
 begin
  perform public.csworks_submit_account_withdrawal('', '{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
  raise exception 'unpaid project accepted';
 exception when raise_exception then
  if sqlerrm <> 'active_projects_exist' then raise; end if;
 end;
end $$;
reset role;
update public.projects set status='completed',completed_at=null where user_id=current_setting('request.jwt.claim.sub')::uuid;
set local role authenticated;
do $$ begin
 begin
  perform public.csworks_submit_account_withdrawal('', '{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
  raise exception 'missing completion timestamp accepted';
 exception when raise_exception then
  if sqlerrm <> 'active_projects_exist' then raise; end if;
 end;
end $$;
reset role;
update public.projects set completed_at=now() where user_id=current_setting('request.jwt.claim.sub')::uuid;
set local role authenticated;
select public.csworks_submit_account_withdrawal('', '{"noActiveProjects":true,"downloaded":true,"deletion":true,"process":true}'::jsonb);
reset role;
select 'PASS: confirmations, unpaid blocking, completed timestamp required,  optional reason, idempotency, length, RLS, authentication, newsletter; rolled back' as result;
rollback;
