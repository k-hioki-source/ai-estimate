'use client';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
export default function Analytics() {
 const pathname=usePathname();
 if (pathname.startsWith('/invite') || pathname.startsWith('/admin/intakes')) return null;
 return <><Script src="https://www.googletagmanager.com/gtag/js?id=G-9GPFX64DXX" strategy="afterInteractive"/><Script id="google-analytics" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-9GPFX64DXX');`}</Script></>;
}
