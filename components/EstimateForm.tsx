'use client';

import { useEffect, useMemo, useState } from 'react';
import HeaderLinks from "./HeaderLinks";
import AiAssistant from "./estimate/AiAssistant";
type ApiResponse = {
  estimateId: string;

  input: {
    requestFormalQuote: boolean;
  };

  vision: {
    subjectType: string;
    complexityScore: number;
    partDensity: number;
    lineDifficulty: number;
    structureComplexity: number;
    confidence: number;
    reason: string;

    estimatedHoursMin: number;
    estimatedHours: number;
    estimatedHoursMax: number;
  };
  estimate: {
  total: number;
  subtotal: number;
  deliveryDays: string;
  basePrice: number;
  hourlyRate: number;
  estimatedHours: number;
  adjustedHours: number;
  quantity: number;
};
  confidence?: {
  score: number;
  level: string;
  comment: string;
  tips: string[];
  points?: string[];
};
  estimateMatch?: {
    score: number;
    level: string;
    comment: string;
  };
  error?: string;
};

function starText(score: number) {
  const count = Math.max(1, Math.min(5, Math.round(score / 20)));
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

function difficultyLabel(score: number) {
  if (score <= 35) return 'やさしめ';
  if (score <= 65) return '標準からやや複雑';
  return '高難度';
}

export default function EstimateForm() {
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [showSamplePanel, setShowSamplePanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [assistText, setAssistText] = useState('');
  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const agentText = params.get('agentText');

  if (agentText) {
    setAssistText(agentText);
  }
}, []);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistReason, setAssistReason] = useState<string | null>(null);
  const [lastFormData, setLastFormData] = useState<FormData | null>(null);
  const [formalSending, setFormalSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<'line' | 'color' | 'real'>('line');
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [suggestCompleted, setSuggestCompleted] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState('photo_trace');
  const [selectedUsage, setSelectedUsage] = useState('manual');
  const difficultyStars = useMemo(
    () => (result ? starText(result.vision.complexityScore) : ''),
    [result]
  );

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');

      let width = img.width;
      let height = img.height;

      const maxSize = 1600;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);

          resolve(
            new File(
              [blob],
              file.name,
              {
                type: 'image/jpeg',
              }
            )
          );
        },
        'image/jpeg',
        0.8
      );
    };

    img.src = URL.createObjectURL(file);
  });
}
  
function validateCustomerInfo(): boolean {
  const customerNameInput = document.getElementById(
    'customerName'
  ) as HTMLInputElement | null;
  const emailInput = document.getElementById(
    'email'
  ) as HTMLInputElement | null;

  if (!customerName.trim()) {
    setError('ご担当者名を入力してください。');
    customerNameInput?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    customerNameInput?.focus();
    customerNameInput?.reportValidity();
    return false;
  }

  if (!email.trim()) {
    setError('メールアドレスを入力してください。');
    emailInput?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    emailInput?.focus();
    emailInput?.reportValidity();
    return false;
  }

  if (emailInput && !emailInput.checkValidity()) {
    setError('正しい形式のメールアドレスを入力してください。');
    emailInput.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    emailInput.focus();
    emailInput.reportValidity();
    return false;
  }

  return true;
}

async function handleSubmit(formData: FormData) {

  const image = formData.get('image');
const sampleImagePath = formData.get('sampleImagePath');

if (
  (!(image instanceof File) || image.size === 0) &&
  !sampleImagePath
) {
  setError('参考画像をアップロードするか、サンプル画像を選択してください。');
  setLoading(false);
  return;
}
  
  setLoading(true);
  setError(null);
  setResult(null);

  try {
    const image = formData.get('image');

    if (image instanceof File && image.size > 0) {
      const compressed = await compressImage(image);

      formData.set('image', compressed, compressed.name);
    }

    setLastFormData(formData);

    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();

    let json: ApiResponse;
    try {
      json = JSON.parse(text) as ApiResponse;
    } catch {
      throw new Error(
        text || 'サーバーから不正な応答が返されました。画像サイズや形式をご確認ください。'
      );
    }

    if (!res.ok) {
      throw new Error(json.error || '送信に失敗しました。');
    }

    setResult(json);
  } catch (e) {
    setError(e instanceof Error ? e.message : '不明なエラーです。');
  } finally {
    setLoading(false);
  }
}

async function handleSuggestForm() {
  if (!assistText.trim()) {
    setError('依頼内容を入力してください。');
    return;
  }

  setAssistLoading(true);
  setError(null);
  setAssistReason(null);

  try {
    const res = await fetch('/api/suggest-form', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: assistText }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'フォーム提案に失敗しました。');
    }

    if (
      json.sourceType === 'photo_trace' ||
      json.sourceType === 'reference_drawing' ||
      json.sourceType === 'cad_conversion'
    ) {
      setSelectedSourceType(json.sourceType);
    }

    if (
      json.usage === 'manual' ||
      json.usage === 'parts' ||
      json.usage === 'sales'
    ) {
      setSelectedUsage(json.usage);
    }

    if (
      json.style === 'line' ||
      json.style === 'color' ||
      json.style === 'real'
    ) {
      setSelectedStyle(json.style);
    }

    if (typeof json.notes === 'string') {
      setNotes(json.notes);
    }

    setAssistReason(
      typeof json.reason === 'string' ? json.reason : null
    );
    setSuggestCompleted(true);
    setShowEstimateForm(true);

    setTimeout(() => {
      document
        .getElementById('estimate-form-details')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
    }, 100);
  } catch (e) {
    setError(e instanceof Error ? e.message : '不明なエラーです。');
  } finally {
    setAssistLoading(false);
  }
}

function handleClearForm() {
  setAssistText('');
  setAssistReason(null);
  setSelectedSourceType('photo_trace');
  setSelectedUsage('manual');
  setSelectedStyle('line');
  setNotes('');
  setSelectedSample(null);
  setPreview(null);
  setResult(null);
  setError(null);
  setLastFormData(null);
  setShowEstimateForm(false);
  setSuggestCompleted(false);
  setShowSamplePanel(false);

  const imageInput = document.getElementById('image') as HTMLInputElement | null;
  if (imageInput) {
    imageInput.value = '';
  }

  const quantityInput = document.getElementById('quantity') as HTMLInputElement | null;
  if (quantityInput) {
    quantityInput.value = '1';
  }

  const sizeSelect = document.getElementById('size') as HTMLSelectElement | null;
  if (sizeSelect) {
    sizeSelect.value = 'small';
  }

  const rushSelect = document.getElementById('rush') as HTMLSelectElement | null;
  if (rushSelect) {
    rushSelect.value = 'normal';
  }

  const formalCheckbox = document.querySelector(
    'input[name="requestFormalQuote"]'
  ) as HTMLInputElement | null;

  if (formalCheckbox) {
    formalCheckbox.checked = false;
  }
}
  
async function handleFormalQuoteRequest() {
  if (!validateCustomerInfo()) {
    return;
  }

  if (!lastFormData || !result) {
    setError('送信内容が見つかりません。もう一度概算見積りを実行してください。');
    return;
  }

  setFormalSending(true);
  setError(null);

  try {
    const formData = new FormData();

    lastFormData.forEach((value, key) => {
      formData.append(key, value);
    });

    formData.set('companyName', companyName);
    formData.set('customerName', customerName);
    formData.set('email', email);
    formData.set('requestFormalQuote', 'yes');
    formData.set('fixedEstimateId', result.estimateId);
    formData.set('fixedEstimateTotal', String(result.estimate.total));
    formData.set('fixedEstimatedHours', String(result.estimate.estimatedHours));
    formData.set('fixedDifficultyScore', String(result.vision.complexityScore));
    formData.set('fixedSubjectType', result.vision.subjectType);
    formData.set('fixedReason', result.vision.reason);

    if (result.estimateId) {
      formData.set('estimateId', result.estimateId);
    }

    formData.set('fixedSourceType', selectedSourceType);
    formData.set('fixedUsage', selectedUsage);
    formData.set('fixedStyle', selectedStyle);
    formData.set('fixedQuantity', String(result.estimate.quantity));
    formData.set('fixedHourlyRate', String(result.estimate.hourlyRate));
    formData.set('fixedSubtotal', String(result.estimate.subtotal));
    formData.set('fixedDeliveryDays', result.estimate.deliveryDays);
    formData.set('fixedPartDensity', String(result.vision.partDensity));
    formData.set('fixedLineDifficulty', String(result.vision.lineDifficulty));
    formData.set('fixedStructureComplexity', String(result.vision.structureComplexity));
    formData.set('fixedVisionConfidence', String(result.vision.confidence));

    if (result.confidence) {
      formData.set('fixedConfidenceScore', String(result.confidence.score));
      formData.set('fixedConfidenceLevel', result.confidence.level);
      formData.set('fixedConfidenceComment', result.confidence.comment);
      formData.set(
        'fixedConfidencePoints',
        JSON.stringify(result.confidence.points || result.confidence.tips || [])
      );
    }

    if (result.estimateMatch) {
      formData.set('fixedEstimateMatchScore', String(result.estimateMatch.score));
      formData.set('fixedEstimateMatchLevel', result.estimateMatch.level);
      formData.set('fixedEstimateMatchComment', result.estimateMatch.comment);
    }

    const res = await fetch('/api/formal-quote', {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();

    let json: { ok?: boolean; error?: string; message?: string };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(text || '正式見積り依頼の送信に失敗しました。');
    }

    if (!res.ok) {
      throw new Error(json.error || '正式見積り依頼の送信に失敗しました。');
    }

    setResult({
      ...result,
      input: {
        ...result.input,
        requestFormalQuote: true,
      },
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : '不明なエラーです。');
  } finally {
    setFormalSending(false);
  }
}

  const sampleImages = [
  { label: '白黒線画（取扱説明書）', path: '/samples/estimate/manual-line.jpg' },
  { label: 'パーツカタログ', path: '/samples/estimate/parts-catalog.jpg' },
  { label: '分解図', path: '/samples/estimate/exploded-view.jpg' },
  { label: '製品説明図', path: '/samples/estimate/product-explain.jpg' },
  { label: '安全教育イラスト', path: '/samples/estimate/safety.jpg' },
  { label: 'アイソメトリック', path: '/samples/estimate/isometric.jpg' },
  { label: 'リアル製品イラスト', path: '/samples/estimate/real-product.jpg' },
  { label: '人物イラスト', path: '/samples/estimate/person.jpg' },
  { label: '3DCG風イラスト', path: '/samples/estimate/3dcg.jpg' },
];
  
  return (
  <div className="stackLarge">

    {/* ヘッダー（ロゴ） */}
    <div className="header">
      <a href="https://www.create-support.co.jp/" className="logoLink">
        <img src="https://www.create-support.co.jp/public/titlelogo.png" alt="クリエイトサポート" />
      </a>
  <HeaderLinks />
    </div>
<div className="trustBar">
  テクニカルイラスト制作30年以上｜法人対応｜正式見積対応
</div>
  

    {/* ヒーロー */}
    <section className="hero card">
        <div className="heroContent">
          <div className="heroText">
            <div className="eyebrow">AI概算見積り</div>
            <h1 className="heroTitle">
              イラスト制作の概算見積りをその場で確認できます
            </h1>
            <p className="heroLead">
              参考画像と条件を入力するだけで、AIが案件の複雑さを判定し、概算金額を表示します。
              取扱説明書・パーツカタログ・機械イラストに対応しています。
            </p>
            <div className="heroPoints">
              <div className="miniPoint">その場で金額の目安がわかる</div>
              <div className="miniPoint">画像を見て複雑さを数値化</div>
              <div className="miniPoint">正式見積りにもつなげやすい</div>
            </div>
          </div>

          <div className="heroImageWrap">
            <img
              src="https://www.create-support.co.jp/public/hydraulic.png"
              alt="油圧シリンダーのテクニカルイラスト"
              className="heroImage"
            />
          </div>
        </div>
      </section>

    <section className="updateBox">
  <div className="updateBadge">更新情報</div>

  <div>
    <h2 className="updateTitle">
  画像アップロードなしでも見積り可能になりました
</h2>
<p className="updateText">
  参考画像がない方は、9種類のサンプルから近いイメージを選択できます。
  選択したサンプルをもとにAIが概算金額を算出します。
</p>
  </div>
</section>
    
      <section className="card stackLarge">
        <div className="privacyCollectionNotice">
          <strong>個人情報の入力なしで、すぐに概算見積りを試せます。</strong>
          <span>見積り条件・参考画像・AI算出結果は、サービス改善と正式見積り対応のため運営者が収集・確認します。</span>
        </div>

        <div id="ai-assistant-section">
        <AiAssistant
          assistText={assistText}
          assistLoading={assistLoading}
          suggestCompleted={suggestCompleted}
          showEstimateForm={showEstimateForm}
          onAssistTextChange={setAssistText}
          onSuggest={handleSuggestForm}
          onManualInput={() => {
            setSuggestCompleted(false);
            setShowEstimateForm(true);
            setTimeout(() => {
              document.getElementById('estimate-form-details')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }, 100);
          }}
        />
        </div>

        {showEstimateForm ? (
          <div id="estimate-form-details" className="estimateFormReveal">
            <div className="aiSelectedNotice aiSelectedNoticeCard">
              <div>
                <strong>
                  {suggestCompleted
                    ? 'AIが見積り条件を提案しました'
                    : '見積り条件を入力してください'}
                </strong>
                <span>
                  選択内容は固定ではありません。必要に応じて自由に変更できます。
                </span>
              </div>

              {suggestCompleted ? (
                <button
                  type="button"
                  className="editAiRequestButton editAiRequestButtonPrimary"
                  onClick={() => {
                    setShowEstimateForm(false);
                    setSuggestCompleted(false);

                    document.getElementById('ai-assistant-section')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                >
                  依頼内容を入力し直す
                </button>
              ) : null}
            </div>

            {suggestCompleted ? (
              <section className="aiProposalCard" aria-labelledby="ai-proposal-title">
                <div className="aiProposalHeader">
                  <div>
                    <span className="aiProposalEyebrow">AI SUGGESTION</span>
                    <h3 id="ai-proposal-title">AIの提案内容</h3>
                  </div>
                  <span className="aiProposalStatus">3項目を自動設定</span>
                </div>

                <div className="aiProposalGrid">
                  <div className="aiProposalItem">
                    <span>制作方法／資料</span>
                    <strong>
                      {selectedSourceType === 'photo_trace'
                        ? '写真・画像トレース'
                        : selectedSourceType === 'reference_drawing'
                          ? '写真・図面・資料から作図'
                          : 'XVL・3DCADから作成'}
                    </strong>
                  </div>

                  <div className="aiProposalItem">
                    <span>用途</span>
                    <strong>
                      {selectedUsage === 'manual'
                        ? '取扱説明書・組立説明書・サービスマニュアル'
                        : selectedUsage === 'parts'
                          ? 'パーツカタログ・分解図・構成図'
                          : '製品説明・WEBサイト・パンフレット・販促資料'}
                    </strong>
                  </div>

                  <div className="aiProposalItem">
                    <span>イラスト表現</span>
                    <strong>
                      {selectedStyle === 'line'
                        ? '白黒線画'
                        : selectedStyle === 'color'
                          ? 'カラーイラスト'
                          : 'リアルイラスト'}
                    </strong>
                  </div>
                </div>

                {assistReason ? (
                  <div className="aiProposalReason">
                    <span className="aiProposalReasonIcon" aria-hidden="true">✦</span>
                    <div>
                      <strong>AIの判断理由</strong>
                      <p>{assistReason}</p>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <style jsx>{`
              .aiSelectedNoticeCard {
                margin-bottom: 16px;
                padding: 16px 18px;
                border: 1px solid #c8ddf7;
                border-radius: 16px;
                background: #f4f8ff;
              }

              .editAiRequestButtonPrimary {
                min-height: 42px;
                padding: 9px 18px;
                border: 1px solid #1676df;
                border-radius: 10px;
                background: #ffffff;
                color: #1261b8;
                font-weight: 800;
                cursor: pointer;
                transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
              }

              .editAiRequestButtonPrimary:hover {
                background: #1676df;
                color: #ffffff;
                transform: translateY(-1px);
              }

              .aiProposalCard {
                margin-bottom: 22px;
                padding: 22px;
                border: 1px solid #cfe0f4;
                border-radius: 18px;
                background: linear-gradient(135deg, #f7fbff 0%, #ffffff 72%);
                box-shadow: 0 10px 28px rgba(34, 79, 130, 0.07);
              }

              .aiProposalHeader {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 16px;
              }

              .aiProposalEyebrow {
                display: block;
                margin-bottom: 4px;
                color: #1473d4;
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0.14em;
              }

              .aiProposalHeader h3 {
                margin: 0;
                color: #102f54;
                font-size: 20px;
                line-height: 1.4;
              }

              .aiProposalStatus {
                flex: 0 0 auto;
                padding: 7px 11px;
                border-radius: 999px;
                background: #e8f3ff;
                color: #1261b8;
                font-size: 12px;
                font-weight: 800;
              }

              .aiProposalGrid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
              }

              .aiProposalItem {
                min-width: 0;
                padding: 15px;
                border: 1px solid #e0e8f2;
                border-radius: 13px;
                background: #ffffff;
              }

              .aiProposalItem span,
              .aiProposalItem strong {
                display: block;
              }

              .aiProposalItem span {
                margin-bottom: 6px;
                color: #687b91;
                font-size: 12px;
                font-weight: 700;
              }

              .aiProposalItem strong {
                color: #132f51;
                font-size: 14px;
                line-height: 1.6;
                overflow-wrap: anywhere;
              }

              .aiProposalReason {
                display: flex;
                gap: 11px;
                margin-top: 14px;
                padding: 14px 15px;
                border-left: 4px solid #1ba9e5;
                border-radius: 10px;
                background: #eef9ff;
              }

              .aiProposalReasonIcon {
                color: #098ac7;
                font-size: 18px;
                line-height: 1.2;
              }

              .aiProposalReason strong {
                display: block;
                margin-bottom: 3px;
                color: #0e5c90;
                font-size: 13px;
              }

              .aiProposalReason p {
                margin: 0;
                color: #425d75;
                font-size: 13px;
                line-height: 1.75;
              }

              @media (max-width: 760px) {
                .aiSelectedNoticeCard,
                .aiProposalHeader {
                  align-items: stretch;
                  flex-direction: column;
                }

                .editAiRequestButtonPrimary {
                  width: 100%;
                }

                .aiProposalGrid {
                  grid-template-columns: 1fr;
                }

                .aiProposalStatus {
                  align-self: flex-start;
                }
              }
            `}</style>

            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                await handleSubmit(formData);
              }}
            >
              <div className="grid grid-2">
                <div>
                  <label htmlFor="quantity">点数</label>
                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-2">
                <div>
                  <label htmlFor="sourceType">制作方法／資料</label>
                  <select
                    id="sourceType"
                    name="sourceType"
                    value={selectedSourceType}
                    onChange={(e) => setSelectedSourceType(e.target.value)}
                  >
                    <option value="photo_trace">写真・画像トレース</option>
                    <option value="reference_drawing">写真・図面・資料から作図</option>
                    <option value="cad_conversion">XVL・3DCADから作成</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="usage">用途（必須）</label>
                  <select
                    id="usage"
                    name="usage"
                    value={selectedUsage}
                    onChange={(e) => setSelectedUsage(e.target.value)}
                  >
                    <option value="manual">
                      取扱説明書・組立説明書・サービスマニュアル
                    </option>
                    <option value="parts">
                      パーツカタログ・分解図・構成図
                    </option>
                    <option value="sales">
                      製品説明・WEBサイト・パンフレット・販促資料
                    </option>
                  </select>
                </div>

                <div className="gridSpan2">
                  <label>イラスト表現（必須）</label>

                  <div className="styleGrid">
                    <label className="styleCard">
                      <input
                        type="radio"
                        name="style"
                        value="line"
                        checked={selectedStyle === 'line'}
                        onChange={() => setSelectedStyle('line')}
                      />
                      <img src="/samples/line.jpg" alt="白黒線画" />
                      <div className="styleBody">
                        <strong>白黒線画</strong>
                        <span>取扱説明書・パーツカタログ向け</span>
                      </div>
                    </label>

                    <label className="styleCard">
                      <input
                        type="radio"
                        name="style"
                        value="color"
                        checked={selectedStyle === 'color'}
                        onChange={() => setSelectedStyle('color')}
                      />
                      <img src="/samples/color.jpg" alt="カラーイラスト" />
                      <div className="styleBody">
                        <strong>カラーイラスト</strong>
                        <span>製品説明・WEB・プレゼン資料向け</span>
                      </div>
                    </label>

                    <label className="styleCard">
                      <input
                        type="radio"
                        name="style"
                        value="real"
                        checked={selectedStyle === 'real'}
                        onChange={() => setSelectedStyle('real')}
                      />
                      <img src="/samples/real.jpg" alt="リアルイラスト" />
                      <div className="styleBody">
                        <strong>リアルイラスト</strong>
                        <span>販促・広告・メインビジュアル向け</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="size">サイズ感</label>
                  <select id="size" name="size" defaultValue="small">
                    <option value="small">小</option>
                    <option value="medium">中</option>
                    <option value="large">大</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="rush">納期</label>
                  <select id="rush" name="rush" defaultValue="normal">
                    <option value="normal">通常</option>
                    <option value="rush">特急</option>
                  </select>
                </div>

                <div className="gridSpan2">
                  <div className="imageSection">
                    <label htmlFor="image">
                      参考画像（画像、図面、写真、原稿、ポンチ絵など）
                    </label>

                    <input
                      id="image"
                      name="image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];

                        if (!file) {
                          setPreview(null);
                          return;
                        }

                        setSelectedSample(null);
                        setPreview(URL.createObjectURL(file));
                      }}
                    />

                    <p className="uploadNotice">
                      <em>
                        ※アップロードいただいた画像・図面データは、お見積り算出の目的にのみ使用いたします。<br />
                        AIの学習データとして利用されることはありません。<br />
                        また、データは一定時間後に自動削除されますので、安心してご利用ください。
                      </em>
                    </p>

                    <label className="sampleToggleLabel">
                      <input
                        type="checkbox"
                        checked={showSamplePanel}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setShowSamplePanel(checked);

                          if (!checked) {
                            setSelectedSample(null);
                          }
                        }}
                      />
                      <span>参考画像をお持ちでない方はこちら</span>
                    </label>

                    <p className="muted compactText">
                      チェックを入れると、希望に近いサンプル画像を選択できます。
                    </p>

                    {showSamplePanel ? (
                      <>
                        <div className="sampleGrid">
                          {sampleImages.map((sample) => (
                            <button
                              key={sample.path}
                              type="button"
                              className={
                                selectedSample === sample.path
                                  ? 'sampleCard selected'
                                  : 'sampleCard'
                              }
                              onClick={() => {
                                setSelectedSample(sample.path);
                                setPreview(sample.path);

                                const imageInput = document.getElementById(
                                  'image'
                                ) as HTMLInputElement | null;

                                if (imageInput) {
                                  imageInput.value = '';
                                }
                              }}
                            >
                              <img src={sample.path} alt={sample.label} />
                              <span>{sample.label}</span>
                            </button>
                          ))}
                        </div>

                        {selectedSample ? (
                          <input
                            type="hidden"
                            name="sampleImagePath"
                            value={selectedSample}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="notes">
                  イラストの内容・制作条件（詳しく入力すると見積り精度が向上します）
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`例：
・分解図
・部品点数20点
・支給：写真、2D図面、組図
・AI納品希望
・WEB掲載用
・リアルタッチ希望`}
                />
              </div>

              {preview ? (
                <img src={preview} alt="選択中の参考画像" className="preview" />
              ) : null}

              <div className="formActions">
                <button
                  type="submit"
                  disabled={loading}
                  className="primaryButton"
                >
                  {loading
                    ? 'AIが画像を解析しています...'
                    : '概算金額を表示する'}
                </button>

                <button
                  type="button"
                  className="clearButton"
                  onClick={handleClearForm}
                  disabled={loading}
                >
                  入力内容をクリア
                </button>
              </div>
            </form>

            <div className="trustBox">
              <h3 className="trustTitle">対応実績</h3>
              <ul className="trustList">
                <li>自動車・バイク・重機の取扱説明書イラスト</li>
                <li>パーツカタログ用の分解図・構成図</li>
                <li>機械部品や設備のリアルイラスト</li>
              </ul>
            </div>
          </div>
        ) : null}
      </section>
{loading && (
  <div className="loadingCard">

    <div className="loadingSpinner" />

    <h3>AIが概算見積りを計算中です</h3>

    <ul className="loadingSteps">
      <li>画像を解析しています...</li>
      <li>構造の複雑さを判定しています...</li>
      <li>制作工数を計算しています...</li>
      <li>概算金額を算出しています...</li>
    </ul>

    <p className="loadingNote">
      通常5〜15秒ほどで完了します
    </p>

  </div>
)}
      {error ? <div className="errorBox">エラー: {error}</div> : null}

            {result ? (
        <section className="stackLarge">
          <div className="resultHero card">
            <div className="badgeRow">
              <div className="badge">概算見積り結果</div>
              <div className="scorePill">難易度 {difficultyStars}</div>
            </div>

            <div className="resultTopGrid">
              <div>
                <p className="resultAmountLabel">概算金額</p>
                <h2 className="resultAmount">
                  {result.estimate.total.toLocaleString()}円
                </h2>
                <p className="muted">納期目安: {result.estimate.deliveryDays}</p>
              </div>

              

              <div className="summaryCard">
                <div className="summaryItem">
                  <span>対象</span>
                  <strong>{result.vision.subjectType}</strong>
                </div>
                <div className="summaryItem">
                  <span>難易度スコア</span>
                  <strong>{result.vision.complexityScore}</strong>
                </div>
                <div className="summaryItem">
                  <span>難易度</span>
                  <strong>
                    {difficultyLabel(result.vision.complexityScore)}
                  </strong>
                </div>
              </div>
            </div>

           {result?.confidence ? (
  <div className="confidenceBox">
    <div className="confidenceHeader">
      <span>AI見積り信頼度</span>
      <strong>{result.confidence.score}%</strong>
    </div>

    <p className="confidenceLevel">
      判定：{result.confidence.level}
    </p>

    <p className="confidenceComment">
      {result.confidence.comment}
    </p>

    {result.confidence.points && result.confidence.points.length > 0 ? (
  <div className="confidencePoints">
    <strong>AIが解析したポイント</strong>
    <ul>
      {result.confidence.points.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ul>
  </div>
) : null}
    
    <p className="confidenceComment">
      概算制作時間：{result.estimate.estimatedHours}時間
    </p>
  </div>
) : null}
            
            <p className="noticeText">
              ※この金額は参考画像と入力条件から算出した概算です。正式なお見積りは、内容確認後にご案内いたします。
            </p>
          </div>

          <div className="grid grid-2">
            <div className="resultBox">
              <div className="badge">AI判定</div>
              <ul className="list cleanList">
                <li><span>部品密度</span><strong>{result.vision.partDensity}</strong></li>
                <li><span>線の難しさ</span><strong>{result.vision.lineDifficulty}</strong></li>
                <li><span>構造難度</span><strong>{result.vision.structureComplexity}</strong></li>
                <li><span>信頼度</span><strong>{result.vision.confidence}</strong></li>
              </ul>
              <p className="footerNote">判定理由: {result.vision.reason}</p>
            </div>

            <div className="resultBox">
              <div className="badge">計算内訳</div>
              <ul className="list cleanList">
               <li>
  <span>想定制作時間</span>
  <strong>{result.estimate.estimatedHours}時間</strong>
</li>
<li>
  <span>作業内容</span>
  <strong>{result.vision.subjectType}</strong>
</li>
                <li>
                  <span>制作単価</span>
                  <strong>{result.estimate.hourlyRate.toLocaleString()}円 / 時間</strong>
                </li>
                <li>
                  <span>1点あたり</span>
                  <strong>{result.estimate.subtotal.toLocaleString()}円</strong>
                </li>
                <li>
                  <span>点数</span>
                  <strong>{result.estimate.quantity}</strong>
                </li>
              </ul>
            </div>
          </div>

          <div className="ctaCard card">
            <div>
              <div className="eyebrow">正式見積り・メール送付</div>
              <h3 className="ctaTitle">見積り結果をメールで受け取るには、正式見積りをご依頼ください</h3>
              <p className="muted compactText">
                会社名・ご担当者名・メールアドレスをご入力いただくと、今回の概算結果をメールでお送りし、同時に正式見積り依頼として受け付けます。
              </p>
            </div>

            {result.input.requestFormalQuote ? (
              <div className="ctaButtonLike">
                正式見積り依頼を受け付けました。概算結果をメールで送信しています。
              </div>
            ) : (
              <div className="formalQuoteForm">
                <div className="grid grid-2">
                  <div>
                    <label htmlFor="formalCompanyName">会社名</label>
                    <input
                      id="formalCompanyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="株式会社◯◯"
                    />
                  </div>
                  <div>
                    <label htmlFor="customerName">ご担当者名（必須）</label>
                    <input
                      id="customerName"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                    />
                  </div>
                  <div className="gridSpan2">
                    <label htmlFor="email">メールアドレス（必須）</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="sample@example.com"
                      required
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="primaryButton"
                  onClick={handleFormalQuoteRequest}
                  disabled={formalSending}
                >
                  {formalSending ? '正式見積り依頼を送信中...' : '概算結果をメールで受け取り、正式見積りを依頼する'}
                </button>
                <p className="footerNote">
                  ※この操作により、入力情報・参考画像・見積り結果が株式会社クリエイトサポートへ送信されます。
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <footer className="footer">
        <div className="footerInner">
          <div className="footerBrand">
            <a href="https://www.create-support.co.jp/" className="footerLogo">
              クリエイトサポート
            </a>
            <p className="footerDesc">
              テクニカルイラスト・取扱説明書・パーツカタログ制作
            </p>
          </div>

          <ul className="footerLinks">
            <li><a href="https://www.create-support.co.jp/">ホーム</a></li>
            <li><a href="https://www.create-support.co.jp/technicalillustration/">テクニカルイラストについて</a></li>
            <li><a href="https://www.create-support.co.jp/sample-page/">制作事例</a></li>
            <li><a href="https://www.create-support.co.jp/topics/">ブログ</a></li>
            <li><a href="https://www.create-support.co.jp/company/">会社概要</a></li>
            <li><a href="https://www.create-support.co.jp/contact/">お問い合わせ</a></li>
            <li><a href="https://www.create-support.co.jp/techlineworks-technical-illustration-download/">イラスト素材販売</a></li>
          </ul>

          <div className="footerCopy">
            © Create Support Co., Ltd.
          </div>
        </div>
      </footer>
    </div>
       
  );
}
