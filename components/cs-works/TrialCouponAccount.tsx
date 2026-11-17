'use client';
import {useEffect,useState} from 'react';
import {getSupabaseBrowserClient} from '../../lib/supabase/client';
import {trialCouponEnabled,trialCouponRequest,type TrialCouponStatus} from '../../lib/cs-works/trial-coupon-client';
import {TRIAL_COUPON_COPY} from '../../lib/cs-works/trial-coupon.mjs';
export function TrialCouponSession() {
 useEffect(()=>{
  if(!trialCouponEnabled)return;
  const db=getSupabaseBrowserClient();let active=true,last='';
  const send=(id?:string)=>{if(!active||!id||id===last)return;last=id;void trialCouponRequest('',true).catch(()=>{last='';});};
  void db.auth.getSession().then(({data})=>send(data.session?.user.id));
  const {data}=db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>send(session?.user.id),0);});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[]);
 return null;
}
export default function TrialCouponAccount() {
 const [state,setState]=useState<TrialCouponStatus|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!trialCouponEnabled)return;let active=true;trialCouponRequest<TrialCouponStatus>().then(s=>{if(active)setState(s);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 if(!trialCouponEnabled)return null;
 if(error)return <p role="alert">{error}</p>;
 if(!state?.granted)return null;
 return <section style={{padding:20,margin:'16px 0',border:'1px solid #bfdbfe',borderRadius:12,background:'#eff6ff'}}>
  <h2>初回お試しクーポン</h2>
  <p>{state.consumed?'初回お試しクーポンは利用済みです。':state.available?TRIAL_COUPON_COPY.granted:'クーポンは現在ご利用いただけません。'}</p>
  {state.available&&<p>複数案件がある場合は、先に発注が確定した案件に適用されます。</p>}
 </section>;
}
