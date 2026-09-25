export type MasterEstimateInput = {
  sourceType: string;
  usage: string;
  style: string;
  quantity: number;
  notes?: string;
  workType?: string;
  difficultyScore?: number;
  partDensity?: number;
  lineDifficulty?: number;
  structureComplexity?: number;
  isExplodedView?: boolean;
  hasLeaderLines?: boolean;
  hasPartNumbers?: boolean;
  isIndustrialProduct?: boolean;
  aiSummary?: string;
};

type Adjustment = { key: string; label: string; hours: number };

type MasterCategory = {
  key: string;
  label: string;
  baseHours: number;
  reason: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/ｄ/g, 'd')
    .replace(/Ｄ/g, 'd');
}

function chooseCategory(input: MasterEstimateInput, text: string): MasterCategory {
  const style = input.style;
  const workType = input.workType || '';
  const sourceType = input.sourceType;
  const dense = (input.partDensity || 0) >= 70 || (input.lineDifficulty || 0) >= 70;

  if (includesAny(text, ['cgアニメーション', '3dcgアニメーション', '3dアニメーション'])) {
    return { key: 'cg_animation', label: 'CGアニメーション', baseHours: 24, reason: 'CADあり・10秒程度のCGアニメーション基準' };
  }
  if (includesAny(text, ['2dアニメーション', 'アニメーション制作']) && !text.includes('3d')) {
    return { key: '2d_animation', label: '2Dアニメーション', baseHours: 8, reason: '作成済みイラストを使う10秒程度の2Dアニメーション基準' };
  }
  if (includesAny(text, ['3dcg', '3d cg', 'レンダリング', '製品cg'])) {
    if (includesAny(text, ['モデリング', '写真から3d', '図面から3d', '新規モデル'])) {
      return { key: '3dcg_modeling', label: '3DCG・モデリング', baseHours: 24, reason: '写真・図面から新規モデリング＋CG1カット基準' };
    }
    if (includesAny(text, ['透過', '内部構造', '構造説明'])) {
      return { key: '3dcg_structure', label: '3DCG・構造説明', baseHours: 18, reason: 'CADから外装透過・内部部品強調CG基準' };
    }
    return { key: '3dcg_cad', label: '3DCG・CADあり', baseHours: 12, reason: '支給CAD整理＋マテリアル設定＋CG1カット基準' };
  }
  if (workType === '3d_conversion') {
    return { key: '3dcg_modeling', label: '3DCG・モデリング', baseHours: 24, reason: '2D/PDF図面から立体構造を再構築する基準' };
  }
  if (includesAny(text, ['特許', '意匠図', '技術図面'])) {
    return { key: 'patent', label: '特許・技術図面', baseHours: 6, reason: '写真・資料からモノクロ技術図面1図の基準' };
  }
  if (workType === 'concept_diagram' || includesAny(text, ['サイエンス', '概念図', 'システム図', 'フロー図'])) {
    return { key: 'concept', label: 'サイエンス・概念図', baseHours: 12, reason: '技術内容を理解して流れ・構造を説明する1図の基準' };
  }
  if (input.isExplodedView || includesAny(text, ['分解図', '分解状態', '爆発図'])) {
    if (dense || includesAny(text, ['30部品', '40部品', '50部品', '部品多数', '複雑'])) {
      return { key: 'exploded_complex', label: '複雑な分解図', baseHours: 6, reason: '30〜50部品程度の複雑な分解図基準' };
    }
    return { key: 'exploded', label: '分解図', baseHours: 3, reason: '10部品程度の標準分解図基準' };
  }
  if (includesAny(text, ['車体透過', '自動車構造', 'バッテリー', 'モーター']) && includesAny(text, ['車', '車両', '自動車', 'ev'])) {
    return { key: 'vehicle_structure', label: '自動車構造図', baseHours: 5, reason: '車体透過＋主要部品配置の自動車構造図基準' };
  }
  if (includesAny(text, ['自動車', '車両', 'トラック', 'バス']) && style === 'line') {
    return { key: 'vehicle_line', label: '自動車線画', baseHours: 3, reason: '車両外観1カットの取説品質線画基準' };
  }
  if (includesAny(text, ['ポンチ絵', 'ラフ', '手描き指示']) && sourceType === 'reference_drawing') {
    return { key: 'rough_drawing', label: 'ポンチ絵から作図', baseHours: 8, reason: '手描き指示＋写真から整ったイラストにする基準' };
  }
  if (includesAny(text, ['写真にない', 'カバーを外', '別状態', '見えない部分']) ||
      (sourceType === 'reference_drawing' && includesAny(text, ['新規作図', '描き起こし', '別アングル']))) {
    return { key: 'new_state', label: '写真にない状態を作図', baseHours: 8, reason: '複数写真・指示から写真にない状態を新規作図する基準' };
  }
  if (style === 'real' || workType === 'realistic_illustration') {
    return { key: 'real', label: 'リアルイラスト', baseHours: 10, reason: '質感・光沢・陰影まで表現するリアルイラスト基準' };
  }
  if (style === 'color') {
    return { key: 'color', label: 'カラーイラスト', baseHours: 4, reason: '製品写真を基にした標準カラーイラスト基準' };
  }
  if (includesAny(text, ['断面', '透過', '内部構造', 'カットモデル'])) {
    return { key: 'structure', label: '構造説明', baseHours: 6, reason: '外装透過・一部カットで内部構造を説明する基準' };
  }
  if (input.usage === 'manual' && sourceType === 'cad_conversion') {
    return { key: 'manual_cad', label: '取説イラスト・CAD', baseHours: 2.5, reason: 'CAD/XVLから不要部品を整理する取説線画基準' };
  }
  if (input.usage === 'manual' && (includesAny(text, ['手', '操作', '作業者', '人物']) || sourceType === 'reference_drawing')) {
    return { key: 'manual', label: '取説イラスト', baseHours: 2.5, reason: '写真・既存資料から手・製品・操作状態を作図する基準' };
  }
  if (sourceType === 'photo_trace' && dense) {
    return { key: 'photo_complex', label: '写真トレース・複雑', baseHours: 4, reason: '細部の多い機械・製品の写真トレース基準' };
  }
  return { key: 'photo', label: '写真トレース', baseHours: 1.5, reason: '工業製品1点・背景なし・形状変更なしの写真トレース基準' };
}

export function calculateMasterEstimate(input: MasterEstimateInput) {
  const text = normalize(`${input.notes || ''} ${input.aiSummary || ''}`);
  const category = chooseCategory(input, text);
  const adjustments: Adjustment[] = [];
  const add = (key: string, label: string, hours: number, condition: boolean) => {
    if (condition) adjustments.push({ key, label, hours });
  };

  // 基準カテゴリに既に含まれる要素は二重加算しない。
  const categoryIncludesPerson = ['manual', 'rough_drawing'].includes(category.key);
  const categoryIncludesStructure = ['structure', 'vehicle_structure', '3dcg_structure', 'new_state'].includes(category.key);
  const categoryIncludesComplexity = ['photo_complex', 'exploded_complex', '3dcg_modeling'].includes(category.key);

  add('person', '人物追加（1名）', 1,
    !categoryIncludesPerson && includesAny(text, ['人物', '作業者', '男性', '女性', '手を入', '手で操作']));
  add('new_drawing', '構造整理・新規作図', 0.5,
    !categoryIncludesStructure && includesAny(text, ['構造整理', '新規作図', '簡略化']));
  add('two_panels', '2コマ化', 1, includesAny(text, ['2コマ', '2 コマ', '二コマ']));
  add('three_panels', '3コマ化', 4, includesAny(text, ['3コマ', '3 コマ', '三コマ']));
  add('angle', '別アングル作図', 2,
    category.key !== 'new_state' && includesAny(text, ['別アングル', '視点変更', '背面', '側面']));
  add('detail', '部分拡大図追加', 2, includesAny(text, ['拡大図', '詳細図', '部分図']));
  add('complex_machine', '複雑な機械構造', 5,
    !categoryIncludesComplexity && includesAny(text, ['複雑な機械', '複雑な構造', '配管', '部品多数']));
  add('multi_people_env', '複数人物＋周辺環境', 6,
    includesAny(text, ['複数人物', '2人', '3人', '二人', '三人']) && includesAny(text, ['背景', '周辺', '台車', '周辺機器']));
  add('cutaway', '断面・透過表現', 3,
    !categoryIncludesStructure && includesAny(text, ['断面', '透過', '内部構造', 'カットモデル']));

  const adjustmentHours = adjustments.reduce((sum, item) => sum + item.hours, 0);
  const hours = round1(category.baseHours + adjustmentHours);
  const minHours = round1(Math.max(0.8, hours * 0.9));
  const maxHours = round1(hours * 1.15);

  // マスター適合度。カテゴリ判定が明確で、差分が少ないほど高くする。
  let matchScore = 78;
  if (input.notes && input.notes.trim().length >= 15) matchScore += 5;
  if (input.aiSummary && input.aiSummary.trim().length >= 30) matchScore += 5;
  if (category.key !== 'photo') matchScore += 4;
  if (adjustments.length <= 2) matchScore += 3;
  if (adjustments.length >= 4) matchScore -= 8;
  matchScore = clamp(matchScore, 55, 95);

  return {
    categoryKey: category.key,
    category: category.label,
    baseHours: category.baseHours,
    adjustments,
    adjustmentHours: round1(adjustmentHours),
    hours,
    minHours,
    maxHours,
    matchScore,
    reason: category.reason,
  };
}

export function calculateIntegratedEstimate(input: {
  systemHours: number;
  aiHours?: number;
  masterHours: number;
  masterMatchScore: number;
}) {
  const values = [input.systemHours, input.aiHours || 0, input.masterHours].filter((v) => v > 0);
  if (values.length < 2) {
    return { hours: round1(input.systemHours), agreementScore: 70, level: '中', spreadRate: 0 };
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spreadRate = mean > 0 ? (max - min) / mean : 0;

  // 現行を残しつつ、実績マスターをやや強くする。AI独自値は第三者チェック役。
  const hasAi = !!input.aiHours && input.aiHours > 0;
  const systemWeight = hasAi ? 0.35 : 0.45;
  const aiWeight = hasAi ? 0.25 : 0;
  const masterWeight = hasAi ? 0.40 : 0.55;
  const hours = round1(
    input.systemHours * systemWeight +
    (input.aiHours || 0) * aiWeight +
    input.masterHours * masterWeight
  );

  let agreementScore = Math.round(100 - spreadRate * 70);
  agreementScore = Math.round((agreementScore * 0.7) + (input.masterMatchScore * 0.3));
  agreementScore = clamp(agreementScore, 45, 98);
  const level = agreementScore >= 85 ? '高' : agreementScore >= 65 ? '中' : '低';

  return { hours, agreementScore, level, spreadRate: round1(spreadRate * 100) };
}
