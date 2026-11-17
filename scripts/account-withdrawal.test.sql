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
 a:=public.csworks_request_account_withdrawal('');
 b:=public.csworks_request_account_withdrawal('再送');
 if a->>'threadId'<>b->>'threadId' or b->>'alreadyRequested'<>'true' then raise exception 'idempotency failed'; end if;
 if (select count(*) from public.support_threads where subject='【退会申請】CS Worksアカウント')<>1 then raise exception 'thread count failed'; end if;
 if (select count(*) from public.support_messages where thread_id=(a->>'threadId')::uuid and message like '%未回答%')<>1 then raise exception 'optional reason failed'; end if;
 begin
  perform public.csworks_request_account_withdrawal(repeat('x',1001));
  raise exception 'length accepted';
 exception when invalid_parameter_value then null; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.support_threads where id=(a->>'threadId')::uuid) then raise exception 'RLS isolation failed'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.csworks_request_account_withdrawal('');
  raise exception 'anonymous accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',own_uid,true);
 update public.profiles set newsletter_enabled=false where id=auth.uid();
 if not exists(select 1 from public.profiles where id=auth.uid() and newsletter_enabled=false) then raise exception 'newsletter update failed'; end if;
end $$;
reset role;
select 'PASS: optional reason, idempotency, length, RLS, authentication, newsletter; rolled back' as result;
rollback;
