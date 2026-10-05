'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import type { Database } from '../../../lib/supabase/database.types';

type Estimate = Database['public']['Tables']['estimates']['Row'] & { archived_at?: string | null };
type Profile = { id:string; company_name:string|null; contact_name:string|null; email:string|null };
type Project = Pick<Database['public']['Tables']['projects']['Row'],'id'|'estimate_id'|'project_code'|'status'>;

type EstimateWithData = Estimate & {
  customer?: Profile | null;
  image_url?: string | null;
  project?: Project | null;
};

function fmt(v:string|null){
  if(!v)return '―';
  return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
}
function production(v:string|null){return v==='photo_trace'?'写真・画像トレース':v==='reference_drawing'?'写真・図面・資料から作図':v==='cad_conversion'?'XVL・3DCADから作成':v||'未設定';}
function usage(v:string|null){return v==='manual'?'取扱説明書・マニュアル':v==='sales'?'販促・営業資料':v==='education'?'教育・安全教材':v||'未設定';}
function expression(v:string|null){return v==='line'?'白黒線画':v==='color'?'カラーイラスト':v==='real'?'リアルイラスト':v||'未設定';}

export default function AdminEstimatesPage(){
  const router=useRouter();
  const [estimates,setEstimates]=useState<EstimateWithData[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');

  useEffect(()=>{(async()=>{
    const supabase=getSupabaseBrowserClient();
    const {data:u}=await supabase.auth.getUser();
    if(!u.user){router.replace('/login');return}

    const {data:me,error:meErr}=await supabase.from('profiles').select('role').eq('id',u.user.id).single();
    if(meErr||!me||me.role!=='admin'){router.replace('/mypage');return}

    const {data:estimateData,error:estimateError}=await supabase
      .from('estimates')
      .select('*')
      .order('created_at',{ascending:false});

    if(estimateError){
      console.error('Admin estimate load error:',estimateError);
      setError('見積り一覧を取得できませんでした。');
      setLoading(false);
      return;
    }

    const rows=(estimateData??[]) as Estimate[];
    const userIds=Array.from(new Set(rows.map(e=>e.user_id)));
    let profiles:Profile[]=[];
    if(userIds.length){
      const {data:profileData,error:profileError}=await supabase
        .from('profiles')
        .select('id, company_name, contact_name, email')
        .in('id',userIds);
      if(profileError) console.error('Admin estimate profile load error:',profileError);
      else profiles=(profileData??[]) as Profile[];
    }

    const estimateIds=rows.map(e=>e.id);
    let projects:Project[]=[];
    if(estimateIds.length){
      const {data:projectData,error:projectError}=await supabase
        .from('projects')
        .select('id, estimate_id, project_code, status')
        .in('estimate_id',estimateIds);
      if(projectError) console.error('Admin estimate project load error:',projectError);
      else projects=(projectData??[]) as Project[];
    }

    const imageEntries=await Promise.all(
      rows.filter(e=>Boolean(e.image_path)).map(async e=>{
        const {data,error:imageError}=await supabase.storage
          .from('estimate-images')
          .createSignedUrl(e.image_path as string,60*60);
        if(imageError||!data?.signedUrl){
          console.error('Admin estimate image load error:',imageError);
          return null;
        }
        return [e.id,data.signedUrl] as const;
      })
    );
    const imageMap:Record<string,string>={};
    for(const entry of imageEntries){if(entry)imageMap[entry[0]]=entry[1]}

    setEstimates(rows.map(e=>({
      ...e,
      customer:profiles.find(p=>p.id===e.user_id)??null,
      image_url:imageMap[e.id]??null,
      project:projects.find(p=>p.estimate_id===e.id)??null
    })));
    setLoading(false);
  })()},[router]);

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return estimates;
    return estimates.filter(e=>[
      e.estimate_code,
      e.customer?.company_name,
      e.customer?.contact_name,
      e.customer?.email,
      production(e.production_method),
      usage(e.usage),
      expression(e.expression)
    ].some(v=>(v??'').toLowerCase().includes(q)));
  },[estimates,search]);

  if(loading)return <main className="authPage"><section className="authCard"><p>AI見積り一覧を読み込んでいます…</p></section></main>;

  return <main className="myPageShell">
    <header className="myPageHeader">
      <div><div className="authBrand">CS Works ADMIN</div><h1>AI見積り</h1></div>
      <div className="headerActions"><button className="secondaryButton" onClick={()=>router.push('/admin')}>案件管理へ戻る</button></div>
    </header>

    <section className="widePanel">
      <div className="sectionHead">
        <div><div className="authBrand">ESTIMATES</div><h2>AI見積り一覧</h2><p className="muted">保存されたAI概算見積りを画像付きで確認できます。</p></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="見積ID・会社名・担当者名で検索"/>
      </div>
      <p className="countText">全{estimates.length}件 ／ 表示{visible.length}件</p>
      {error?<div className="errorBox">{error}</div>:null}

      <div className="tableWrap">
        <table>
          <thead><tr><th>画像</th><th>見積ID</th><th>お客様</th><th>制作内容</th><th>点数</th><th>概算</th><th>日時</th><th>案件化</th></tr></thead>
          <tbody>
            {visible.map(e=><tr key={e.id}>
              <td>
                {e.image_url
                  ? <button className="thumbButton" type="button" onClick={()=>window.open(e.image_url!,'_blank','noopener,noreferrer')} title="画像を開く"><img className="thumb" src={e.image_url} alt="見積り参考画像"/></button>
                  : <div className="noImage">画像なし</div>}
              </td>
              <td><strong>{e.estimate_code}</strong><div className="sub">{e.status}</div></td>
              <td><strong>{e.customer?.company_name||'会社名未登録'}</strong><div className="sub">{e.customer?.contact_name||'―'}</div><div className="sub">{e.customer?.email||'―'}</div></td>
              <td><strong>{production(e.production_method)}</strong><div className="sub">{usage(e.usage)} ／ {expression(e.expression)}</div></td>
              <td>{e.quantity ?? 1}</td>
              <td><strong>{e.estimated_amount!=null?`${e.estimated_amount.toLocaleString()}円`:'個別見積り'}</strong><div className="sub">{e.estimated_hours!=null?`${e.estimated_hours}時間`:'―'}</div></td>
              <td>{fmt(e.created_at)}</td>
              <td>{e.project?<button type="button" className="projectLink" onClick={()=>router.push(`/admin/projects/${e.project!.id}`)}>{e.project.project_code} →</button>:<span className="notLinked">未案件化</span>}</td>
            </tr>)}
          </tbody>
        </table>
        {!visible.length?<div className="empty">該当する見積りはありません。</div>:null}
      </div>
    </section>

    <style jsx>{`
      .widePanel{box-sizing:border-box;width:100%;margin:28px 0 0;padding:30px 32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
      .sectionHead{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap}.sectionHead input{width:min(380px,100%)}.countText{margin:16px 0 0;color:#64748b;font-size:13px}
      .headerActions{display:flex;gap:8px}.secondaryButton{width:auto!important;padding:10px 14px!important;border:1px solid #dbe3ec!important;border-radius:10px!important;background:#fff!important;color:#0f172a!important;font-weight:800!important;cursor:pointer}
      .tableWrap{overflow-x:auto;margin-top:20px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:12px 8px;border-bottom:1px solid #e5eaf0;text-align:left;vertical-align:middle;overflow:hidden}th:nth-child(1){width:84px}th:nth-child(2){width:155px}th:nth-child(3){width:190px}th:nth-child(4){width:205px}th:nth-child(5){width:45px}th:nth-child(6){width:78px}th:nth-child(7){width:115px}th:nth-child(8){width:130px}th{background:#f8fafc;font-size:13px;color:#475569}td{font-size:13px}
      .thumbButton{display:block!important;width:72px!important;height:58px!important;padding:0!important;border:1px solid #dbe3ec!important;border-radius:9px!important;background:#fff!important;overflow:hidden!important;cursor:pointer}.thumb{display:block;width:100%;height:100%;object-fit:cover}.noImage{display:flex;width:72px;height:58px;align-items:center;justify-content:center;border:1px dashed #cbd5e1;border-radius:9px;background:#f8fafc;color:#94a3b8;font-size:11px}
      .sub{margin-top:4px;color:#64748b;font-size:11px;line-height:1.35}.projectLink{max-width:100%;width:auto!important;padding:7px 9px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #bfdbfe!important;border-radius:8px!important;background:#eff6ff!important;color:#1d4ed8!important;font-size:11px!important;font-weight:900!important;cursor:pointer}.notLinked{color:#94a3b8;font-size:12px}.empty{padding:28px;text-align:center;color:#64748b}
      @media(min-width:900px){:global(.myPageShell){max-width:1500px!important}}
      @media(max-width:700px){.widePanel{padding:20px 14px;border-radius:14px}.sectionHead input{width:100%}}
    `}</style>
  </main>
}
