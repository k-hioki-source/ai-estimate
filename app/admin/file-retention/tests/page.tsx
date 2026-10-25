import FileRetentionAdminPage from '../page';
import RecoveryFixtureTestPanel from '../../../../components/cs-works/RecoveryFixtureTestPanel';

export const dynamic = 'force-dynamic';

export default function FileRetentionTestsPage() {
  return <>
    <FileRetentionAdminPage />
    <RecoveryFixtureTestPanel preview={process.env.VERCEL_ENV === 'preview'} />
  </>;
}
