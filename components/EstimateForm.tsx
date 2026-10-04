'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import HeaderLinks from "./HeaderLinks";
import AiAssistant from "./estimate/AiAssistant";
import EstimateSave from "./estimate/EstimateSave";
type ApiResponse = {
  estimateId: string;
  requiresConsultation?: boolean;
  consultationCategory?: string | null;
  consultationMessage?: string;
  showIllustrationReferencePrice?: boolean;
  illustrationReferencePrice?: number | null;

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

type SiteAnnouncement = {
  id: string;
  label: string;
  title: string;
  body: string;
  is_active: boolean;
};

export default function EstimateForm() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [siteAnnouncement, setSiteAnnouncement] = useState<SiteAnnouncement | null>(null);
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
  const [consultationMessage, setConsultationMessage] = useState('');
  const [consultSending, setConsultSending] = useState(false);
  const [consultSent, setConsultSent] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const pdfContentRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<'line' | 'color' | 'real'>('line');
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [suggestCompleted, setSuggestCompleted] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState('photo_trace');
  const [selectedUsage, setSelectedUsage] = useState('manual');

  // CS Works: ログイン状態を確認し、未ログイン時だけサービス紹介を表示する
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setAuthChecked(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // トップページのお知らせをSupabaseから取得
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    (async () => {
      const { data, error } = await (supabase.from('site_announcements' as any) as any)
        .select('id, label, title, body, is_active')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error('Announcement load error:', error);
        setSiteAnnouncement(null);
        return;
      }

      setSiteAnnouncement((data as SiteAnnouncement | null) ?? null);
    })();

    return () => {
      mounted = false;
    };
  }, []);

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
    if (json.requiresConsultation) {
      setConsultationMessage('詳しい内容を確認のうえ、個別見積りを希望します。');
    }
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
  setConsultationMessage('');
  setConsultSent(false);
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
  
async function handleConsultRequest() {
  if (!validateCustomerInfo()) {
    return;
  }

  if (!result) {
    setError('見積り結果が見つかりません。もう一度概算見積りを実行してください。');
    return;
  }

  if (!consultationMessage.trim()) {
    setError('相談内容を入力してください。');
    document.getElementById('consultationMessage')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    document.getElementById('consultationMessage')?.focus();
    return;
  }

  setConsultSending(true);
  setError(null);

  try {
    const res = await fetch('/api/consult', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estimateId: result.estimateId,
        company: companyName,
        name: customerName,
        email,
        consultationMessage: consultationMessage.trim(),
        productionMethod: selectedSourceType,
        usage: selectedUsage,
        style: selectedStyle,
        quantity: result.estimate.quantity,
        sourceType: selectedSourceType,
        notes,
        workType: result.vision.subjectType,
        difficultyScore: result.vision.complexityScore,
        estimatedHours: result.estimate.estimatedHours,
        estimatedHoursMin: result.vision.estimatedHoursMin,
        estimatedHoursMax: result.vision.estimatedHoursMax,
        totalPrice: result.estimate.total,
        confidenceScore: result.confidence?.score,
        confidenceLevel: result.confidence?.level,
        confidenceComment: result.confidence?.comment,
        aiReason: result.vision.reason,
        imageFilename: selectedSample || undefined,
      }),
    });

    const text = await res.text();
    let json: { success?: boolean; error?: string; message?: string };

    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(text || '相談内容の送信に失敗しました。');
    }

    if (!res.ok) {
      throw new Error(json.error || '相談内容の送信に失敗しました。');
    }

    setConsultSent(true);
  } catch (e) {
    setError(e instanceof Error ? e.message : '不明なエラーです。');
  } finally {
    setConsultSending(false);
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

  async function handleDownloadPdf() {
    if (!result || !pdfContentRef.current || pdfDownloading) return;

    setPdfDownloading(true);
    setError(null);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const source = pdfContentRef.current;
      const canvas = await html2canvas(source, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: source.scrollWidth,
      });

      const imageData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const imageHeight = (canvas.height * usableWidth) / canvas.width;

      if (imageHeight <= usableHeight) {
        pdf.addImage(imageData, 'JPEG', margin, margin, usableWidth, imageHeight, undefined, 'FAST');
      } else {
        const pageCanvas = document.createElement('canvas');
        const pageContext = pageCanvas.getContext('2d');

        if (!pageContext) {
          throw new Error('PDF生成用の描画領域を作成できませんでした。');
        }

        const pixelsPerMm = canvas.width / usableWidth;
        const pageSliceHeight = Math.floor(usableHeight * pixelsPerMm);
        let sourceY = 0;
        let pageIndex = 0;

        while (sourceY < canvas.height) {
          const sliceHeight = Math.min(pageSliceHeight, canvas.height - sourceY);
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;
          pageContext.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageContext.fillStyle = '#ffffff';
          pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageContext.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sliceHeight,
            0,
            0,
            canvas.width,
            sliceHeight
          );

          const sliceData = pageCanvas.toDataURL('image/jpeg', 0.95);
          const sliceHeightMm = sliceHeight / pixelsPerMm;

          if (pageIndex > 0) pdf.addPage();
          pdf.addImage(sliceData, 'JPEG', margin, margin, usableWidth, sliceHeightMm, undefined, 'FAST');

          sourceY += sliceHeight;
          pageIndex += 1;
        }
      }

      pdf.save(`${result.estimateId || 'AI概算見積り'}.pdf`);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? `PDFの作成に失敗しました: ${e.message}`
          : 'PDFの作成に失敗しました。'
      );
    } finally {
      setPdfDownloading(false);
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
  

    {/* ヒーロー：AI概算見積りを主役として維持 */}
    <section className="hero card">
      <div className="heroContent">
        <div className="heroText">
          <div className="eyebrow">{authChecked && !user ? 'CS Works｜AI概算見積り' : 'AI概算見積り'}</div>
          <h1 className="heroTitle">イラスト制作の概算見積りをその場で確認できます</h1>
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
          <img src="https://www.create-support.co.jp/public/hydraulic.png" alt="油圧シリンダーのテクニカルイラスト" className="heroImage" />
        </div>
      </div>
    </section>

    {authChecked && !user ? (
      <section className="csWorksBridge card">
        <div className="csWorksBridgeTop">
          <div>
            <div className="eyebrow">CS WORKS</div>
            <h2 className="csWorksBridgeTitle">見積りから納品まで、ひとつの場所で。</h2>
            <p className="csWorksBridgeLead">
              CS Worksは、クリエイトサポートへの制作依頼をオンラインで進められるサービスです。
              AI概算見積りは登録なしですぐに利用できます。無料会員登録すると、その見積りを保存して、正式見積り・発注・案件確認・納品まで続けて管理できます。
            </p>
          </div>
          <div className="csWorksBridgeActions">
            <Link href="/signup" className="csWorksPrimaryCta">無料会員登録</Link>
            <Link href="/login" className="csWorksSecondaryCta">ログイン</Link>
          </div>
        </div>
        <div className="csWorksBridgeFlow" aria-label="CS Worksの利用の流れ">
          <span>AI概算見積り</span><b>→</b><span>保存</span><b>→</b><span>正式見積り</span><b>→</b><span>発注</span><b>→</b><span>案件管理</span><b>→</b><span>納品</span>
        </div>
      </section>
    ) : null}

    {authChecked && !user && siteAnnouncement ? (
      <section className="updateBox" id="ai-estimate">
        <div className="updateBadge">{siteAnnouncement.label}</div>
        <div>
          <h2 className="updateTitle">{siteAnnouncement.title}</h2>
          <p className="updateText">{siteAnnouncement.body}</p>
        </div>
      </section>
    ) : null}

      <section className="card stackLarge">
        {authChecked && !user ? (
          <div className="privacyCollectionNotice">
            <strong>個人情報の入力なしで、すぐに概算見積りを試せます。</strong>
            <span>見積り条件・参考画像・AI算出結果は、サービス改善と正式見積り対応のため運営者が収集・確認します。</span>
          </div>
        ) : null}

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

            <style>{`
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
          <div ref={pdfContentRef} className="stackLarge pdfCaptureArea">
          <div className="pdfReportHeader">
            <div>
              <div className="pdfReportEyebrow">CREATE SUPPORT</div>
              <h1 className="pdfReportTitle">AI概算見積り結果</h1>
              <p className="pdfReportSubTitle">テクニカルイラスト・取扱説明書・パーツカタログ制作</p>
            </div>
            <div className="pdfEstimateMeta">
              <span>見積ID</span>
              <strong>{result.estimateId}</strong>
            </div>
          </div>

          {preview ? (
            <div className="pdfReferenceImageCard">
              <div className="pdfSectionLabel">判定対象画像</div>
              <img
                src={preview}
                alt="AI判定に使用した参考画像"
                className="pdfReferenceImage"
                crossOrigin="anonymous"
              />
            </div>
          ) : null}

          <div className="resultHero card">
            <div className="badgeRow">
              <div className="badge">概算見積り結果</div>
              <div className="scorePill">難易度 {difficultyStars}</div>
            </div>

            <div className="resultTopGrid">
              <div>
                <p className="resultAmountLabel">
                  {result.requiresConsultation ? 'お見積り方法' : '概算金額'}
                </p>
                <h2 className="resultAmount">
                  {result.requiresConsultation
                    ? '個別見積り（要相談）'
                    : `${result.estimate.total.toLocaleString()}円`}
                </h2>
                {result.requiresConsultation ? (
                  <>
                    <p className="muted">
                      {result.consultationMessage ||
                        '対応可能な内容ですが、詳しい仕様を確認のうえお見積りいたします。'}
                    </p>
                    {result.showIllustrationReferencePrice &&
                    result.illustrationReferencePrice != null ? (
                      <div className="illustrationReferencePrice">
                        <span>イラスト制作部分の参考価格</span>
                        <strong>
                          {result.illustrationReferencePrice.toLocaleString()}円〜
                        </strong>
                        <p>
                          ※イラスト制作のみの参考価格です。PowerPoint制作、
                          ナレーション・音声編集、3DCG・アニメーション、
                          動画編集、インタラクティブ制作などの費用は含まれていません。
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">納期目安: {result.estimate.deliveryDays}</p>
                )}
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

           {!result.requiresConsultation && result?.confidence ? (
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
              {result.requiresConsultation
                ? '※参考価格は制作全体の総額ではありません。「この内容について相談する」から詳細をお送りください。'
                : '※この金額は参考画像と入力条件から算出した概算です。正式なお見積りは、内容確認後にご案内いたします。'}
            </p>
          </div>

          {!result.requiresConsultation ? <div className="grid grid-2">
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
          </div> : null}

          <div className="pdfReportFooter">
            <div className="pdfFooterCompany">
              <strong>株式会社クリエイトサポート</strong>
              <span>担当　日置　勝己</span>
            </div>
            <div className="pdfFooterGrid">
              <div>
                <span>携帯 090-2943-2763</span>
                <span>e-mail: k-hioki@create-support.co.jp</span>
                <span>Homepage: https://www.create-support.co.jp/</span>
              </div>
              <div>
                <strong>多治見オフィス</strong>
                <span>電話 0572-74-1985</span>
                <span>〒507-0038 岐阜県多治見市白山町５－１７－３</span>
                <span>梅村ビル３F</span>
              </div>
            </div>
          </div>
          </div>

          <div className="pdfDownloadArea">
            <button
              type="button"
              className="pdfDownloadButton"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
            >
              {pdfDownloading ? 'PDFを作成中...' : 'PDFでダウンロード'}
            </button>
            <p className="pdfDownloadNote">
              画面に表示された概算見積り結果をPDFファイルとして保存できます。
            </p>
          </div>

          <style>{`
            .pdfCaptureArea {
              width: 100%;
              background: #ffffff;
              padding: 18px;
              box-sizing: border-box;
            }

            .pdfReportHeader {
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              gap: 20px;
              padding: 22px 24px;
              border-radius: 18px;
              background: linear-gradient(135deg, #0d5fa8 0%, #1676df 55%, #23a8de 100%);
              color: #ffffff;
            }

            .pdfReportEyebrow {
              margin-bottom: 4px;
              font-size: 11px;
              font-weight: 900;
              letter-spacing: 0.16em;
              opacity: 0.9;
            }

            .pdfReportTitle {
              margin: 0;
              color: #ffffff;
              font-size: 28px;
              line-height: 1.25;
            }

            .pdfReportSubTitle {
              margin: 7px 0 0;
              color: rgba(255,255,255,0.9);
              font-size: 12px;
            }

            .pdfEstimateMeta {
              flex: 0 0 auto;
              min-width: 210px;
              padding: 12px 14px;
              border: 1px solid rgba(255,255,255,0.28);
              border-radius: 12px;
              background: rgba(255,255,255,0.12);
            }

            .pdfEstimateMeta span,
            .pdfEstimateMeta strong {
              display: block;
            }

            .pdfEstimateMeta span {
              margin-bottom: 4px;
              font-size: 11px;
              opacity: 0.82;
            }

            .pdfEstimateMeta strong {
              font-size: 14px;
              overflow-wrap: anywhere;
            }

            .pdfReferenceImageCard {
              padding: 18px;
              border: 1px solid #d9e5f2;
              border-radius: 16px;
              background: #f8fbff;
              text-align: center;
            }

            .pdfSectionLabel {
              margin-bottom: 10px;
              color: #4d657d;
              font-size: 12px;
              font-weight: 800;
              text-align: left;
            }

            .pdfReferenceImage {
              display: block;
              width: auto;
              max-width: 100%;
              max-height: 320px;
              margin: 0 auto;
              object-fit: contain;
              border-radius: 10px;
              background: #ffffff;
            }

            .pdfReportFooter {
              margin-top: 4px;
              padding: 20px 22px;
              border-top: 4px solid #1676df;
              border-radius: 14px;
              background: #f4f8fc;
              color: #334e68;
            }

            .pdfFooterCompany {
              display: flex;
              align-items: baseline;
              gap: 14px;
              margin-bottom: 12px;
            }

            .pdfFooterCompany strong {
              color: #123c67;
              font-size: 16px;
            }

            .pdfFooterCompany span {
              font-size: 12px;
            }

            .pdfFooterGrid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 18px;
              font-size: 11px;
              line-height: 1.75;
            }

            .pdfFooterGrid > div {
              display: flex;
              flex-direction: column;
            }

            .pdfFooterGrid strong {
              color: #123c67;
              font-size: 12px;
            }

            .pdfDownloadArea {
              display: flex;
              align-items: center;
              gap: 14px;
              flex-wrap: wrap;
              padding: 4px 0;
            }

            .pdfDownloadButton {
              min-height: 48px;
              padding: 12px 22px;
              border: 1px solid #1676df;
              border-radius: 10px;
              background: #1676df;
              color: #ffffff;
              font-size: 15px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 5px 14px rgba(22, 118, 223, 0.18);
            }

            .pdfDownloadButton:hover:not(:disabled) {
              background: #1268c7;
            }

            .pdfDownloadButton:disabled {
              cursor: wait;
              opacity: 0.68;
            }

            .pdfDownloadNote {
              margin: 0;
              color: #64748b;
              font-size: 12px;
              line-height: 1.6;
            }

            @media (max-width: 640px) {
              .pdfDownloadArea {
                align-items: stretch;
                flex-direction: column;
              }

              .pdfDownloadButton {
                width: 100%;
              }

              .pdfReportHeader {
                align-items: stretch;
                flex-direction: column;
              }

              .pdfEstimateMeta {
                min-width: 0;
              }

              .pdfFooterGrid {
                grid-template-columns: 1fr;
              }

              .pdfFooterCompany {
                align-items: flex-start;
                flex-direction: column;
                gap: 3px;
              }
            }
          `}</style>

          {user ? (
          <EstimateSave
  estimateId={result.estimateId}
  productionMethod={selectedSourceType}
  usage={selectedUsage}
  expression={selectedStyle}
  quantity={result.estimate.quantity}
  estimatedHours={result.estimate.estimatedHours}
  estimatedAmount={result.estimate.total}
  complexityScore={result.vision.complexityScore}
  confidence={result.confidence?.score}
  aiComment={result.vision.reason}
  customerNotes={notes}
  imageFile={
    lastFormData?.get('image') instanceof File &&
    (lastFormData.get('image') as File).size > 0
      ? (lastFormData.get('image') as File)
      : null
  }
  sampleImagePath={selectedSample}
  inputData={{
    productionMethod: selectedSourceType,
    usage: selectedUsage,
    expression: selectedStyle,
    quantity: result.estimate.quantity,
    notes,
  }}
  analysisData={{
    subjectType: result.vision.subjectType,
    complexityScore: result.vision.complexityScore,
    partDensity: result.vision.partDensity,
    lineDifficulty: result.vision.lineDifficulty,
    structureComplexity:
      result.vision.structureComplexity,
    visionConfidence: result.vision.confidence,
    estimatedHoursMin:
      result.vision.estimatedHoursMin,
    estimatedHours:
      result.vision.estimatedHours,
    estimatedHoursMax:
      result.vision.estimatedHoursMax,
    confidence: result.confidence ?? null,
    estimateMatch: result.estimateMatch ?? null,
  }}
/>
          ) : null}
          
          <div className="ctaCard card csWorksResultCta">
            {user ? (
              <div>
                <div className="eyebrow">CS Works</div>
                <h3 className="ctaTitle">この見積りを保存して、案件につなげられます</h3>
                <p className="muted compactText">
                  見積り結果の保存後は、マイページから案件の確認やご相談ができます。
                </p>
                <Link href="/mypage" className="primaryButton csWorksInlineButton">マイページを開く</Link>
              </div>
            ) : (
              <div>
                <div className="eyebrow">CS Works</div>
                <h3 className="ctaTitle">見積りの続きは、CS Worksで。</h3>
                <p className="muted compactText">
                  無料会員登録すると、見積り結果の保存、正式見積り、発注、案件確認、納品までオンラインで進められます。
                </p>
                <div className="csWorksResultActions">
                  <Link href="/signup" className="primaryButton csWorksInlineButton">無料会員登録</Link>
                  <Link href="/login" className="csWorksSecondaryCta">ログイン</Link>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <style>{`
        .csWorksHero { overflow: hidden; padding: 0; background: linear-gradient(135deg, #f7fbff 0%, #ffffff 55%, #eef8ff 100%); border: 1px solid #d7e7f7; }
        .csWorksHeroContent { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); gap: 42px; align-items: center; padding: 54px 52px; }
        .csWorksBrandRow { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .csWorksBrand { color: #0d67bd; font-size: 18px; font-weight: 900; letter-spacing: .04em; }
        .csWorksBeta { padding: 5px 9px; border-radius: 999px; background: #e8f3ff; color: #54708d; font-size: 11px; font-weight: 800; }
        .csWorksHeroTitle { margin: 0; color: #102f54; font-size: clamp(34px, 4.5vw, 58px); line-height: 1.2; letter-spacing: -.03em; }
        .csWorksHeroLead { max-width: 680px; margin: 22px 0 0; color: #526b84; font-size: 16px; line-height: 1.9; }
        .csWorksHeroActions, .csWorksResultActions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 28px; }
        .csWorksPrimaryCta, .csWorksSecondaryCta, .csWorksInlineButton { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px 20px; border-radius: 10px; font-weight: 800; text-decoration: none; }
        .csWorksPrimaryCta { background: #1676df; color: #fff; box-shadow: 0 8px 20px rgba(22,118,223,.18); }
        .csWorksSecondaryCta { border: 1px solid #bfd4e9; background: #fff; color: #1261b8; }
        .csWorksHeroNotes { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 18px; color: #61778e; font-size: 12px; font-weight: 700; }
        .csWorksFlowCard { position: relative; min-height: 390px; padding: 26px; border-radius: 24px; background: linear-gradient(160deg,#0e65b7,#1682dc 60%,#31a8dc); box-shadow: 0 24px 50px rgba(24,87,148,.2); color: #fff; overflow: hidden; }
        .csWorksFlowLabel { font-size: 13px; font-weight: 900; letter-spacing: .12em; }
        .csWorksFlowSteps { position: relative; z-index: 2; display: grid; gap: 9px; width: 58%; margin-top: 24px; }
        .csWorksFlowSteps div { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.2); border-radius: 11px; background: rgba(255,255,255,.1); backdrop-filter: blur(5px); }
        .csWorksFlowSteps b { opacity: .7; font-size: 10px; }
        .csWorksFlowSteps span { font-size: 13px; font-weight: 800; }
        .csWorksHeroImage { position: absolute; right: -55px; bottom: -8px; width: 70%; max-height: 250px; object-fit: contain; filter: drop-shadow(0 15px 20px rgba(0,0,0,.2)); }
        .csWorksIntro { padding: 28px 8px 10px; }
        .csWorksSectionHeading { max-width: 720px; margin: 0 auto 24px; text-align: center; }
        .csWorksSectionHeading > span { color: #1676df; font-size: 11px; font-weight: 900; letter-spacing: .16em; }
        .csWorksSectionHeading h2 { margin: 8px 0 10px; color: #173a5e; font-size: 28px; }
        .csWorksSectionHeading p { margin: 0; color: #64788d; line-height: 1.8; }
        .csWorksFeatureGrid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; }
        .csWorksFeatureCard { padding: 22px 20px; border: 1px solid #dce8f3; border-radius: 16px; background: #fff; }
        .csWorksFeatureCard > span { display: block; margin-bottom: 13px; color: #1681d8; font-size: 11px; font-weight: 900; }
        .csWorksFeatureCard strong { display: block; color: #173a5e; font-size: 15px; }
        .csWorksFeatureCard p { margin: 8px 0 0; color: #6a7d90; font-size: 13px; line-height: 1.7; }
        .csWorksResultCta { border-color: #cfe1f3; background: linear-gradient(135deg,#f7fbff,#fff); }
        .csWorksBridge { padding: 28px 30px; border: 1px solid #cfe0f4; background: linear-gradient(135deg, #f8fbff 0%, #ffffff 72%); }
        .csWorksBridgeTop { display: flex; justify-content: space-between; gap: 28px; align-items: center; }
        .csWorksBridgeTitle { margin: 5px 0 0; color: #102f54; font-size: 26px; line-height: 1.4; }
        .csWorksBridgeLead { max-width: 760px; margin: 12px 0 0; color: #526b84; font-size: 14px; line-height: 1.85; }
        .csWorksBridgeActions { display: flex; flex: 0 0 auto; gap: 10px; align-items: center; }
        .csWorksBridgeFlow { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 22px; padding: 14px 16px; border-radius: 13px; background: #eef6ff; color: #174f89; font-size: 13px; font-weight: 800; }
        .csWorksBridgeFlow b { color: #7fa7cf; font-weight: 700; }
        .csWorksInlineButton { width: auto; }
        @media (max-width: 860px) {
          .csWorksHeroContent { grid-template-columns: 1fr; padding: 36px 26px; }
          .csWorksBridgeTop { align-items: flex-start; flex-direction: column; }
          .csWorksFlowCard { min-height: 330px; }
          .csWorksFeatureGrid { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
        @media (max-width: 560px) {
          .csWorksHeroContent { padding: 28px 20px; gap: 26px; }
          .csWorksHeroTitle { font-size: 34px; }
          .csWorksHeroActions, .csWorksResultActions { align-items: stretch; flex-direction: column; }
          .csWorksPrimaryCta, .csWorksSecondaryCta, .csWorksInlineButton { width: 100%; box-sizing: border-box; }
          .csWorksHeroNotes { flex-direction: column; gap: 6px; }
          .csWorksBridge { padding: 22px 20px; }
          .csWorksBridgeTitle { font-size: 22px; }
          .csWorksBridgeActions { width: 100%; align-items: stretch; flex-direction: column; }
          .csWorksBridgeActions a { width: 100%; box-sizing: border-box; text-align: center; }
          .csWorksBridgeFlow { justify-content: flex-start; gap: 7px; font-size: 12px; }
          .csWorksFlowSteps { width: 70%; }
          .csWorksFeatureGrid { grid-template-columns: 1fr; }
        }
      `}</style>

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
