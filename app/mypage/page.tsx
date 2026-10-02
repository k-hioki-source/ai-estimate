'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function MyPage(){
 const router=useRouter(); const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true);
 useEffect(()=>{const supabase=getSupabaseBrowserClient(); supabase.auth.getUser().then(({data})=>{if(!data.user){router.replace('/login');return;} setUser(data.user);setLoading(false);});},[router]);
 async function logout(){await getSupabaseBrowserClient().auth.signOut();router.replace('/');router.refresh();}
 if(loading) return <main className="authPage"><section className="authCard"><p>My Pageを読み込んでいます…</p></section></main>;
 return <main className="myPageShell"><header className="myPageHeader"><div><div className="authBrand">CS Works</div><h1>My Page</h1></div><button className="logoutButton" onClick={logout}>ログアウト</button></header>
   <section className="welcomeCard"><span className="statusDot" /> ログイン中<h2>CS Worksへようこそ</h2><p>{user?.email}</p></section>
   <div className="myPageGrid"><section className="dashboardCard"><div className="dashboardIcon">AI</div><h3>AI概算見積り</h3><p>新しい制作内容をAIで概算見積りできます。</p><Link className="dashboardLink" href="/">新しい見積りを作成 →</Link></section>
   <section className="dashboardCard dashboardDisabled"><div className="dashboardIcon">見積</div><h3>見積り履歴</h3><p>次の開発段階で、AI見積りをこのMy Pageに保存できるようにします。</p><span>準備中</span></section>
   <section className="dashboardCard dashboardDisabled"><div className="dashboardIcon">案件</div><h3>プロジェクト</h3><p>正式依頼・制作状況・納品を管理する機能を追加予定です。</p><span>準備中</span></section></div>
 </main>;
}
