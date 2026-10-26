import { notFound } from 'next/navigation';

// Historical test APIs are disabled separately; hiding the page is not the security boundary.
export default function FileRetentionTestsPage() {
  notFound();
}
