import Link from 'next/link';
import CSWorksAuthLinks from './CSWorksAuthLinks';

export default function HeaderLinks() {
  return (
    <div className="headerRight">
      <nav className="headerLinks">
        <a href="https://www.create-support.co.jp/" target="_blank" rel="noopener noreferrer">会社サイト</a>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy-policy">プライバシーポリシー</Link>
      </nav>
      <CSWorksAuthLinks />
    </div>
  );
}
