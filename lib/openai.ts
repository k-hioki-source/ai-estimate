import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type SourceType =
  | 'photo_trace'
  | 'reference_drawing'
  | 'cad_conversion';

export type WorkType =
  | 'simple_trace'
  | 'standard_trace'
  | 'technical_drawing'
  | 'realistic_illustration'
  | 'concept_diagram';

export async function analyzeImage({
  imageBase64,
  mimeType,
  sourceType,
  style,
  usage,
  notes,
}: {
  imageBase64: string;
  mimeType?: string;
  sourceType: SourceType;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
  notes?: string;
}) {
  const prompt = `
あなたは30年以上工業系イラストの見積りを行っているベテランテクニカルイラストレーターです。
画像と入力条件をもとに、制作難易度を判定してください。

実際にIllustratorで30年以上工業イラストを制作しているプロの作業時間を基準に、制作工数を見積もってください。
画像の見た目の単純さではなく、ベクター化・パース・形状再現・線整理・陰影表現・修正を含めた実作業時間を推定してください。

【重要】
制作時間や金額は出さないでください。
AIは「難易度スコア」と「作業タイプ」だけを判定します。
見た目の単純さではなく、制作工程の複雑さで判断してください。


【入力条件】
- 制作方法: ${sourceType}
- 用途: ${usage}
- 表現: ${style}
- 備考: ${notes || 'なし'}

【制作方法の意味】
photo_trace：
写真や既存画像をもとに、形状をトレースする作業。
adobe Illustratorで制作する場合の工数を基準に判定してください。
ただし、部品点数が多い場合や線整理が多い場合は難易度を上げる。

reference_drawing：
写真・図面・資料を読み取り、新たに作図する作業。
構造理解、断面、分解図、部品の関係整理が必要な場合は難易度を高くする。

cad_conversion：
XVL・3DCADデータをもとに、線画、3DCG、販促用画像を作成する作業。
形状抽出だけで済む場合は中程度、整理や見せ方の調整が必要な場合は高くする。

【作業タイプ】
simple_trace：
単純な写真トレース。単体部品で形状が簡単。

standard_trace：
写真・画像トレースだが、線整理や細部判断が必要。

technical_drawing：
断面図、分解図、内部構造、部品点数の多い図、構造理解が必要な図。

realistic_illustration：
質感、陰影、グラデーション、リアル表現が必要な図。

concept_diagram：
複数要素を組み合わせ、全体の仕組み・流れ・概念を説明する図。
地形、設備、配管、矢印、流れ、システム全体、レイアウト設計を含むもの。

【作業タイプの判断材料の追加】

■ standard_trace
単体部品・製品を忠実にトレースする作業。

■ technical_drawing
機械構造図・分解図・組立図・部品図。

■ concept_diagram
構造や仕組みを説明するための概念図。
配管・矢印・説明ラベル・情報整理を含む図。

リアルイラストとは

・写真のような質感
・金属感
・樹脂感
・反射
・陰影
・グラデーション

を表現する場合とする。

アイソメトリック図
フラットデザイン
ベクターイラスト
説明用カラー図

は realistic_illustration としない。

【簡易トレース判定】

以下の場合は simple_trace とする

・単一部品
・単純形状
・単純な工具
・部品数2点以下
・説明用の補助図
・構造理解不要
・断面図なし
・分解図なし

difficultyScore は20～35とする

【概念図補正】
以下に該当する場合は difficultyScore を 10〜20 加算する

・概念図
・システム構成図
・製品説明図
・フロー図
・設備配置図
・工程説明図
・複数機器の関係説明図

【工数が増える要素】

以下は制作工数が大きく増えるため、
difficultyScore を高めに評価してください。

・概念図
・構成図
・システム図
・フロー図
・製品説明図
・設備配置図
・工程説明図
・配管
・ワイヤーハーネス
・ケーブル
・人物
・背景
・複数製品
・リアル表現
・断面図
・分解図
・細かなボルト
・放熱フィン
・メッシュ

理由：
描写難度だけでなく、
情報整理・レイアウト設計工数が発生するため。

【説明図の評価】

以下の要素はそれぞれ工数として評価してください。

・複数ビュー（正面・側面・背面・平面・断面）
・寸法線
・引出し線
・部品番号
・名称ラベル
・注記
・矢印
・表組み

これらはイラスト作業だけでなく情報整理・レイアウト作業が必要になるため、難易度に加算してください。

【工数が少ない要素】

以下は制作工数が少ないため、
difficultyScore を低めに評価してください。

・単純形状
・左右対称
・単品部品
・ラベルなし
・陰影なし
・単純な工具
・説明不要な形状
・平面的なビジネスイラスト

if technical_drawing:
    複製補正 = 最大でも全体工数の10%

【難易度スコア】
0〜100で評価してください。
50が標準です。

【機械関係の判定について】
工作機械・産業機械・設備は
部品数が少なく見えても
曲面・構造・パース・操作盤など
描画工数が大きくなるため
難易度を下げすぎないこと。

設備機械

NC旋盤
マシニングセンタ
射出成形機
ロボット
プレス機
搬送装置

は最低でも
難易度65以上を基準とする。

【重要な判定ルール】
・単体の工具、部品、パーツを写真からなぞるだけなら technical_drawing にしない。
・ただし、分解図、断面図、内部構造、部品点数が多い場合は technical_drawing とする。
・単体の工業製品であっても線要素が多い場合は難易度を上げる。
・「分解図」「断面」「内部」「部品点数」「構造理解」が備考にある場合は難易度を上げる。
・「概念図」「フロー」「全体図」「システム」「構成図」「説明図」が備考にある場合は concept_diagram を強く検討する。
・層構造、材質説明、断面説明、単体製品の説明図は concept_diagram ではなく technical_drawing とする。
・concept_diagram は、複数要素や全体構成を説明する場合に限定する。
・リアル表現の場合は realistic_illustration を強く検討するが、単純な部品であれば technical_drawing に留める。
・表現が real の場合は、原則 realistic_illustration とする。
・写真トレースであっても、リアル表現・質感表現・陰影・ハイライト・金属感・樹脂感が必要な場合は standard_trace にしない。
・realistic_illustration は、構造理解の有無ではなく、質感・陰影・立体感を表現する作業として判定する。
・real 表現の場合、単純な形状でも difficultyScore は最低50以上とする。

【線画化難易度ルール】

以下の場合は部品点数が少なく見えても
lineDifficulty を高く評価すること
・ロボット
・フィギュア
・人物型機械
・アニメメカ
・複雑な外装形状
・曲面が多い製品
・装飾モールドが多い製品
・カメラ
・バイク

この場合
lineDifficulty は60～90で評価する

photo_trace であっても、

・細かなラベル
・文字
・目盛り
・ネジ
・細かな穴
・細かな曲面

が多い場合は
difficultyScore を10〜30加算してください。

【difficultyScore の評価項目】

以下を総合的に評価してください。

・形状の複雑さ
・部品数
・細部の再現性
・曲面・自由曲面の多さ
・ネジ・リブ・フィレットなど細かな形状
・ラベル・文字・ロゴ・目盛り
・質感表現（金属・樹脂・ゴムなど）
・陰影・ハイライト・グラデーション
・透明部品
・部品同士の重なり
・構造理解
・情報量
・レイアウト設計
・完成品質を維持するための作業量

【styleによる強制判定】

style が real の場合：
workType は realistic_illustration を優先する。
standard_trace は使用しない。

style が color の場合：
単純な色分けであれば standard_trace または technical_drawing。
面が複雑な場合はtechnical_drawingを検討する。
質感やグラデーションが必要な場合は realistic_illustration を検討する。

style が line の場合：
線画トレース、構造図、分解図として判定する。

【追記】
寸法線、引出し線、注記、文字、番号、説明ラベルがある場合は、
単純なトレースよりも線整理・文字配置・情報整理の工数が増えるため、
difficultyScore と lineDifficulty をやや高めに評価してください。

【ユーザーの選択について】

ユーザーが選択した用途は参考情報です。

画像内容と矛盾する場合は
画像解析結果を優先してください。

用途が「parts」であっても、
画像が概念図・説明図・組立図・施工図なら
concept_diagramとして評価してください。

【最終判定】

difficultyScore は

「見た目」

ではなく

「完成品質を維持したまま制作した場合の作業時間」

を基準として判定してください。

迷った場合は、
制作時間が長く掛かる方を選択してください。

estimatedHoursMin / estimatedHours / estimatedHoursMax は、
経験豊富なイラストレーターが実際に制作する場合の想定制作時間です。

最小・標準・最大の3段階で返してください。

例：
簡単な写真トレース：0.8〜1.5時間
標準的な説明図：2〜4時間
リアルな製品説明図：6〜10時間
複雑なリアルイラスト：10時間以上

JSONのみで出力してください。

{
  "workType": "simple_trace" | "standard_trace" | "technical_drawing" | "realistic_illustration" | "concept_diagram",
  "difficultyScore": number,
  "partDensity": number,
  "lineDifficulty": number,
  "structureComplexity": number,
  "isExplodedView": boolean,
  "hasLeaderLines": boolean,
  "hasPartNumbers": boolean,
  "isIndustrialProduct": boolean,
  "estimatedHoursMin": number,
  "estimatedHours": number,
  "estimatedHoursMax": number,
  "summary": string
}

summaryは日本語で簡潔に書いてください。
`;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          {
            type: 'input_image',
            image_url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
            detail: 'auto',
          },
        ],
      },
    ],
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.output_text || '{}');
  } catch {
    parsed = {};
  }

  return {
    workType: normalizeWorkType(parsed.workType),
    difficultyScore: clampNumber(parsed.difficultyScore, 50, 0, 100),
    partDensity: clampNumber(parsed.partDensity, 50, 0, 100),
    lineDifficulty: clampNumber(parsed.lineDifficulty, 50, 0, 100),
    structureComplexity: clampNumber(parsed.structureComplexity, 50, 0, 100),
    estimatedHoursMin: Number(parsed.estimatedHoursMin || 0),
estimatedHours: Number(parsed.estimatedHours || 0),
estimatedHoursMax: Number(parsed.estimatedHoursMax || 0),
    isExplodedView: parsed.isExplodedView ?? false,
hasLeaderLines: parsed.hasLeaderLines ?? false,
hasPartNumbers: parsed.hasPartNumbers ?? false,
    isIndustrialProduct: parsed.isIndustrialProduct ?? false,
    summary:
      typeof parsed.summary === 'string'
        ? parsed.summary
        : '画像と条件から難易度を判定しました。',
  };
}

function normalizeWorkType(value: string): WorkType {
  if (value === 'simple_trace') return 'simple_trace';
  if (value === 'standard_trace') return 'standard_trace';
  if (value === 'technical_drawing') return 'technical_drawing';
  if (value === 'realistic_illustration') return 'realistic_illustration';
  if (value === 'concept_diagram') return 'concept_diagram';
  return 'standard_trace';
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
