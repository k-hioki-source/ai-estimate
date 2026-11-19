import Link from 'next/link';
import CSWorksAuthLinks from './CSWorksAuthLinks';

export default function HeaderLinks({ showEstimateExamples = false }: { showEstimateExamples?: boolean }) {
  return (
    <div className="headerRight">
      <nav className="headerLinks">
        {showEstimateExamples && <Link href="/estimate/examples">AI見積り事例</Link>}
        <a href="https://www.create-support.co.jp/" target="_blank" rel="noopener noreferrer">会社サイト</a>
        <a href="https://www.create-support.co.jp/cs-works/cs-works-customer-manual.html" target="_blank" rel="noopener noreferrer">ご利用ガイド</a>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy-policy">プライバシーポリシー</Link>
      </nav>
      <CSWorksAuthLinks />
    </div>
  );
}
