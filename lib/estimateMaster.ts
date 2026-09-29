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
const ceilHalf = (n: number) => Math.ceil(n * 2) / 2;
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

function hasExplicitCutaway(userText: string) {
  return includesAny(userText, [
    '断面図', '断面を', '断面で', '透過図', '透過表現', '透過して',
    'カットモデル', '内部構造を表示', '内部構造を見せ'
  ]);
}

function aiPositiveCutaway(aiText: string) {
  const mentions = includesAny(aiText, ['断面図', '断面表現', '透過図', '透過表現', 'カットモデル']);
  const negates = includesAny(aiText, [
    '断面ではない', '断面図ではない', '断面や分解図ではなく', '断面不要', '断面は不要', '断面表現は不要',
    '透過ではない', '透過図ではない', '透過不要', '透過は不要', '透過表現は不要',
    '内部構造が少ない', '内部構造は少ない', '内部構造なし', '内部構造はない'
  ]);
  return mentions && !negates;
}

function chooseCategory(input: MasterEstimateInput, userText: string, aiText: string, text: string): MasterCategory {
  const style = input.style;
  const workType = input.workType || '';
  const sourceType = input.sourceType;
  const difficulty = input.difficultyScore || 0;
  const dense = (input.partDensity || 0) >= 70 || (input.lineDifficulty || 0) >= 70;

  // 分解図はユーザー入力または明示フラグを優先。
  const userExplicitExploded = includesAny(userText, ['分解図', '分解状態', '爆発図']);
  if (input.isExplodedView || userExplicitExploded) {
    const complexExploded =
      dense ||
      difficulty >= 60 ||
      (input.usage === 'parts' && difficulty >= 50) ||
      input.hasLeaderLines === true ||
      input.hasPartNumbers === true ||
      includesAny(userText, ['30部品', '40部品', '50部品', '部品多数', '部品点数', '複雑']);

    if (complexExploded) {
      return { key: 'exploded_complex', label: '分解図・高密度', baseHours: 6, reason: '線量・部品・番号・引出線などが多い分解図トレースの基準' };
    }
    return { key: 'exploded', label: '分解図・標準', baseHours: 3, reason: '比較的単純な分解図トレースの基準' };
  }

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

  const userExplicitPatentDrawing = includesAny(userText, ['特許', '特許図面', '意匠図', '技術図面']);
  if (userExplicitPatentDrawing) {
    return { key: 'patent', label: '特許・技術図面', baseHours: 6, reason: 'ユーザーが特許・技術図面を明示したため、その制作基準を優先' };
  }

  // v4: アイソメ構成図を一般的なサイエンス概念図から分離。
  const explicitIsometric = includesAny(userText, ['アイソメ', 'アイソメトリック']);
  if (explicitIsometric && style === 'color' && sourceType === 'reference_drawing') {
    return { key: 'isometric_composition', label: 'アイソメ・構成イラスト', baseHours: 10, reason: '複数要素をアイソメ視点で整理・配置するカラー構成図の基準' };
  }

  // v4: 設備・製品の標準概念図は7.5h。研究・サイエンス系の高度な概念設計は別カテゴリ。
  if (workType === 'concept_diagram' || includesAny(userText, ['概念図', 'システム図', 'フロー図'])) {
    const scienceHeavy = includesAny(userText, [
      'サイエンス', '研究', '研究発表', '学術', '論文', '核融合', '原理説明', '技術概念'
    ]);
    if (scienceHeavy) {
      return { key: 'science_concept', label: 'サイエンス・概念図', baseHours: 12, reason: '研究・技術内容を理解して情報設計する概念図の基準' };
    }
    return { key: 'equipment_concept', label: '設備・製品概念図', baseHours: 7.5, reason: '写真・図面を基に設備や製品の関係を整理する標準概念図の基準' };
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
  if (includesAny(userText, ['写真にない', 'カバーを外', '別状態', '見えない部分', '別アングル', '視点変更'])) {
    return { key: 'new_state', label: '写真にない状態を作図', baseHours: 8, reason: 'ユーザー指示に写真にない状態・別アングル等が明示されたため' };
  }

  // v4: 写真ベースのリアル表現を難易度で3段階化（6 / 10 / 20h）。
  // 画像解析のdifficultyScoreを主軸にし、単純な単体製品と複雑な設備機械を分離。
  if (style === 'real' && sourceType === 'photo_trace') {
    if (difficulty >= 82 || dense || (input.structureComplexity || 0) >= 80) {
      return { key: 'real_photo_complex', label: 'リアルイラスト・写真トレース・複雑', baseHours: 20, reason: '配管・機器・部品が多い複雑な機械製品のリアル表現基準' };
    }
    if (difficulty >= 70 && includesAny(aiText, ['曲面', '凹凸', '通気口', '細部', '部品', '複雑'])) {
      return { key: 'real_photo_standard', label: 'リアルイラスト・写真トレース・標準', baseHours: 10, reason: '曲面・凹凸・細部表現を含む単体製品のリアル表現基準' };
    }
    return { key: 'real_photo_simple', label: 'リアルイラスト・写真トレース・簡易', baseHours: 6, reason: '形状が比較的整理された単体製品のリアル表現基準' };
  }

  if (style === 'real') {
    return { key: 'real', label: 'リアルイラスト', baseHours: 10, reason: '資料から形状を構成するリアル表現（質感・光沢・陰影）基準' };
  }
  if (workType === 'realistic_illustration') {
    return { key: 'real', label: 'リアルイラスト', baseHours: 10, reason: 'AIがリアル表現と判定した場合の基準' };
  }

  // v4: カラーは標準4h、高密度・複雑形状は5h。
  if (style === 'color') {
    const complexColor =
      dense ||
      difficulty >= 65 ||
      includesAny(aiText, ['多くの細部', '細かいパーツ', '複雑な形状', '高密度']);
    if (complexColor) {
      return { key: 'color_complex', label: 'カラーイラスト・高密度', baseHours: 5, reason: '細部・形状分割・色分けが多いカラーイラスト基準' };
    }
    return { key: 'color', label: 'カラーイラスト', baseHours: 4, reason: '標準的な製品カラーイラスト基準' };
  }

  // 断面・透過カテゴリは明示的な制作指示だけで選択する。
  if (hasExplicitCutaway(userText)) {
    return { key: 'structure', label: '構造説明', baseHours: 6, reason: 'ユーザーが断面・透過・内部構造表示を明示したため' };
  }

  if (input.usage === 'manual' && sourceType === 'cad_conversion') {
    return { key: 'manual_cad', label: '取説イラスト・CAD', baseHours: 2.5, reason: 'CAD/XVLから不要部品を整理する取説線画基準' };
  }
  if (
    input.usage === 'manual' &&
    sourceType === 'reference_drawing' &&
    style === 'line' &&
    (dense || difficulty >= 60)
  ) {
    return { key: 'manual_dense', label: '取説イラスト・高密度', baseHours: 6, reason: '複数部品・細部・線量の多い取説用線画を新規作図する基準' };
  }
  if (input.usage === 'manual' && (includesAny(text, ['手', '操作', '作業者', '人物']) || sourceType === 'reference_drawing')) {
    return { key: 'manual', label: '取説イラスト', baseHours: 2.5, reason: '写真・既存資料から手・製品・操作状態を作図する基準' };
  }

  if (sourceType === 'photo_trace' && dense) {
    return { key: 'photo_complex', label: '写真トレース・複雑', baseHours: 5, reason: '細部・部品・線量の多い機械・製品の写真トレース基準' };
  }

  // v4: simple_traceでも機械的な円筒・楕円・同心円形状が複数ある場合は1.5h。
  // AIの形状説明を補助信号として使い、単純な外形中心の製品は従来どおり1h。
  if (sourceType === 'photo_trace' && workType === 'simple_trace' && style === 'line') {
    const geometricPrecision =
      includesAny(aiText, ['円筒', '楕円', '同心円', '円形部', 'ボス', 'フランジ', '配管接続']) ||
      (difficulty >= 35 && (input.structureComplexity || 0) >= 45);
    if (geometricPrecision) {
      return { key: 'photo_simple_precision', label: '写真トレース・簡単＋形状精度', baseHours: 1.5, reason: '円筒・楕円・同心円など機械形状の精度調整を含む簡易トレース基準' };
    }
    return { key: 'photo_simple', label: '写真トレース・簡単', baseHours: 1, reason: '簡易写真トレース判定を優先（単体・線画・構造作図なし）' };
  }

  return { key: 'photo', label: '写真トレース', baseHours: 1.5, reason: '工業製品1点・背景なし・形状変更なしの写真トレース基準' };
}

export function calculateMasterEstimate(input: MasterEstimateInput) {
  const userText = normalize(input.notes || '');
  const aiText = normalize(input.aiSummary || '');
  const text = normalize(`${userText} ${aiText}`);
  const category = chooseCategory(input, userText, aiText, text);
  const adjustments: Adjustment[] = [];
  const add = (key: string, label: string, hours: number, condition: boolean) => {
    if (condition) adjustments.push({ key, label, hours });
  };

  const categoryIncludesPerson = ['manual', 'rough_drawing'].includes(category.key);
  const categoryIncludesStructure = ['structure', 'vehicle_structure', '3dcg_structure', 'new_state'].includes(category.key);
  const categoryIncludesComplexity = [
    'photo_complex', 'exploded_complex', 'manual_dense', '3dcg_modeling',
    'color_complex', 'real_photo_complex', 'real_photo_standard'
  ].includes(category.key);

  add('person', '人物追加（1名）', 1,
    !categoryIncludesPerson && includesAny(text, ['人物', '作業者', '男性', '女性', '手を入', '手で操作']));

  add('new_drawing', '構造整理・新規作図', 0.5,
    !categoryIncludesStructure &&
    !['color', 'color_complex', 'real', 'real_photo_simple', 'real_photo_standard', 'real_photo_complex'].includes(category.key) &&
    includesAny(userText, ['構造整理', '新規作図', '簡略化']));

  add('two_panels', '2コマ化', 1, includesAny(text, ['2コマ', '2 コマ', '二コマ']));
  add('three_panels', '3コマ化', 4, includesAny(text, ['3コマ', '3 コマ', '三コマ']));
  add('angle', '別アングル作図', 2,
    category.key !== 'new_state' && includesAny(text, ['別アングル', '視点変更', '背面', '側面']));
  add('detail', '部分拡大図追加', 2, includesAny(text, ['拡大図', '詳細図', '部分図']));

  const trulyComplexStructure =
    includesAny(text, ['内部機構', '内部部品', '多数部品', '30部品', '40部品', '50部品']) ||
    (includesAny(text, ['複雑な機械', '複雑な構造']) &&
      !includesAny(text, ['複雑な構造解析は不要', '構造解析は不要']));
  add('complex_machine', '複雑な機械構造', 5,
    !categoryIncludesComplexity &&
    !['real', 'equipment_concept', 'science_concept', 'isometric_composition'].includes(category.key) &&
    trulyComplexStructure);

  // サイエンス概念図のみ大きな情報設計補正を許可。
  if (category.key === 'science_concept') {
    add('concept_information_design', '情報整理・構成設計', 6,
      includesAny(userText, ['情報整理', 'レイアウト', '配置図', 'プレゼン', 'ポンチ絵', '技術内容']));
    add('concept_environment', '背景・環境表現', 5,
      includesAny(userText, ['海底', '海面', '地中', '地層', '背景', '環境', '地形']));
    add('concept_connections', '配管・ケーブル・流れの整理', 5,
      includesAny(userText, ['配管', 'ケーブル', '配線', '流れ', '接続']));
    add('concept_multi_equipment', '複数設備・構成要素', 5,
      includesAny(userText, ['複数機器', '複数設備', '設備配置', '複数の設備', '複数の機器']));
  }

  add('multi_people_env', '複数人物＋周辺環境', 6,
    !['isometric_composition', 'equipment_concept'].includes(category.key) &&
    includesAny(userText, ['複数人物', '2人', '3人', '二人', '三人']) &&
    includesAny(userText, ['背景', '周辺', '台車', '周辺機器']));

  // v4: 断面・透過補正はユーザーの明示指示、またはAIが肯定的に断面を認識した場合のみ。
  // 「断面図ではない」「断面や分解図ではなく」などの否定文では絶対に加算しない。
  const userExplicitCutaway = hasExplicitCutaway(userText);
  const aiExplicitCutaway = aiPositiveCutaway(aiText);
  add('cutaway', '断面・透過表現', 3,
    !categoryIncludesStructure && (userExplicitCutaway || aiExplicitCutaway));

  const adjustmentHours = adjustments.reduce((sum, item) => sum + item.hours, 0);
  const hours = round1(category.baseHours + adjustmentHours);
  const minHours = round1(Math.max(0.8, hours * 0.9));
  const maxHours = round1(hours * 1.15);

  let matchScore = 78;
  if (input.notes && input.notes.trim().length >= 15) matchScore += 5;
  if (input.aiSummary && input.aiSummary.trim().length >= 30) matchScore += 5;
  if (category.key !== 'photo') matchScore += 4;
  if (adjustments.length <= 2) matchScore += 3;
  if (adjustments.length >= 4) matchScore -= 8;
  if (category.key === 'science_concept' && adjustments.length >= 3) matchScore -= 5;
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
    return { hours: ceilHalf(Math.max(1, input.systemHours)), agreementScore: 70, level: '中', spreadRate: 0 };
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spreadRate = mean > 0 ? (max - min) / mean : 0;

  const hasAi = !!input.aiHours && input.aiHours > 0;
  const systemWeight = hasAi ? 0.35 : 0.45;
  const aiWeight = hasAi ? 0.25 : 0;
  const masterWeight = hasAi ? 0.40 : 0.55;
  const weightedHours =
    input.systemHours * systemWeight +
    (input.aiHours || 0) * aiWeight +
    input.masterHours * masterWeight;

  const antiLowFloor =
    hasAi &&
    (input.aiHours || 0) > input.systemHours &&
    input.masterHours > input.systemHours
      ? Math.min(input.aiHours || input.masterHours, input.masterHours)
      : 0;

  // 実績マスター適合度90%以上はマスターを最終基準にする。
  const masterAnchoredHours = input.masterMatchScore >= 90 ? input.masterHours : 0;

  const hours = masterAnchoredHours > 0
    ? ceilHalf(Math.max(1, masterAnchoredHours))
    : ceilHalf(Math.max(1, weightedHours, antiLowFloor));

  let agreementScore = Math.round(100 - spreadRate * 70);
  agreementScore = Math.round((agreementScore * 0.7) + (input.masterMatchScore * 0.3));
  agreementScore = clamp(agreementScore, 45, 98);
  const level = agreementScore >= 85 ? '高' : agreementScore >= 65 ? '中' : '低';

  return { hours, agreementScore, level, spreadRate: round1(spreadRate * 100) };
}
