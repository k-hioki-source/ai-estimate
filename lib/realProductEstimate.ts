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

export type RealProductComplexity = {
  partDensity?: number; lineDifficulty?: number; structureComplexity?: number;
  difficultyScore?: number; coloringComplexity?: number;
  realLineHours?: number; realColorHours?: number;
};
const score = (v: number | undefined, fallback = 50) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback;
const half = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);

// Independent shape and finish rubrics. These anchors describe workload,
// never a lookup by product name or a universal total-hour floor/ceiling.
export function estimateRealProductSteps(input: RealProductComplexity) {
  // A single high line score must not promote the whole product. Use the
  // middle of the three visual scores, rather than their maximum.
  const ordered = [score(input.partDensity), score(input.lineDifficulty), score(input.structureComplexity)].sort((a,b) => a-b);
  const shape = ordered[1];
  // Generic gloss/shadow language cannot independently create a high-density
  // finishing scope for a simple photo-aligned exterior.
  const finish = Math.min(score(input.coloringComplexity, score(input.difficultyScore)), shape + 5);
  const lineHours = shape <= 25 ? 1.5 : shape <= 40 ? 2 : shape <= 60 ? 3 : shape <= 75 ? 5 : shape <= 90 ? 7 : 10;
  const colorHours = finish <= 25 ? 2 : finish <= 40 ? 3 : finish <= 60 ? 5 : finish <= 75 ? 8 : finish <= 90 ? 12 : 18;
  const valid = (v: number | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const hasAiSteps = valid(input.realLineHours) && valid(input.realColorHours);
  const rawAiLineHours = hasAiSteps ? half(input.realLineHours!) : undefined;
  const rawAiColorHours = hasAiSteps ? half(input.realColorHours!) : undefined;
  const aiLineHours = Math.min(rawAiLineHours ?? lineHours, lineHours);
  const aiColorHours = Math.min(rawAiColorHours ?? colorHours, colorHours);
  const corrected = hasAiSteps && (aiLineHours !== rawAiLineHours || aiColorHours !== rawAiColorHours);
  return { lineHours, colorHours, hours: lineHours + colorHours,
    aiLineHours, aiColorHours, rawAiLineHours, rawAiColorHours, corrected, aiHours: aiLineHours + aiColorHours, hasAiSteps };
}

