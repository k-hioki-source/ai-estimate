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
  | 'concept_diagram'
  | '3d_conversion';

export type ConsultationCategory =
  | 'powerpoint'
  | 'audio'
  | '3dcg_modeling'
  | 'animation'
  | 'video_editing'
  | 'interactive_content'
  | 'combined_production'
  | null;

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

【個別見積り（要相談）の判定】
通常のイラスト制作だけではなく、次の制作工程を実際の依頼内容として含む場合は
requiresConsultation を true にしてください。

・PowerPoint資料、スライド、スライドショー全体の構成・デザイン制作
・ナレーション、セリフ、音声収録、音声生成、音声編集
・仕様が未確定の大規模な3DCGモデリング、複数モデル制作、レンダリングまで含む制作
・2D/3Dアニメーション、モーション制作
・動画編集、映像制作
・インタラクティブアニメーション、WebGL、操作可能な3Dコンテンツ
・上記を複数組み合わせた制作

単語が参考用途として書かれているだけの場合は要相談にしないでください。
例：「納品イラストをPowerPointで使用する」「3DCG風の静止画」は通常見積りです。
例：「PowerPointスライド全体を制作」「3Dモデリングして回転アニメーションを制作」は要相談です。
ただし、2D図面・PDF図面から取扱説明書用の静止した3D組立図、3D部品図、立体図、または単体の3Dモデルを作成する案件は、3d_conversion として通常見積りしてください。

要相談の場合は consultationCategory を最も近い分類にし、
consultationReason に、対応可能だが仕様確認が必要な理由を日本語で簡潔に書いてください。

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

3d_conversion：
2D図面・PDF図面・組立図・部品図を読み取り、立体構造を再構築する作業。
取扱説明書用の3D組立図、3D部品図、立体図、アイソメ図、斜視図、または単体の3Dモデル作成を含む。
単純な線画トレースではなく、図面読解、部品形状の立体化、組立関係の確認が必要。

【作業タイプの判断材料の追加】

■ standard_trace
単体部品・製品を忠実にトレースする作業。

■ technical_drawing
機械構造図・分解図・組立図・部品図。

■ concept_diagram
構造や仕組みを説明するための概念図。
配管・矢印・説明ラベル・情報整理を含む図。

■ 3d_conversion
2D図面やPDF図面から、3D組立図・3D部品図・立体図・3Dモデルを新規作成する作業。
『2D図面から』『PDF図面から』『3D組立図』『3D部品図』『立体図』『アイソメ図』『斜視図』『3Dモデル』が依頼内容に含まれる場合は、technical_drawing より 3d_conversion を優先する。

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

【2D図面から3D化する案件の特別ルール】

次の内容を含む場合は、workType を 3d_conversion としてください。

・2D図面またはPDF図面から3D組立図を作成
・2D図面またはPDF図面から各3D部品図を作成
・組立図・部品図から立体図、アイソメ図、斜視図を新規作成
・2D図面から単体の3Dモデルを作成

この作業は通常の technical_drawing よりも、図面読解、立体構造の再構築、部品形状の推定、組立関係の確認に時間がかかります。
difficultyScore は原則80以上、structureComplexity は原則80以上を目安にしてください。
estimatedHours は20時間前後を基準とし、簡単な単品でも18時間未満にしないでください。
複雑な設備機械、部品点数が多い組立、複数の部品図を含む場合は20〜30時間を目安にしてください。

「3D」という単語だけで判定せず、支給された3DCADを利用するだけの場合は cad_conversion、
2D図面から新たに立体を起こす場合は 3d_conversion と区別してください。

【AI予想制作時間】

estimatedHoursMin
estimatedHours
estimatedHoursMax

を必ず返してください。

これは経験豊富なテクニカルイラストレーターが制作した場合の
実際の制作時間の予測です。

以下を考慮してください。

・制作方法
・用途
・表現方法
・部品点数
・形状の複雑さ
・構造理解
・曲面
・質感
・陰影
・ラベル
・引出し線
・レイアウト設計
・情報整理

制作時間は実際の工数ベースで評価してください。

例

単純な写真トレース
0.8〜1.5時間

取扱説明書用イラスト
2〜4時間

部品点数の多い分解図
5〜8時間

リアルな製品説明図
6〜10時間

販促用リアルイラスト
8〜15時間

複雑な機械製品の販促・WEB用リアルイラスト
15時間前後

【リアルな機械製品の補正】

写真をもとに、電動工具・機械製品・工業製品を販促またはWEB掲載用の
リアルイラストとして制作する場合、次の要素を見落とさないでください。

・複雑な外装形状や曲面
・金属、樹脂、ゴムなど複数素材の描き分け
・細かな段差、継ぎ目、通気口、ネジ、モールド
・陰影、反射、ハイライト、グラデーション
・製品写真として成立する仕上げ品質

これらが複数該当する場合は、単体製品であっても単純な写真トレースとして扱わず、
workType は realistic_illustration、difficultyScore は70〜75以上を目安とし、
estimatedHours は15時間前後を基準にしてください。
特に「販促・WEB掲載」「real」「工業製品」が重なる場合は、
細部と質感の仕上げ工数を十分に加算してください。

【複数の車両・機械製品を並べる案件】

列車、自動車、バス、トラック、重機、機械製品などを
2点以上並べて1枚のイラストにする場合は、
1点の製品イラストとして評価しないでください。

各対象物について個別に、次の作業が発生します。

・正確な形状資料の確認
・写真や資料からの描き起こし
・パース、角度、縮尺の調整
・窓、ライト、連結器、台車、外装部品などの細部描写
・カラーリング、質感、陰影の仕上げ
・横並びにした際の接地位置と全体構図の統一

生成AI画像を構図参考として使用する場合でも、
各対象物の正確な形状資料としてそのまま利用できるとは限らないため、
工数を下げないでください。

写真資料を参考に、異なる3車両を同じ角度・縮尺で横並びにする
販促用カラーイラストの場合は、次を基準にしてください。

・workType：realistic_illustration
・difficultyScore：80〜90
・partDensity：80以上
・lineDifficulty：80以上
・estimatedHoursMin：22時間前後
・estimatedHours：24時間前後
・estimatedHoursMax：28時間前後

「3列車」「3両」「複数車両」「横並び」などの記載を見落とさず、
対象物の数に応じた描画工数を加算してください。

【写真・資料を参考にしたオリジナル作図の特別ルール】

次のような依頼は、写真をそのままなぞる photo_trace / standard_trace として扱わないでください。

・「写真からオリジナルで作成」
・「写真を参考に新規作図」
・「参考写真から新たなイラストを作成」
・「資料を参考にオリジナルで描く」
・複数の写真や資料を参考に、実物とは別構図・別整理でイラストを新規作成する

これは、参考資料を読み取り、形状・パース・構成・見え方を新たに組み立てる作業です。
sourceType が reference_drawing の場合はその意味を尊重し、単なる写真トレースに落とさないでください。

さらに、次が重なる場合は原則 realistic_illustration としてください。

・用途が sales
・表現が real
・自動車、EV、バッテリー、コネクター、機械、工具、装置などの工業製品
・金属、樹脂、ゴム、配線などの質感表現が必要
・陰影、反射、ハイライト、グラデーションを含む

この場合の difficultyScore は最低75程度を基準とし、
lineDifficulty も65以上を目安にしてください。
単純な standard_trace にはしないでください。

販促用のリアルな工業製品を、写真・資料からオリジナルで新規作図する場合、
1点あたりの estimatedHours は25〜28時間前後を基準にしてください。
EV車両と搭載バッテリー、バッテリー筐体、高電圧コネクター、複雑な電装部品など、
形状再構築と細部描写が必要な対象は工数を下げすぎないでください。

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
  "workType": "simple_trace" | "standard_trace" | "technical_drawing" | "realistic_illustration" | "concept_diagram" | "3d_conversion",
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
  "requiresConsultation": boolean,
  "consultationCategory": "powerpoint" | "audio" | "3dcg_modeling" | "animation" | "video_editing" | "interactive_content" | "combined_production" | null,
  "consultationReason": string,
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
    requiresConsultation: parsed.requiresConsultation === true,
    consultationCategory:
      typeof parsed.consultationCategory === 'string'
        ? (parsed.consultationCategory as ConsultationCategory)
        : null,
    consultationReason:
      typeof parsed.consultationReason === 'string'
        ? parsed.consultationReason
        : '',
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
  if (value === '3d_conversion') return '3d_conversion';
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
