import type { Metadata } from 'next';
import Script from 'next/script';
import Analytics from '@/components/Analytics';
import './globals.css';

export const metadata: Metadata = {
  title: 'CS Works｜オンラインテクニカルイラスト依頼サイト｜クリエイトサポート',
  description:
    'CS Worksは、クリエイトサポートへのイラスト・CG制作依頼を、概算見積りから正式見積り、発注、制作確認、納品までオンラインで進められるサービスです。',
  keywords: [
    'AIイラスト見積り',
    'イラスト見積り',
    'テクニカルイラスト',
    'イラスト制作費',
    '取扱説明書イラスト',
    'パーツカタログイラスト',
  ],
  openGraph: {
    title: 'AI自動イラスト見積り｜画像から概算費用を即時算出',
    description:
      '画像をアップロードするだけで、テクニカルイラスト制作の概算費用をその場で確認できます。',
    url: 'https://estimate.create-support.co.jp/',
    siteName: 'クリエイトサポート AI自動イラスト見積り',
    images: [
      {
        url: 'https://estimate.create-support.co.jp/ogp.jpg',
        width: 1200,
        height: 630,
        alt: 'AI自動イラスト見積り',
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI自動イラスト見積り｜画像から概算費用を即時算出',
    description:
      '参考画像からテクニカルイラスト制作費をAIが自動算出。',
    images: ['https://estimate.create-support.co.jp/ogp.jpg'],
  },
  alternates: {
    canonical: 'https://estimate.create-support.co.jp/',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Script id="protect-invitation-fragment" strategy="beforeInteractive">{`if(location.pathname==='/invite'&&/^[A-Za-z0-9_-]{43}$/.test(location.hash.slice(1))){try{sessionStorage.setItem('csworks.pendingInvitation',JSON.stringify({token:location.hash.slice(1),until:Date.now()+604800000}));history.replaceState(null,'','/invite');}catch(e){}}`}</Script>
        <Analytics />

        {children}
      </body>
    </html>
  );
}
