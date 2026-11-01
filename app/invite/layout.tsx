import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'CS Works 招待', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default function InviteLayout({ children }: { children: React.ReactNode }) { return children; }
