import { hasRequestedAngleChange } from './estimateScope';

// A photo-aligned exterior product illustration is a different scope from
// designing a new angle, an internal diagram or a multi-product composition.
export function isPhotoAlignedRealProduct(input: {
  sourceType: string; usage: string; style: string; notes?: string;
  isIndustrialProduct?: boolean; isExplodedView?: boolean;
  hasLeaderLines?: boolean; hasPartNumbers?: boolean;
}) {
  if (input.style !== 'real' || input.usage !== 'sales') return false;
  if (!['photo_trace', 'reference_drawing'].includes(input.sourceType)) return false;
  const notes = (input.notes || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (input.sourceType !== 'photo_trace' && !/写真/.test(notes)) return false;
  if (!input.isIndustrialProduct && !/製品|工具|機械|装置|カメラ|自動車|車両/.test(notes)) return false;
  if (input.isExplodedView || input.hasLeaderLines || input.hasPartNumbers || hasRequestedAngleChange(notes)) return false;
  // Ignore explicit exclusions such as "背景なし"; do not infer extra scope
  // from an AI's generic mention of curves, materials or shadows.
  const positive = notes.replace(/(?:背景|断面|分解図?|内部構造|複数製品)(?:は|を|も)?(?:なし|不要|含めない|描かない|必要ない)/g, '');
  return !/概念|構成図|システム図|フロー|説明図|分解|断面|内部|透過|背景|複数|横並び|組み合わせ|組合せ|オリジナル|新規形状|写真にない|写真と異なる|カバーを外|別状態|[2-9](?:台|両|製品)|3d|cg|アニメ|動画/i.test(positive);
}

export const REAL_PRODUCT_HOURS = { min: 14, standard: 16, max: 18 } as const;
export function calibrateRealProductHours(hours: number) {
  return hours >= REAL_PRODUCT_HOURS.min && hours <= REAL_PRODUCT_HOURS.max
    ? hours
    : REAL_PRODUCT_HOURS.standard;
}
