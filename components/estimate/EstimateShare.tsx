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

  async function share() {
    if (!agree) {
      setMessage('公開内容の確認にチェックを入れてください。');
      return;
    }

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
        setMessage('共有画面を開きました。');
        return;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      try {
        await navigator.clipboard.writeText(`${shareText}\n${SHARE_URL}`);
        setMessage('共有画像を保存し、投稿用テキストをコピーしました。');
      } catch {
        setMessage('共有画像を保存しました。SNSへ添付してご利用ください。');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : '共有処理に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shareCard card">
      <div className="shareIntro">
        <div>
          <span className="shareEyebrow">SNS SHARE</span>
          <h3>この見積り結果をシェア</h3>
          <p>
            金額・難易度・制作時間を共有用画像にまとめます。会社名、氏名、メールアドレス、見積IDは入りません。
          </p>
        </div>
        <button type="button" className="shareOpenButton" onClick={() => setOpen((v) => !v)}>
          {open ? '閉じる' : '共有画像を作る'}
        </button>
      </div>

      {open ? (
        <div className="sharePanel">
          <div className="shareModeTitle">参考画像の表示方法</div>
          <div className="shareModes">
            <label className={imageMode === 'blur' ? 'shareMode active' : 'shareMode'}>
              <input
                type="radio"
                name="shareImageMode"
                checked={imageMode === 'blur'}
                onChange={() => setImageMode('blur')}
              />
              <strong>ぼかして表示</strong>
              <span>おすすめ・初期設定</span>
            </label>

            <label className={imageMode === 'original' ? 'shareMode active' : 'shareMode'}>
              <input
                type="radio"
                name="shareImageMode"
                checked={imageMode === 'original'}
                onChange={() => setImageMode('original')}
              />
              <strong>そのまま表示</strong>
              <span>公開可能な画像のみ</span>
            </label>

            <label className={imageMode === 'none' ? 'shareMode active' : 'shareMode'}>
              <input
                type="radio"
                name="shareImageMode"
                checked={imageMode === 'none'}
                onChange={() => setImageMode('none')}
              />
              <strong>画像を載せない</strong>
              <span>最も安全</span>
            </label>
          </div>

          <div className="sharePreview" aria-label="共有内容のプレビュー">
            <div className="sharePreviewHeader">
              <span>AI概算見積り結果</span>
              <strong>{amount.toLocaleString()}円</strong>
            </div>
            <div className={`sharePreviewImage ${imageMode === 'blur' ? 'blur' : ''}`}>
              {preview && imageMode !== 'none' ? (
                <img src={preview} alt="共有対象の参考画像" />
              ) : (
                <span>参考画像は非表示</span>
              )}
            </div>
            <div className="sharePreviewStats">
              <span>難易度 {difficultyScore}/100</span>
              <span>制作時間 {estimatedHours}時間</span>
              <span>{difficultyLabel(difficultyScore)}</span>
            </div>
          </div>

          <div className="shareWarning">
            <strong>公開前にご確認ください</strong>
            <p>
              未公開製品、機密情報、第三者の著作物など、SNSへ公開する権利がない画像は共有しないでください。ぼかしを使用しても形状が推測される場合があります。
            </p>
          </div>

          <label className="shareAgreement">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>公開して問題のない内容であることを確認しました</span>
          </label>

          <button type="button" className="shareButton" disabled={busy || !agree} onClick={share}>
            {busy ? '共有画像を作成中...' : 'この内容で共有する'}
          </button>

          <p className="shareHelp">
            対応端末では共有先の選択画面が開きます。非対応のPC・ブラウザではPNG画像を保存します。
          </p>

          {message ? <div className="shareMessage">{message}</div> : null}
        </div>
      ) : null}

      <style jsx>{`
        .shareCard {
          padding: 24px;
          border: 1px solid #cfe0f4;
          background: linear-gradient(135deg, #f6fbff 0%, #ffffff 72%);
        }

        .shareIntro {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: center;
        }

        .shareEyebrow {
          display: block;
          margin-bottom: 6px;
          color: #1676df;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .shareIntro h3 {
          margin: 0 0 8px;
          color: #153455;
          font-size: 22px;
        }

        .shareIntro p {
          margin: 0;
          color: #607487;
          font-size: 14px;
          line-height: 1.75;
        }

        .shareOpenButton,
        .shareButton {
          min-height: 48px;
          padding: 12px 20px;
          border-radius: 11px;
          border: 1px solid #1676df;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .shareOpenButton {
          flex: 0 0 auto;
          background: #ffffff;
          color: #1261b8;
        }

        .sharePanel {
          display: grid;
          gap: 16px;
          margin-top: 22px;
          padding-top: 20px;
          border-top: 1px solid #dce7f2;
        }

        .shareModeTitle {
          color: #243f5e;
          font-size: 14px;
          font-weight: 800;
        }

        .shareModes {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .shareMode {
          display: grid;
          gap: 4px;
          padding: 14px;
          border: 1px solid #d8e3ed;
          border-radius: 12px;
          background: #ffffff;
          cursor: pointer;
        }

        .shareMode.active {
          border-color: #1676df;
          box-shadow: 0 0 0 2px rgba(22, 118, 223, 0.1);
        }

        .shareMode input {
          margin: 0 0 5px;
        }

        .shareMode strong {
          color: #173a5c;
          font-size: 14px;
        }

        .shareMode span {
          color: #728496;
          font-size: 12px;
        }

        .sharePreview {
          overflow: hidden;
          border: 1px solid #dce6ef;
          border-radius: 16px;
          background: #ffffff;
        }

        .sharePreviewHeader {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 16px;
          padding: 16px 18px;
        }

        .sharePreviewHeader span {
          color: #1676df;
          font-weight: 800;
        }

        .sharePreviewHeader strong {
          color: #153455;
          font-size: 26px;
        }

        .sharePreviewImage {
          display: grid;
          place-items: center;
          min-height: 220px;
          overflow: hidden;
          background: #eaf1f6;
        }

        .sharePreviewImage img {
          display: block;
          width: 100%;
          height: 260px;
          object-fit: cover;
        }

        .sharePreviewImage.blur img {
          filter: blur(18px);
          transform: scale(1.12);
        }

        .sharePreviewImage span {
          color: #7b8b9a;
          font-weight: 700;
        }

        .sharePreviewStats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 14px 18px 18px;
        }

        .sharePreviewStats span {
          padding: 7px 10px;
          border-radius: 999px;
          background: #eef5fb;
          color: #31536f;
          font-size: 12px;
          font-weight: 800;
        }

        .shareWarning {
          padding: 14px 16px;
          border: 1px solid #f0d7a0;
          border-radius: 12px;
          background: #fffaf0;
        }

        .shareWarning strong {
          color: #795b17;
        }

        .shareWarning p {
          margin: 6px 0 0;
          color: #6f6244;
          font-size: 13px;
          line-height: 1.7;
        }

        .shareAgreement {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: #334f69;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .shareAgreement input {
          margin-top: 3px;
        }

        .shareButton {
          width: 100%;
          background: #1676df;
          color: #ffffff;
        }

        .shareButton:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .shareHelp {
          margin: -5px 0 0;
          color: #718397;
          font-size: 12px;
          line-height: 1.6;
        }

        .shareMessage {
          padding: 11px 13px;
          border-radius: 10px;
          background: #eef8f2;
          color: #2e6847;
          font-size: 13px;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .shareIntro {
            align-items: stretch;
            flex-direction: column;
          }

          .shareOpenButton {
            width: 100%;
          }

          .shareModes {
            grid-template-columns: 1fr;
          }

          .sharePreviewHeader {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </section>
  );
}
