'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

type Profile = {
  company_name: string;
  department_name: string;
  contact_name: string;
  phone: string;
  postal_code: string;
  address: string;
};

const emptyProfile: Profile = {
  company_name: '',
  department_name: '',
  contact_name: '',
  phone: '',
  postal_code: '',
  address: '',
};

export default function MyPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadMyPage() {
      const supabase = getSupabaseBrowserClient();

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/login');
        return;
      }

      setUser(userData.user);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(
          'company_name, department_name, contact_name, phone, postal_code, address'
        )
        .eq('id', userData.user.id)
        .single();

      if (profileData) {
  const savedProfile = profileData as Profile;

  setProfile({
    company_name: savedProfile.company_name ?? '',
    department_name: savedProfile.department_name ?? '',
    contact_name: savedProfile.contact_name ?? '',
    phone: savedProfile.phone ?? '',
    postal_code: savedProfile.postal_code ?? '',
    address: savedProfile.address ?? '',
  });
}

      if (profileError) {
        console.error('Profile load error:', profileError);
      }

      setLoading(false);
    }

    loadMyPage();
  }, [router]);

  function updateProfile(field: keyof Profile, value: string) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();

    if (!user) return;

    setSaving(true);
    setMessage('');
    setError('');

    const supabase = getSupabaseBrowserClient();

    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        company_name: profile.company_name,
        department_name: profile.department_name,
        contact_name: profile.contact_name,
        phone: profile.phone,
        postal_code: profile.postal_code,
        address: profile.address,
      })
      .eq('id', user.id);

    setSaving(false);

    if (saveError) {
      console.error('Profile save error:', saveError);
      setError('お客様情報を保存できませんでした。');
      return;
    }

    setMessage('お客様情報を保存しました。');
  }

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="authPage">
        <section className="authCard">
          <p>My Pageを読み込んでいます…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="myPageShell">
      <header className="myPageHeader">
        <div>
          <div className="authBrand">CS Works</div>
          <h1>My Page</h1>
        </div>

        <button className="logoutButton" onClick={logout}>
          ログアウト
        </button>
      </header>

      <section className="welcomeCard">
        <span className="statusDot" /> ログイン中
        <h2>
          {profile.contact_name
            ? `${profile.contact_name} 様`
            : 'CS Worksへようこそ'}
        </h2>
        <p>{user?.email}</p>
      </section>

      <div className="myPageGrid">
        <section className="dashboardCard">
          <div className="dashboardIcon">AI</div>
          <h3>AI概算見積り</h3>
          <p>新しい制作内容をAIで概算見積りできます。</p>
          <Link className="dashboardLink" href="/">
            新しい見積りを作成 →
          </Link>
        </section>

        <section className="dashboardCard dashboardDisabled">
          <div className="dashboardIcon">見積</div>
          <h3>見積り履歴</h3>
          <p>
            次の開発段階で、AI見積りをこのMy Pageに保存できるようにします。
          </p>
          <span>準備中</span>
        </section>

        <section className="dashboardCard dashboardDisabled">
          <div className="dashboardIcon">案件</div>
          <h3>プロジェクト</h3>
          <p>正式依頼・制作状況・納品を管理する機能を追加予定です。</p>
          <span>準備中</span>
        </section>
      </div>

      <section className="authCard" style={{ margin: '28px auto 0', maxWidth: '100%' }}>
        <div className="authBrand">ACCOUNT</div>
        <h2>お客様情報</h2>

        <p className="muted">
          正式見積りや制作依頼に使用する情報を登録できます。
        </p>

        <form onSubmit={saveProfile} className="authForm">
          <div>
            <label>会社名</label>
            <input
              type="text"
              value={profile.company_name}
              onChange={(e) => updateProfile('company_name', e.target.value)}
              placeholder="株式会社クリエイトサポート"
            />
          </div>

          <div>
            <label>部署名</label>
            <input
              type="text"
              value={profile.department_name}
              onChange={(e) => updateProfile('department_name', e.target.value)}
              placeholder="企画部"
            />
          </div>

          <div>
            <label>担当者名</label>
            <input
              type="text"
              value={profile.contact_name}
              onChange={(e) => updateProfile('contact_name', e.target.value)}
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <label>メールアドレス</label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
            />
            <small>ログインに使用しているメールアドレスです。</small>
          </div>

          <div>
            <label>電話番号</label>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => updateProfile('phone', e.target.value)}
              placeholder="0565-00-0000"
            />
          </div>

          <div>
            <label>郵便番号</label>
            <input
              type="text"
              value={profile.postal_code}
              onChange={(e) => updateProfile('postal_code', e.target.value)}
              placeholder="000-0000"
            />
          </div>

          <div>
            <label>住所</label>
            <input
              type="text"
              value={profile.address}
              onChange={(e) => updateProfile('address', e.target.value)}
              placeholder="愛知県..."
            />
          </div>

          {error && <div className="errorBox">{error}</div>}

          {message && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#eefbf3',
                color: '#16733b',
                fontWeight: 700,
              }}
            >
              {message}
            </div>
          )}

          <button className="primaryButton" disabled={saving}>
            {saving ? '保存中…' : 'お客様情報を保存'}
          </button>
        </form>
      </section>
    </main>
  );
}
