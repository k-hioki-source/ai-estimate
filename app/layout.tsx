import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: '製造業向けイラストのAI自動見積り｜製品説明図・分解図・取扱説明書対応',
  description:
    '参考画像をアップロードするだけで、テクニカルイラスト制作の概算費用をAIが自動算出。取扱説明書、パーツカタログ、販促用イラストに対応。',
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-9GPFX64DXX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-9GPFX64DXX');
          `}
        </Script>

        {children}
      </body>
    </html>
  );
}
