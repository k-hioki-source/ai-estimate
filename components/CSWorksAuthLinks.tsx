'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

export default function CSWorksAuthLinks() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="csAuthLinks">
      <span className="csWorksLabel">CS Works</span>
      {user ? (
        <Link href="/mypage" className="csAuthPrimary">My Page</Link>
      ) : (
        <>
          <Link href="/login" className="csAuthLink">ログイン</Link>
          <Link href="/signup" className="csAuthPrimary">無料会員登録</Link>
        </>
      )}
    </div>
  );
}
