/**
 * In-memory retention policy verification fixtures.
 * No database writes, storage calls, notifications, or real project IDs.
 */
type FileType = 'review' | 'revision' | 'delivery' | 'customer';
type Fixture = {
  name: string; completedDaysAgo: number; held: boolean;
  files: { type: FileType; uploadedDaysAgo: number }[];
};
const cases: Fixture[] = [
  { name: '30日超過の納品ファイル', completedDaysAgo: 31, held: false, files: [{ type: 'delivery', uploadedDaysAgo: 32 }] },
  { name: '削除保留の案件', completedDaysAgo: 31, held: true, files: [{ type: 'delivery', uploadedDaysAgo: 32 }] },
  { name: '顧客支給資料', completedDaysAgo: 31, held: false, files: [{ type: 'customer', uploadedDaysAgo: 32 }] },
  { name: '完了後に追加された納品ファイル', completedDaysAgo: 31, held: false, files: [{ type: 'delivery', uploadedDaysAgo: 2 }] },
  { name: '完了29日の納品ファイル', completedDaysAgo: 29, held: false, files: [{ type: 'delivery', uploadedDaysAgo: 30 }] },
];
const allowed = new Set<FileType>(['review', 'revision', 'delivery']);
export function verifyRetentionFixtures() {
  const actual = cases.map(item => {
    const eligible = item.files.filter(file =>
      item.completedDaysAgo >= 30 &&
      !item.held &&
      allowed.has(file.type) &&
      file.uploadedDaysAgo >= item.completedDaysAgo
    ).length;
    return { caseName: item.name, eligible, held: item.held };
  });
  const expected = [1, 0, 0, 0, 0];
  return {
    passed: actual.every((item, index) => item.eligible === expected[index]),
    cases: actual.map((item, index) => ({ ...item, expected: expected[index], passed: item.eligible === expected[index] })),
    fixtureOnly: true,
    realFilesChecked: 0,
    deletedFiles: 0,
  };
}
