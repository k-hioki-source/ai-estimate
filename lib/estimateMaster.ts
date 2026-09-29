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
// 顧客向け参考工数は0.5h単位で切り上げる。
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

function chooseCategory(input: MasterEstimateInput, text: string): MasterCategory {
  const style = input.style;
  const workType = input.workType || '';
  const sourceType = input.sourceType;
  const dense = (input.partDensity || 0) >= 70 || (input.lineDifficulty || 0) >= 70;

  // v2: ユーザーがフォームで指定した制作条件とAIの明示的な作業タイプを優先する。
  // AI要約に「内部構造が少ない」等の否定文が含まれても、キーワードだけで構造図へ誤分類しない。
  if (sourceType === 'photo_trace' && workType === 'simple_trace' && style === 'line') {
    return { key: 'photo_simple', label: '写真トレース・簡単', baseHours: 1, reason: '簡易写真トレース判定を優先（単体・線画・構造作図なし）' };
  }

  // 「分解図」は technical_drawing より具体的な制作カテゴリなので最優先。
  if (input.isExplodedView || includesAny(text, ['分解図', '分解状態', '爆発図'])) {
    if (dense || (input.difficultyScore || 0) >= 60 || includesAny(text, ['30部品', '40部品', '50部品', '部品多数', '部品点数', '複雑'])) {
      return { key: 'exploded_complex', label: '複雑な分解図', baseHours: 6, reason: '複雑な機械・部品構成を含む分解図基準' };
    }
    return { key: 'exploded', label: '分解図', baseHours: 3, reason: '10部品程度の標準分解図基準' };
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
  // v2.2: 特許・技術図面はユーザーが明示した場合を優先する。
  // AI要約が「技術図面タイプ」と表現しただけでは、color指定を特許図面へ上書きしない。
  const userExplicitPatentDrawing = includesAny(normalize(input.notes || ''), ['特許', '特許図面', '意匠図', '技術図面']);
  if (userExplicitPatentDrawing) {
    return { key: 'patent', label: '特許・技術図面', baseHours: 6, reason: 'ユーザーが特許・技術図面を明示したため、その制作基準を優先' };
  }
  if (workType === 'concept_diagram' || includesAny(text, ['サイエンス', '概念図', 'システム図', 'フロー図'])) {
    return { key: 'concept', label: 'サイエンス・概念図', baseHours: 12, reason: '技術内容を理解して流れ・構造を説明する1図の基準' };
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
  // v2.2: 「写真にない状態」はユーザーの依頼文に明示された場合だけ選ぶ。
  // AI要約の一般的な「新規作図」「描き起こし」では標準カラー等を上書きしない。
  if (includesAny(normalize(input.notes || ''), ['写真にない', 'カバーを外', '別状態', '見えない部分', '別アングル', '視点変更'])) {
    return { key: 'new_state', label: '写真にない状態を作図', baseHours: 8, reason: 'ユーザー指示に写真にない状態・別アングル等が明示されたため' };
  }
  // v2: 表現指定はAI推測よりユーザー入力を優先。colorをrealへ勝手に格上げしない。
  if (style === 'color') {
    return { key: 'color', label: 'カラーイラスト', baseHours: 4, reason: 'ユーザー指定のカラー表現を優先した標準カラーイラスト基準' };
  }
  if (style === 'real') {
    return { key: 'real', label: 'リアルイラスト', baseHours: 10, reason: 'ユーザー指定のリアル表現（質感・光沢・陰影）基準' };
  }
  if (workType === 'realistic_illustration') {
    return { key: 'real', label: 'リアルイラスト', baseHours: 10, reason: 'AIがリアル表現と判定した場合の基準' };
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
    return { key: 'photo_complex', label: '写真トレース・複雑', baseHours: 5, reason: '細部・部品・線量の多い機械・製品の写真トレース基準' };
  }
  return { key: 'photo', label: '写真トレース', baseHours: 1.5, reason: '工業製品1点・背景なし・形状変更なしの写真トレース基準' };
}

export function calculateMasterEstimate(input: MasterEstimateInput) {
  const userText = normalize(input.notes || '');
  const aiText = normalize(input.aiSummary || '');
  const text = normalize(`${userText} ${aiText}`);
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
  // v2.2: 標準カラー/リアルの基準工数には通常の描き起こし・形状整理を含める。
  // AI要約に「新規作図」と書かれただけで二重加算しない。
  add('new_drawing', '構造整理・新規作図', 0.5,
    !categoryIncludesStructure && !['color', 'real'].includes(category.key) &&
    includesAny(userText, ['構造整理', '新規作図', '簡略化']));
  add('two_panels', '2コマ化', 1, includesAny(text, ['2コマ', '2 コマ', '二コマ']));
  add('three_panels', '3コマ化', 4, includesAny(text, ['3コマ', '3 コマ', '三コマ']));
  add('angle', '別アングル作図', 2,
    category.key !== 'new_state' && includesAny(text, ['別アングル', '視点変更', '背面', '側面']));
  add('detail', '部分拡大図追加', 2, includesAny(text, ['拡大図', '詳細図', '部分図']));
  // v2: 「リアルイラスト」の通常の製品ディテールは基準10hに含める。
  // 内部機構・多数部品など、構造理解そのものが追加作業になる場合だけ加算。
  const trulyComplexStructure = includesAny(text, ['内部機構', '内部部品', '多数部品', '30部品', '40部品', '50部品']) ||
    (includesAny(text, ['複雑な機械', '複雑な構造']) && !includesAny(text, ['複雑な構造解析は不要', '構造解析は不要']));
  add('complex_machine', '複雑な機械構造', 5,
    !categoryIncludesComplexity && category.key !== 'real' && category.key !== 'concept' && trulyComplexStructure);

  // v2: 概念図は「描画量」より情報設計・環境・接続関係の整理が工数を支配する。
  // 10件検証の実績33h案件を基準に、独立した加算要素として扱う。
  if (category.key === 'concept') {
    add('concept_information_design', '情報整理・構成設計', 6,
      includesAny(text, ['情報整理', 'レイアウト', '配置図', 'プレゼン', 'ポンチ絵', '技術内容']));
    add('concept_environment', '背景・環境表現', 5,
      includesAny(text, ['海底', '海面', '地中', '地層', '背景', '環境', '地形']));
    add('concept_connections', '配管・ケーブル・流れの整理', 5,
      includesAny(text, ['配管', 'ケーブル', '配線', '流れ', '接続']));
    add('concept_multi_equipment', '複数設備・構成要素', 5,
      includesAny(text, ['複数機器', '複数設備', '設備配置', '複数の設備', '複数の機器']));
  }
  add('multi_people_env', '複数人物＋周辺環境', 6,
    includesAny(text, ['複数人物', '2人', '3人', '二人', '三人']) && includesAny(text, ['背景', '周辺', '台車', '周辺機器']));
  // v2.1: 断面・透過補正は明示的な制作指示がある場合だけ加算する。
  // AI要約の「内部構造が少ない」「透過は不要」のような否定文をキーワード一致で拾わない。
  const userExplicitCutaway = includesAny(userText, ['断面図', '断面を', '断面で', '透過図', '透過表現', '透過して', 'カットモデル', '内部構造を表示', '内部構造を見せ']);
  const aiMentionsCutaway = includesAny(aiText, ['断面図', '断面表現', '透過図', '透過表現', 'カットモデル']);
  const aiNegatesCutaway = includesAny(aiText, [
    '断面ではない', '断面不要', '断面は不要', '断面表現は不要',
    '透過ではない', '透過不要', '透過は不要', '透過表現は不要',
    '内部構造が少ない', '内部構造は少ない', '内部構造なし', '内部構造はない',
  ]);
  add('cutaway', '断面・透過表現', 3,
    !categoryIncludesStructure && (userExplicitCutaway || (aiMentionsCutaway && !aiNegatesCutaway)));

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
  if (category.key === 'concept' && adjustments.length >= 3) matchScore -= 5;
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

  // 現行を残しつつ、実績マスターをやや強くする。AI独自値は第三者チェック役。
  const hasAi = !!input.aiHours && input.aiHours > 0;
  const systemWeight = hasAi ? 0.35 : 0.45;
  const aiWeight = hasAi ? 0.25 : 0;
  const masterWeight = hasAi ? 0.40 : 0.55;
  const weightedHours =
    input.systemHours * systemWeight +
    (input.aiHours || 0) * aiWeight +
    input.masterHours * masterWeight;

  // 安値防止ガード：AI独自推定と工数マスターの両方が現行システムより高い場合、
  // 現行の低い値に引っ張られすぎないよう、AIとマスターの低い方を下限にする。
  // 例: 現行2.5h / AI5h / マスター5h -> 下限5h。
  const antiLowFloor = hasAi && (input.aiHours || 0) > input.systemHours && input.masterHours > input.systemHours
    ? Math.min(input.aiHours || input.masterHours, input.masterHours)
    : 0;

  // 最低1hを維持し、最終参考工数は0.5h単位で切り上げる。
  const hours = ceilHalf(Math.max(1, weightedHours, antiLowFloor));

  let agreementScore = Math.round(100 - spreadRate * 70);
  agreementScore = Math.round((agreementScore * 0.7) + (input.masterMatchScore * 0.3));
  agreementScore = clamp(agreementScore, 45, 98);
  const level = agreementScore >= 85 ? '高' : agreementScore >= 65 ? '中' : '低';

  return { hours, agreementScore, level, spreadRate: round1(spreadRate * 100) };
}
