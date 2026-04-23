import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'イラスト制作のAI概算見積り',
  description: '参考画像と条件を入力するだけで、イラスト制作の概算金額をその場で確認できます。'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
