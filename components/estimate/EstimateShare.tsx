'use client';

import { useMemo, useState } from 'react';

type ImageMode = 'blur' | 'original' | 'none';

type Props = {
  preview: string | null;
  amount: number;
  difficultyScore: number;
  estimatedHours: number;
  subjectType: string;
};

const SHARE_URL = 'https://estimate.create-support.co.jp/';

function difficultyLabel(score: number) {
  if (score <= 35) return 'やさしめ';
  if (score <= 65) return '標準からやや複雑';
  return '高難度';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  minFontSize: number
) {
  let size = fontSize;
  while (size > minFontSize) {
    ctx.font = `700 ${size}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

export default function EstimateShare({
  preview,
  amount,
  difficultyScore,
  estimatedHours,
  subjectType,
}: Props) {
  const [open, setOpen] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>('blur');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const shareText = useMemo(
    () =>
      `イラスト制作をAIで概算。${amount.toLocaleString()}円、難易度${difficultyScore}/100、想定制作時間${estimatedHours}時間でした。`,
    [amount, difficultyScore, estimatedHours]
  );

  function ensureAgreement() {
    if (agree) return true;
    setMessage('公開内容の確認にチェックを入れてください。');
    return false;
  }

  function openShareWindow(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer,width=760,height=720');
  }

  async function copyPostText() {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${SHARE_URL}`);
      return true;
    } catch {
      return false;
    }
  }

  async function shareToLine() {
    if (!ensureAgreement()) return;
    setMessage(null);
    const url =
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(SHARE_URL)}` +
      `&text=${encodeURIComponent(shareText)}`;
    openShareWindow(url);
  }

  function shareToFacebook() {
    if (!ensureAgreement()) return;
    setMessage(null);
    openShareWindow(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`
    );
  }

  function shareToLinkedIn() {
    if (!ensureAgreement()) return;
    setMessage(null);
    openShareWindow(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`
    );
  }

  function shareToPinterest() {
    if (!ensureAgreement()) return;
    setMessage(null);
    const url =
      `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(SHARE_URL)}` +
      `&description=${encodeURIComponent(shareText)}`;
    openShareWindow(url);
  }

  async function shareToInstagram() {
    if (!ensureAgreement()) return;
    const copied = await copyPostText();
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    setMessage(
      copied
        ? 'Instagramを開きました。投稿文はクリップボードにコピー済みです。'
        : 'Instagramを開きました。投稿時に見積り内容とURLを入力してください。'
    );
  }

  async function createShareImage(): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('共有画像を作成できませんでした。');

    ctx.fillStyle = '#f4f8fc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    roundedRect(ctx, 70, 65, 1060, 1070, 42);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#1676df';
    ctx.font = '700 30px sans-serif';
    ctx.fillText('AI概算見積り結果', 120, 135);

    ctx.fillStyle = '#153455';
    ctx.font = '700 58px sans-serif';
    ctx.fillText(`${amount.toLocaleString()}円`, 120, 225);

    ctx.fillStyle = '#65788a';
    ctx.font = '400 24px sans-serif';
    ctx.fillText('参考画像と入力条件から算出した概算です', 120, 270);

    const imageX = 120;
    const imageY = 320;
    const imageW = 960;
    const imageH = 470;

    roundedRect(ctx, imageX, imageY, imageW, imageH, 28);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(imageX, imageY, imageW, imageH);

    if (preview && imageMode !== 'none') {
      try {
        const image = await loadImage(preview);
        const scale = Math.max(imageW / image.width, imageH / image.height);
        const drawW = image.width * scale;
        const drawH = image.height * scale;
        const drawX = imageX + (imageW - drawW) / 2;
        const drawY = imageY + (imageH - drawH) / 2;

        if (imageMode === 'blur') {
          ctx.filter = 'blur(30px)';
          ctx.drawImage(image, drawX - 35, drawY - 35, drawW + 70, drawH + 70);
          ctx.filter = 'none';
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(imageX, imageY, imageW, imageH);
        } else {
          ctx.drawImage(image, drawX, drawY, drawW, drawH);
        }
      } catch {
        ctx.fillStyle = '#d9e4ee';
        ctx.fillRect(imageX, imageY, imageW, imageH);
      }
    } else {
      ctx.fillStyle = '#dfe8f0';
      ctx.font = '700 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('参考画像は非表示', imageX + imageW / 2, imageY + imageH / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    const statY = 850;
    const statGap = 300;
    const stats = [
      ['難易度', `${difficultyScore} / 100`],
      ['制作時間', `${estimatedHours}時間`],
      ['判定', difficultyLabel(difficultyScore)],
    ];

    stats.forEach(([label, value], index) => {
      const x = 120 + statGap * index;
      ctx.fillStyle = '#7a8b9b';
      ctx.font = '600 21px sans-serif';
      ctx.fillText(label, x, statY);
      ctx.fillStyle = '#193b5b';
      const size = fitText(ctx, value, 250, 30, 22);
      ctx.font = `700 ${size}px sans-serif`;
      ctx.fillText(value, x, statY + 48);
    });

    ctx.fillStyle = '#7a8b9b';
    ctx.font = '600 20px sans-serif';
    ctx.fillText('作業内容', 120, 980);
    ctx.fillStyle = '#193b5b';
    const subjectSize = fitText(ctx, subjectType, 900, 28, 19);
    ctx.font = `700 ${subjectSize}px sans-serif`;
    ctx.fillText(subjectType, 120, 1025);

    ctx.fillStyle = '#1676df';
    ctx.font = '700 23px sans-serif';
    ctx.fillText('クリエイトサポート AI概算見積り', 120, 1090);
    ctx.fillStyle = '#66798b';
    ctx.font = '400 19px sans-serif';
    ctx.fillText('estimate.create-support.co.jp', 120, 1125);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('共有画像を作成できませんでした。'));
      }, 'image/png');
    });

    return new File([blob], 'ai-estimate-result.png', { type: 'image/png' });
  }

  async function shareWithDevice() {
    if (!ensureAgreement()) return;

    setBusy(true);
    setMessage(null);

    try {
      const file = await createShareImage();
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      if (
        navigator.share &&
        (!nav.canShare || nav.canShare({ files: [file] }))
      ) {
        await navigator.share({
          title: 'AI概算見積り結果',
          text: shareText,
          url: SHARE_URL,
          files: [file],
        });
        setMessage('共有先の選択画面を開きました。');
        return;
      }

      setMessage(
        'このPC・ブラウザでは画像付き共有に対応していません。下のSNS個別ボタンをご利用ください。'
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : '共有処理に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="estimateShareRoot">
      <div className="estimateShareIntro">
        <div className="estimateShareIntroText">
          <span className="estimateShareEyebrow">SNS SHARE</span>
          <h3>この見積り結果をシェア</h3>
          <p>
            金額・難易度・制作時間を共有できます。会社名、氏名、メールアドレス、見積IDは共有内容に含めません。
          </p>
        </div>

        <button
          type="button"
          className="estimateShareOpenButton"
          onClick={() => {
            setOpen((value) => !value);
            setMessage(null);
          }}
        >
          {open ? '閉じる' : 'シェア方法を選ぶ'}
        </button>
      </div>

      {open ? (
        <div className="estimateSharePanel">
          <div>
            <div className="estimateShareSectionTitle">参考画像の表示方法</div>
            <div className="estimateShareModes" role="group" aria-label="参考画像の表示方法">
              <button
                type="button"
                className={imageMode === 'blur' ? 'estimateShareMode active' : 'estimateShareMode'}
                aria-pressed={imageMode === 'blur'}
                onClick={() => setImageMode('blur')}
              >
                <span className="estimateShareModeIndicator" aria-hidden="true">
                  <span />
                </span>
                <span className="estimateShareModeText">
                  <strong>ぼかして表示</strong>
                  <small>おすすめ・初期設定</small>
                </span>
              </button>

              <button
                type="button"
                className={imageMode === 'original' ? 'estimateShareMode active' : 'estimateShareMode'}
                aria-pressed={imageMode === 'original'}
                onClick={() => setImageMode('original')}
              >
                <span className="estimateShareModeIndicator" aria-hidden="true">
                  <span />
                </span>
                <span className="estimateShareModeText">
                  <strong>そのまま表示</strong>
                  <small>公開可能な画像のみ</small>
                </span>
              </button>

              <button
                type="button"
                className={imageMode === 'none' ? 'estimateShareMode active' : 'estimateShareMode'}
                aria-pressed={imageMode === 'none'}
                onClick={() => setImageMode('none')}
              >
                <span className="estimateShareModeIndicator" aria-hidden="true">
                  <span />
                </span>
                <span className="estimateShareModeText">
                  <strong>画像を載せない</strong>
                  <small>最も安全</small>
                </span>
              </button>
            </div>
          </div>

          <div className="estimateSharePreview">
            <div className="estimateSharePreviewHeader">
              <span>AI概算見積り結果</span>
              <strong>{amount.toLocaleString()}円</strong>
            </div>

            <div className={`estimateSharePreviewImage ${imageMode === 'blur' ? 'blur' : ''}`}>
              {preview && imageMode !== 'none' ? (
                <img src={preview} alt="共有対象の参考画像" />
              ) : (
                <span>参考画像は非表示</span>
              )}
            </div>

            <div className="estimateSharePreviewStats">
              <span>難易度 {difficultyScore}/100</span>
              <span>制作時間 {estimatedHours}時間</span>
              <span>{difficultyLabel(difficultyScore)}</span>
            </div>
          </div>

          <div className="estimateShareWarning">
            <strong>公開前にご確認ください</strong>
            <p>
              未公開製品、機密情報、第三者の著作物など、SNSへ公開する権利がない画像は共有しないでください。ぼかしを使用しても形状が推測される場合があります。
            </p>
          </div>

          <button
            type="button"
            className={agree ? 'estimateShareAgreement active' : 'estimateShareAgreement'}
            aria-pressed={agree}
            onClick={() => {
              setAgree((value) => !value);
              setMessage(null);
            }}
          >
            <span className="estimateShareAgreementIndicator" aria-hidden="true">
              {agree ? '✓' : ''}
            </span>
            <span className="estimateShareAgreementText">
              公開して問題のない内容であることを確認しました
            </span>
          </button>

          <div className="estimateShareNativeArea">
            <button
              type="button"
              className="estimateShareNativeButton"
              disabled={busy || !agree}
              onClick={shareWithDevice}
            >
              {busy ? '共有画像を準備中...' : '画像付きでSNSを選んで共有'}
            </button>
            <p>
              対応している端末・ブラウザでは、画像を保存せずに共有先アプリへ渡します。
            </p>
          </div>

          <div className="estimateShareDivider"><span>PCからSNSを選ぶ</span></div>

          <div>
            <div className="estimateShareSectionTitle">SNS個別ボタン</div>
            <div className="estimateShareSocialGrid">
              <button type="button" className="socialButton line" onClick={shareToLine}>
                <span className="socialMark">L</span>
                <span>LINE</span>
              </button>

              <button type="button" className="socialButton facebook" onClick={shareToFacebook}>
                <span className="socialMark">f</span>
                <span>Facebook</span>
              </button>

              <button type="button" className="socialButton linkedin" onClick={shareToLinkedIn}>
                <span className="socialMark">in</span>
                <span>LinkedIn</span>
              </button>

              <button type="button" className="socialButton pinterest" onClick={shareToPinterest}>
                <span className="socialMark">P</span>
                <span>Pinterest</span>
              </button>

              <button type="button" className="socialButton instagram" onClick={shareToInstagram}>
                <span className="socialMark">◎</span>
                <span>Instagram</span>
              </button>
            </div>

            <p className="estimateSharePcNote">
              PCの個別SNSボタンでは、画像を保存・外部公開しないため画像の自動添付は行いません。LINE・Facebook・LinkedIn・Pinterestは共有画面を開き、Instagramは投稿文をコピーしてWeb版を開きます。
            </p>
          </div>

          {message ? <div className="estimateShareMessage">{message}</div> : null}
        </div>
      ) : null}

      <style jsx>{`
        .estimateShareRoot {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 24px !important;
          box-sizing: border-box !important;
          border: 1px solid #cfe0f4;
          border-radius: 18px;
          background: linear-gradient(135deg, #f6fbff 0%, #ffffff 72%);
          overflow: hidden;
        }

        .estimateShareRoot * {
          box-sizing: border-box;
        }

        .estimateShareIntro {
          display: flex !important;
          width: 100% !important;
          min-width: 0 !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 24px !important;
        }

        .estimateShareIntroText {
          display: block !important;
          flex: 1 1 auto !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
        }

        .estimateShareEyebrow {
          display: block;
          margin: 0 0 6px;
          color: #1676df;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          line-height: 1.4;
          white-space: nowrap;
        }

        .estimateShareIntro h3 {
          display: block !important;
          width: auto !important;
          margin: 0 0 8px !important;
          padding: 0 !important;
          border: 0 !important;
          color: #153455 !important;
          font-size: 22px !important;
          font-weight: 800 !important;
          line-height: 1.45 !important;
          letter-spacing: normal !important;
          writing-mode: horizontal-tb !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
        }

        .estimateShareIntro p {
          display: block !important;
          width: auto !important;
          max-width: 720px !important;
          margin: 0 !important;
          padding: 0 !important;
          color: #607487 !important;
          font-size: 14px !important;
          line-height: 1.75 !important;
          writing-mode: horizontal-tb !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
        }

        .estimateShareOpenButton,
        .estimateShareNativeButton,
        .estimateShareMode,
        .socialButton {
          appearance: none;
          -webkit-appearance: none;
          font-family: inherit;
        }

        .estimateShareOpenButton {
          display: inline-flex !important;
          flex: 0 0 auto !important;
          width: auto !important;
          min-width: 190px !important;
          min-height: 48px;
          align-items: center;
          justify-content: center;
          padding: 12px 20px;
          border: 1px solid #1676df;
          border-radius: 11px;
          background: #ffffff;
          color: #1261b8;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.4;
          white-space: nowrap;
          cursor: pointer;
        }

        .estimateSharePanel {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) !important;
          width: 100% !important;
          min-width: 0 !important;
          gap: 18px !important;
          margin-top: 22px !important;
          padding-top: 20px !important;
          border-top: 1px solid #dce7f2;
        }

        .estimateShareSectionTitle {
          margin-bottom: 10px;
          color: #243f5e;
          font-size: 14px;
          font-weight: 800;
        }

        .estimateShareModes {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          width: 100% !important;
          gap: 12px !important;
        }

        .estimateShareMode {
          display: grid !important;
          grid-template-columns: 20px minmax(0, 1fr) !important;
          width: 100% !important;
          min-width: 0 !important;
          min-height: 82px !important;
          align-items: start !important;
          justify-content: stretch !important;
          gap: 11px !important;
          margin: 0 !important;
          padding: 14px !important;
          border: 1px solid #d8e3ed !important;
          border-radius: 12px !important;
          background: #ffffff !important;
          color: inherit !important;
          text-align: left !important;
          line-height: normal !important;
          cursor: pointer;
          overflow: hidden;
        }

        .estimateShareMode.active {
          border-color: #1676df !important;
          box-shadow: 0 0 0 2px rgba(22, 118, 223, 0.1);
          background: #f9fcff !important;
        }

        .estimateShareModeIndicator {
          display: inline-flex !important;
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          min-height: 18px !important;
          align-items: center !important;
          justify-content: center !important;
          margin: 1px 0 0 !important;
          padding: 0 !important;
          border: 1.5px solid #9aabba;
          border-radius: 50%;
          background: #ffffff;
        }

        .estimateShareMode.active .estimateShareModeIndicator {
          border-color: #1676df;
        }

        .estimateShareModeIndicator > span {
          display: block !important;
          width: 8px !important;
          height: 8px !important;
          margin: 0 !important;
          padding: 0 !important;
          border-radius: 50%;
          background: transparent;
        }

        .estimateShareMode.active .estimateShareModeIndicator > span {
          background: #1676df;
        }

        .estimateShareModeText {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          text-align: left !important;
          writing-mode: horizontal-tb !important;
        }

        .estimateShareModeText strong,
        .estimateShareModeText small {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          writing-mode: horizontal-tb !important;
          text-orientation: mixed !important;
          white-space: normal !important;
          word-break: keep-all !important;
          overflow-wrap: normal !important;
        }

        .estimateShareModeText strong {
          color: #173a5c;
          font-size: 14px;
          line-height: 1.45;
        }

        .estimateShareModeText small {
          margin-top: 4px;
          color: #728496;
          font-size: 12px;
          line-height: 1.45;
        }

        .estimateSharePreview {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          overflow: hidden;
          border: 1px solid #dce6ef;
          border-radius: 16px;
          background: #ffffff;
        }

        .estimateSharePreviewHeader {
          display: flex !important;
          width: 100% !important;
          align-items: baseline !important;
          justify-content: space-between !important;
          gap: 16px;
          padding: 16px 18px;
        }

        .estimateSharePreviewHeader span {
          color: #1676df;
          font-weight: 800;
        }

        .estimateSharePreviewHeader strong {
          color: #153455;
          font-size: 26px;
          white-space: nowrap;
        }

        .estimateSharePreviewImage {
          display: grid !important;
          width: 100% !important;
          min-height: 220px;
          place-items: center;
          overflow: hidden;
          background: #eaf1f6;
        }

        .estimateSharePreviewImage img {
          display: block !important;
          width: 100% !important;
          height: 260px !important;
          max-width: none !important;
          object-fit: cover;
        }

        .estimateSharePreviewImage.blur img {
          filter: blur(18px);
          transform: scale(1.12);
        }

        .estimateSharePreviewImage > span {
          color: #7b8b9a;
          font-weight: 700;
        }

        .estimateSharePreviewStats {
          display: flex !important;
          width: 100% !important;
          flex-wrap: wrap !important;
          gap: 8px;
          padding: 14px 18px 18px;
        }

        .estimateSharePreviewStats span {
          display: inline-block;
          padding: 7px 10px;
          border-radius: 999px;
          background: #eef5fb;
          color: #31536f;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .estimateShareWarning {
          display: block !important;
          width: 100% !important;
          padding: 14px 16px;
          border: 1px solid #f0d7a0;
          border-radius: 12px;
          background: #fffaf0;
        }

        .estimateShareWarning strong {
          color: #795b17;
        }

        .estimateShareWarning p {
          margin: 6px 0 0 !important;
          color: #6f6244;
          font-size: 13px !important;
          line-height: 1.7 !important;
        }

        .estimateShareAgreement {
          appearance: none;
          -webkit-appearance: none;
          display: grid !important;
          grid-template-columns: 24px minmax(0, 1fr) !important;
          width: 100% !important;
          min-width: 0 !important;
          align-items: center !important;
          gap: 12px !important;
          margin: 0 !important;
          padding: 13px 14px !important;
          border: 1px solid #d8e3ed !important;
          border-radius: 11px !important;
          background: #ffffff !important;
          color: #334f69 !important;
          font-family: inherit !important;
          font-size: 14px !important;
          font-weight: 700 !important;
          line-height: 1.6 !important;
          text-align: left !important;
          cursor: pointer;
        }

        .estimateShareAgreement.active {
          border-color: #1676df !important;
          background: #f7fbff !important;
          box-shadow: 0 0 0 2px rgba(22, 118, 223, 0.08);
        }

        .estimateShareAgreementIndicator {
          display: inline-flex !important;
          width: 22px !important;
          height: 22px !important;
          min-width: 22px !important;
          min-height: 22px !important;
          align-items: center !important;
          justify-content: center !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 1.5px solid #9aabba;
          border-radius: 6px;
          background: #ffffff;
          color: #ffffff;
          font-size: 14px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
        }

        .estimateShareAgreement.active .estimateShareAgreementIndicator {
          border-color: #1676df;
          background: #1676df;
        }

        .estimateShareAgreementText {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          writing-mode: horizontal-tb !important;
          text-orientation: mixed !important;
          white-space: normal !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
          text-align: left !important;
        }

        .estimateShareNativeArea {
          display: grid !important;
          width: 100% !important;
          gap: 7px;
        }

        .estimateShareNativeButton {
          display: flex !important;
          width: 100% !important;
          min-height: 50px;
          align-items: center;
          justify-content: center;
          padding: 12px 18px;
          border: 1px solid #1676df;
          border-radius: 11px;
          background: #1676df;
          color: #ffffff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .estimateShareNativeButton:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .estimateShareNativeArea p,
        .estimateSharePcNote {
          margin: 0 !important;
          color: #718397 !important;
          font-size: 12px !important;
          line-height: 1.65 !important;
        }

        .estimateShareDivider {
          display: flex !important;
          width: 100% !important;
          align-items: center;
          gap: 12px;
          color: #708296;
          font-size: 12px;
          font-weight: 800;
        }

        .estimateShareDivider::before,
        .estimateShareDivider::after {
          content: '';
          flex: 1 1 auto;
          height: 1px;
          background: #dce7f2;
        }

        .estimateShareDivider span {
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .estimateShareSocialGrid {
          display: grid !important;
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          width: 100% !important;
          min-width: 0 !important;
          gap: 10px !important;
        }

        .socialButton {
          display: flex !important;
          width: 100% !important;
          min-width: 0 !important;
          min-height: 52px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 8px;
          border: 1px solid #d8e3ed;
          border-radius: 11px;
          background: #ffffff;
          color: #203b55;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.3;
          white-space: nowrap;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .socialButton:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px rgba(28, 66, 103, 0.1);
        }

        .socialMark {
          display: inline-flex !important;
          flex: 0 0 auto;
          width: 26px;
          height: 26px;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          line-height: 1;
        }

        .line .socialMark { background: #06c755; }
        .facebook .socialMark { background: #1877f2; }
        .linkedin .socialMark { background: #0a66c2; }
        .pinterest .socialMark { background: #e60023; }
        .instagram .socialMark { background: #8a3ab9; }

        .estimateSharePcNote {
          margin-top: 10px !important;
        }

        .estimateShareMessage {
          display: block !important;
          width: 100% !important;
          padding: 11px 13px;
          border-radius: 10px;
          background: #eef8f2;
          color: #2e6847;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.6;
        }

        @media (max-width: 900px) {
          .estimateShareSocialGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 760px) {
          .estimateShareRoot {
            padding: 18px !important;
          }

          .estimateShareIntro {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .estimateShareOpenButton {
            width: 100% !important;
            min-width: 0 !important;
          }

          .estimateShareModes {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .estimateSharePreviewHeader {
            align-items: flex-start !important;
            flex-direction: column !important;
          }
        }

        @media (max-width: 520px) {
          .estimateShareSocialGrid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
