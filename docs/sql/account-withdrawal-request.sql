-- 退会の意思を受け付ける。アカウント削除・ログイン停止は行わない。
-- 既存の問い合わせRLSを使い、件名と本文を同一トランザクションで保存。
begin;
create or replace function public.csworks_request_account_withdrawal(p_reason text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_thread uuid;
  v_message uuid;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if exists(select 1 from public.profiles where id=v_uid and role='admin') then
    raise exception 'admin_account_not_supported' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason,'')) > 1000 then raise exception 'reason_too_long' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('withdrawal:' || v_uid::text,0));
  select t.id,m.id into v_thread,v_message
    from public.support_threads t join public.support_messages m on m.thread_id=t.id
    where t.user_id=v_uid and t.subject='【退会申請】CS Worksアカウント'
      and t.status='open' and m.user_id=v_uid and m.sender_type='customer'
    order by m.created_at asc limit 1;
  if v_thread is not null then
    return jsonb_build_object('threadId',v_thread,'messageId',v_message,'alreadyRequested',true);
  end if;
  insert into public.support_threads(user_id,subject,status)
    values(v_uid,'【退会申請】CS Worksアカウント','open') returning id into v_thread;
  insert into public.support_messages(thread_id,user_id,sender_type,message)
    values(v_thread,v_uid,'customer',
      'CS Worksの退会を希望します。' || E'\n\n' ||
      '退会理由（任意）：' || coalesce(nullif(btrim(p_reason),''),'未回答') || E'\n\n' ||
      'この送信は退会申請です。アカウントは直ちには削除されず、運営から手続きについて案内を受けることを確認しました。')
    returning id into v_message;
  return jsonb_build_object('threadId',v_thread,'messageId',v_message,'alreadyRequested',false);
end;
$$;
revoke all on function public.csworks_request_account_withdrawal(text) from public, anon;
grant execute on function public.csworks_request_account_withdrawal(text) to authenticated;
commit;
