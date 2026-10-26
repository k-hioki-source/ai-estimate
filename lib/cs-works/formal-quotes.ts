export const formalQuotesEnabled = process.env.NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES === 'true';
export type QuoteItem = { item_key: string; number: string; name: string; description: string; amount: number; hours: number };
export type FormalQuote = { id: string; project_id: string; revision: number; edit_version: number; state: 'draft' | 'presented' | 'superseded' | 'accepted'; title: string; description: string | null; deadline: string; subtotal: number; hours: number; created_at: string; presented_at?: string; customer?: Record<string, string | null>; items: QuoteItem[] };
export type QuoteContext = { current: FormalQuote | null; draft: FormalQuote | null; history: FormalQuote[] };
// Integer yen, hundredth-hour precision. Keep tax-inclusive total within existing int4 documents.
export function quoteTotals(items: QuoteItem[]) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 200) throw Error('明細を1〜200点登録してください。');
  const keys = new Set<string>(), numbers = new Set<string>(); let subtotal = 0, hundredths = 0;
  for (const x of items) {
    if (!x || !/^[0-9a-f-]{36}$/i.test(x.item_key) || keys.has(x.item_key) || typeof x.number !== 'string' || !x.number.trim() || x.number.length > 40 || numbers.has(x.number.trim()) || typeof x.name !== 'string' || !x.name.trim() || x.name.length > 200 || typeof x.description !== 'string' || x.description.length > 2000 || !Number.isSafeInteger(x.amount) || x.amount < 0 || x.amount > 1800000000 || !Number.isFinite(x.hours) || x.hours < 0 || x.hours > 100000 || Math.abs(x.hours * 100 - Math.round(x.hours * 100)) > 0.000001) throw Error('明細の番号・名前・金額・工数を確認してください。');
    keys.add(x.item_key); numbers.add(x.number.trim()); subtotal += x.amount; hundredths += Math.round(x.hours * 100);
  }
  if (subtotal > 1800000000 || hundredths > 100000000) throw Error('見積り合計が上限を超えています。');
  const tax = Math.floor(subtotal / 10);
  return { subtotal, hours: hundredths / 100, tax, total: subtotal + tax };
}
