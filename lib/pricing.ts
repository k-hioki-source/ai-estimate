type SourceType =
  | 'photo_trace'
  | 'reference_drawing'
  | 'cad_conversion'
  | 'ai_vectorization';

type Usage = 'manual' | 'parts' | 'sales';
type Style = 'line' | 'color' | 'real';
type WorkType =
  | 'simple_trace'
  | 'standard_trace'
  | 'technical_drawing'
  | 'realistic_illustration'
  | 'concept_diagram'
  | '3d_conversion';


export function calculateEstimate({
  sourceType,
  usage,
  style,
  difficultyScore,
  partDensity,
  lineDifficulty,
  structureComplexity,
  isExplodedView,
  hasLeaderLines,
  hasPartNumbers,
  isIndustrialProduct,
  quantity,
  description = '',
  notes = '',
  workType,
}: {
  sourceType: SourceType;
  usage: Usage;
  style: Style;
  difficultyScore: number;
  partDensity: number;
  lineDifficulty: number;
  structureComplexity: number;
  isExplodedView: boolean;
  hasLeaderLines: boolean;
  hasPartNumbers: boolean;
  isIndustrialProduct: boolean;
  quantity: number;
  description?: string;
  notes?: string;
  workType?: WorkType;
}) {
  const hourlyRate = 3000;

  let score = clamp(difficultyScore, 0, 100);
  const part = clamp(partDensity, 0, 100);
  const line = clamp(lineDifficulty, 0, 100);
  const structure = clamp(structureComplexity, 0, 100);

  const text = `${description} ${notes}`.toLowerCase();

  // フォームの制作方法と依頼文が食い違う場合の補正。
  // 写真と同じ角度・内容を線画化する案件は photo_trace として計算する。
  // 別角度や見えない部分の描き起こしは reference_drawing のまま扱う。
  const isPhotoBasedTrace =
    text.includes('支給資料：写真') ||
    text.includes('支給資料:写真') ||
    text.includes('製品写真から') ||
    text.includes('写真から');

  const requiresDrawingFromReference =
    text.includes('別角度') ||
    text.includes('角度変更') ||
    text.includes('見えない部分') ||
    text.includes('推測して') ||
    text.includes('描き起こし') ||
    text.includes('オリジナル') ||
    text.includes('新規作図') ||
    text.includes('新規に作図') ||
    text.includes('新たに作図') ||
    text.includes('新しく作図') ||
    text.includes('写真を参考に') ||
    text.includes('写真と図面を参考に') ||
    text.includes('図面を参考に') ||
    text.includes('資料を参考に') ||
    text.includes('断面図') ||
    text.includes('断面を作成') ||
    text.includes('断面を作図');

  if (
    sourceType === 'reference_drawing' &&
    isPhotoBasedTrace &&
    !requiresDrawingFromReference
  ) {
    sourceType = 'photo_trace';
  }

  const hasVectorKeyword =
    text.includes('パス') ||
    text.includes('ベクター') ||
    text.includes('ベクターデータ') ||
    text.includes('illustrator') ||
    text.includes('aiデータ') ||
    text.includes('アウトライン');

  const hasFullPath =
    text.includes('すべての要素') ||
    text.includes('全ての要素') ||
    text.includes('背景を含む') ||
    text.includes('全てパス') ||
    text.includes('完全パス');

  const noImageAllowed =
    text.includes('画像は使用しません') ||
    text.includes('画像使用不可') ||
    text.includes('画像は使用不可') ||
    text.includes('画像不可') ||
    text.includes('画像は使用不可');

  const hasSignboard =
    text.includes('看板') ||
    text.includes('原寸') ||
    text.includes('2000mm') ||
    text.includes('2,000mm') ||
    text.includes('w2,000') ||
    text.includes('塗り足し');

  const hasAiGenerated =
    text.includes('生成ai') ||
    text.includes('ai生成') ||
    text.includes('aiで作成') ||
    text.includes('ai画像');

  const hasLogoOrText =
    text.includes('ロゴ') ||
    text.includes('文字') ||
    text.includes('社名') ||
    text.includes('電話番号') ||
    text.includes('住所');

  const hasBeforeAfterOutline =
    text.includes('アウトライン前') ||
    text.includes('アウトライン後') ||
    text.includes('アウトライン前のai') ||
    text.includes('アウトライン後のai');

  // 支給画像・AI生成画像を元にした、小規模なロゴ／切文字データ調整。
  // 「AI生成」＋「アウトライン」だけで完全ベクター化案件に昇格させない。
  const hasSimpleLogoWork =
    text.includes('ロゴ') ||
    text.includes('屋号') ||
    text.includes('マーク') ||
    text.includes('切文字') ||
    text.includes('ステッカー') ||
    text.includes('フォント化');

  const hasLimitedColor =
    text.includes('単色') ||
    text.includes('1色') ||
    text.includes('１色') ||
    text.includes('2色') ||
    text.includes('２色');

  const hasNewDesignWork =
    text.includes('新規デザイン') ||
    text.includes('デザイン提案') ||
    text.includes('複数案') ||
    text.includes('コンセプト') ||
    text.includes('ロゴ制作') ||
    text.includes('ロゴ作成');

  const hasComplexLogoWork =
    text.includes('キャラクター') ||
    text.includes('細かい装飾') ||
    text.includes('不鮮明') ||
    text.includes('入稿代行') ||
    text.includes('複数サイズ') ||
    text.includes('複数仕様');

  const isSimpleLogoVectorization =
    sourceType === 'photo_trace' &&
    score <= 40 &&
    hasVectorKeyword &&
    hasSimpleLogoWork &&
    (hasAiGenerated || text.includes('支給')) &&
    (hasLimitedColor || style === 'line') &&
    !hasFullPath &&
    !noImageAllowed &&
    !hasSignboard &&
    !hasNewDesignWork &&
    !hasComplexLogoWork;

  // AI生成画像・完全ベクター化案件を自動判定
  if (
    sourceType === 'photo_trace' &&
    !isSimpleLogoVectorization &&
    hasVectorKeyword &&
    (hasAiGenerated || hasFullPath || noImageAllowed || hasSignboard)
  ) {
    sourceType = 'ai_vectorization';
    score = Math.max(score, 75);
  }

  let baseHours = 1;

  if (sourceType === 'photo_trace') {
    baseHours = 1;
  }

  if (sourceType === 'reference_drawing') {
    if (score <= 30) baseHours = 2;
    else if (score <= 55) baseHours = 3;
    else if (score <= 75) baseHours = 5;
    else baseHours = 8;
  }

  if (sourceType === 'cad_conversion') {
    if (score <= 30) baseHours = 1.5;
    else if (score <= 55) baseHours = 2.5;
    else if (score <= 75) baseHours = 4;
    else baseHours = 6;
  }

  if (sourceType === 'ai_vectorization') {
    if (score <= 50) baseHours = 5;
    else if (score <= 70) baseHours = 7;
    else if (score <= 85) baseHours = 9;
    else baseHours = 12;
  }

  let usageMultiplier = 1;

  if (usage === 'manual') usageMultiplier = 0.9;
  if (usage === 'parts') usageMultiplier = 1.1;
  if (usage === 'sales') usageMultiplier = 1.25;

  let styleMultiplier = 1;

  if (style === 'line') styleMultiplier = 1;
  if (style === 'color') styleMultiplier = 1.2;
  if (style === 'real') styleMultiplier = 1.5;

 

  const difficultyMultiplier = getDifficultyMultiplier(score);

  let hours =
    baseHours *
    usageMultiplier *
    styleMultiplier *
    difficultyMultiplier;

   if (
  usage === 'sales' &&
  style === 'real' &&
  (
    notes.includes('構造') ||
    notes.includes('解説図') ||
    notes.includes('断面') ||
    notes.includes('土') ||
    notes.includes('草')
  )
) {
  hours = Math.max(hours, 8);
}

  if (
  usage === 'sales' &&
  style === 'real' &&
  score >= 60
) {
  hours = Math.max(hours, 8);
}

  if (
    style === 'real' &&
    usage === 'sales' &&
    score >= 80
  ) {
    hours = Math.max(hours, 30);
  }

  // -----------------------------
  // 制作方法別の基本補正
  // -----------------------------
  if (sourceType === 'photo_trace') {
    if (score >= 60) hours += 0.5;
    if (score >= 80) hours += 0.5;
  }

  if (sourceType === 'reference_drawing') {
    if (score >= 65) hours += 1;
    if (score >= 80) hours += 1.5;
  }

  if (sourceType === 'cad_conversion') {
    if (score >= 70) hours += 1;
  }

  // -----------------------------
  // AI生成画像・完全ベクター化補正
  // -----------------------------
  if (sourceType === 'ai_vectorization') {
    hours = Math.max(hours, 7);

    if (hasFullPath) {
      hours += 1.5;
      score = Math.max(score, 80);
    }

    if (noImageAllowed) {
      hours += 1.2;
      score = Math.max(score, 82);
    }

    if (hasSignboard) {
      hours += 0.8;
    }

    if (hasLogoOrText) {
      hours += 1.2;
    }

    if (hasBeforeAfterOutline) {
      hours += 0.4;
    }

    if (hasAiGenerated) {
      hours += 1;
    }

    // 今回のような看板用完全パス化案件の最低工数
    if (
      hasVectorKeyword &&
      hasFullPath &&
      noImageAllowed &&
      hasSignboard
    ) {
      hours = Math.max(hours, 10);
      score = Math.max(score, 85);
    }
  }

  // -----------------------------
  // パーツカタログ・分解図補正
  // -----------------------------
  if (usage === 'parts') {
    hours += sourceType === 'photo_trace' ? 0.5 : 1.5;
  }

  if (isExplodedView) {
    hours += sourceType === 'photo_trace' ? 1 : 2;
  }

  if (hasLeaderLines) {
    hours += sourceType === 'photo_trace' ? 0.5 : 1;
  }

  if (hasPartNumbers) {
    hours += sourceType === 'photo_trace' ? 0.5 : 1;
  }

  // -----------------------------
  // トレースの複雑さ補正
  // -----------------------------
  if (sourceType === 'photo_trace') {
    if (part >= 75) hours += 0.5;
    if (structure >= 60) hours += 0.5;
    if (structure >= 75) hours += 0.5;
    if (line >= 60) hours += 1;
    if (line >= 80) hours += 1;
  }

  // -----------------------------
  // リアル表現補正
  // -----------------------------
  if (style === 'real') {
    if (isIndustrialProduct) {
      hours += sourceType === 'photo_trace' ? 1.5 : 3;
    }

    if (isIndustrialProduct && line >= 70) {
      hours += sourceType === 'photo_trace' ? 0.5 : 1.5;
    }

    if (isIndustrialProduct && score >= 80) {
      hours += sourceType === 'photo_trace' ? 0.5 : 1.5;
    }

    if (line >= 60) hours += 0.5;
    if (line >= 80) hours += 1;
    if (structure >= 75) hours += 1;
  }

  // 販促・WEB掲載用のリアルな機械製品は、形状の再現だけでなく、
  // 金属・樹脂・ゴムなどの質感、曲面の陰影、細かな段差や継ぎ目の
  // 描き分けに時間がかかるため、最低15時間を確保する。
  // 単純な工業部品まで一律に引き上げないよう、難易度60以上に限定する。
  if (
    sourceType === 'photo_trace' &&
    usage === 'sales' &&
    style === 'real' &&
    isIndustrialProduct &&
    score >= 60
  ) {
    hours = Math.max(hours, 15);
    score = Math.max(score, 70);
  }


  // -----------------------------
  // 写真・図面から新規に断面図を作図する案件
  // -----------------------------
  // 元写真をそのままなぞる作業ではなく、図面を読み取りながら
  // 内部構造・部品位置・断面形状を再構成するため、reference_drawing の
  // technical_drawing として最低工数を確保する。
  const isSectionDrawing =
    text.includes('断面図') ||
    text.includes('断面イラスト') ||
    text.includes('断面を作成') ||
    text.includes('断面を作図') ||
    (text.includes('断面') && text.includes('図面'));

  if (
    sourceType === 'reference_drawing' &&
    isSectionDrawing &&
    workType !== '3d_conversion'
  ) {
    const sectionBaseHours =
      style === 'real' ? 12 : style === 'color' ? 8 : 6;

    const hasHighComplexitySection =
      text.includes('複数断面') ||
      text.includes('複数の断面') ||
      text.includes('多数の部品') ||
      text.includes('部品点数が多い') ||
      text.includes('複雑な内部') ||
      text.includes('複雑な構造') ||
      text.includes('精密機構') ||
      text.includes('引出し線') ||
      text.includes('部品番号') ||
      part >= 75 ||
      structure >= 80;

    // 標準的な断面図は基準工数へ揃える。
    // 明確に複雑な案件のみ、既存計算が基準を超えることを許容する。
    hours = hasHighComplexitySection
      ? Math.max(hours, sectionBaseHours)
      : sectionBaseHours;

    score = Math.max(score, 65);
  }

  // -----------------------------
  // 参考資料から新規作図する販促用リアルイラスト補正
  // -----------------------------
  // 「写真からオリジナル」「写真を参考に新規作図」などは
  // 写真をなぞる photo_trace ではなく、資料を読み取って形状・パース・
  // 構成を新たに起こす reference_drawing として扱う。
  const isOriginalReferenceDrawing =
    sourceType === 'reference_drawing' &&
    (
      text.includes('オリジナル') ||
      text.includes('新規作図') ||
      text.includes('新規に作図') ||
      text.includes('新たに作図') ||
      text.includes('新しく作図') ||
      text.includes('写真を参考に') ||
      text.includes('資料を参考に')
    );

  const hasIndustrialProductKeyword =
    text.includes('ev') ||
    text.includes('バッテリー') ||
    text.includes('コネクター') ||
    text.includes('コネクタ') ||
    text.includes('車両') ||
    text.includes('自動車') ||
    text.includes('機械') ||
    text.includes('工具') ||
    text.includes('装置') ||
    text.includes('製品');

  const hasHighComplexityOriginalDrawing =
    text.includes('分解図') ||
    text.includes('分解') ||
    text.includes('断面') ||
    text.includes('内部構造') ||
    text.includes('内部機構') ||
    text.includes('複雑な構造') ||
    text.includes('多数の部品') ||
    text.includes('部品点数が多い') ||
    text.includes('背景込み') ||
    text.includes('背景を含む');

  if (
    isOriginalReferenceDrawing &&
    usage === 'sales' &&
    style === 'real' &&
    (isIndustrialProduct || hasIndustrialProductKeyword)
  ) {
    // 写真・資料を参考に工業製品をオリジナルで新規作図する
    // 販促用リアルイラストは、通常1点26時間前後を基準とする。
    // 難易度・リアル表現などの既存加算が重複して40時間以上へ
    // 膨らむのを防ぐため、通常案件は26時間を基準値として固定する。
    // 分解・断面・内部構造・多数部品など明確な高複雑度案件のみ、
    // 既存計算が26時間を超えることを許容する。
    if (hasHighComplexityOriginalDrawing) {
      hours = Math.max(hours, 26);
    } else {
      hours = 26;
    }

    score = Math.max(score, 75);
  }

  // -----------------------------
  // 2D図面から3D化する案件
  // -----------------------------
  // PDF・2D組立図・部品図から立体構造を新規に起こす場合は、
  // 通常の technical_drawing より図面読解と構造再構築の工数が大きい。
  // 3D組立図、3D部品図、立体図、アイソメ図、単体3Dモデルのいずれも
  // 最低20時間を基準とする。
  if (workType === '3d_conversion') {
    hours = Math.max(hours, 20);
    score = Math.max(score, 85);
  }

  // 小規模なロゴ・切文字案件は、アウトライン整理と出力用データ調整を
  // 含む標準工数として5時間にする（新規デザインや完全パス化は対象外）。
  if (isSimpleLogoVectorization) {
    hours = 5;
  }

  // -----------------------------
  // 高密度な取説用・白黒線画の写真トレース補正
  // -----------------------------
  // 基板、電子部品、内部機構、ファン、フィン、コネクター、スロット、
  // 多数の穴・スリットなど、線量が多い写真トレースは「簡単な取説用トレース」
  // として0.8hへ落とさない。画像解析の密度判定または対象物キーワードの
  // どちらかで高密度と判断した場合、1点5時間を最低基準とする。
  const hasDenseLineSubjectKeyword =
    text.includes('マザーボード') ||
    text.includes('基板') ||
    text.includes('電子部品') ||
    text.includes('周辺部品') ||
    text.includes('コネクター') ||
    text.includes('コネクタ') ||
    text.includes('スロット') ||
    text.includes('ファン') ||
    text.includes('放熱フィン') ||
    text.includes('ヒートシンク') ||
    text.includes('配線') ||
    text.includes('ハーネス') ||
    text.includes('多数の穴') ||
    text.includes('スリット') ||
    text.includes('内部部品') ||
    text.includes('細部の再現') ||
    text.includes('線整理の工数');

  const isHighDensityManualLineTrace =
    sourceType === 'photo_trace' &&
    usage === 'manual' &&
    style === 'line' &&
    !isSimpleLogoVectorization &&
    (
      hasDenseLineSubjectKeyword ||
      part >= 65 ||
      line >= 65 ||
      (score >= 60 && (part >= 55 || line >= 55))
    );

  if (isHighDensityManualLineTrace) {
    hours = Math.max(hours, 5);
    score = Math.max(score, 65);
  }

  // 簡単な取説用写真トレースは1hに抑える
  if (
    !isSimpleLogoVectorization &&
    !isHighDensityManualLineTrace &&
    sourceType === 'photo_trace' &&
    usage === 'manual' &&
    style === 'line' &&
    score <= 55 &&
    part <= 40 &&
    line <= 50 &&
    structure <= 40 &&
    !isExplodedView &&
    !hasLeaderLines &&
    !hasPartNumbers
  ) {
    hours = 0.8;
  }

  // 丸め
  hours = Math.max(0.8, hours);
  hours = Math.round(hours * 10) / 10;

  let unitPrice = hours * hourlyRate;
  unitPrice = Math.max(3000, unitPrice);
  unitPrice = Math.round(unitPrice / 100) * 100;

  let quantityMultiplier = quantity;

  if (quantity >= 10) {
    quantityMultiplier = quantity * 0.8;
  } else if (quantity >= 5) {
    quantityMultiplier = quantity * 0.9;
  }

  const totalPrice =
    Math.round((unitPrice * quantityMultiplier) / 100) * 100;

  return {
    hours,
    unitPrice,
    totalPrice,
    hourlyRate,
    sourceType,
    usageMultiplier,
    styleMultiplier,
    difficultyMultiplier,
    quantity,
    priceText: `${totalPrice.toLocaleString()}円`,
  };
}

function getDifficultyMultiplier(score: number) {
  const min = 0.9;
  const max = 1.4;
  const curved = Math.pow(score / 100, 2);
  const multiplier = min + curved * (max - min);

  return Math.round(multiplier * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
