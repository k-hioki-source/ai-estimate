'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Json } from '../../lib/supabase/database.types';

type Props = {
  estimateId: string;
  productionMethod: string;
  usage: string;
  expression: string;
  quantity: number;
  estimatedHours: number;
  estimatedAmount: number;
  complexityScore: number;
  confidence?: number;
  aiComment: string;
  customerNotes: string;
  inputData: Json;
  analysisData: Json;

  // サムネイル保存用
  imageFile?: File | null;
  sampleImagePath?: string | null;
};

function getExtension(file: File) {
  const type = file.type.toLowerCase();

  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';

  return 'jpg';
}

export default function EstimateSave({
  estimateId,
  productionMethod,
  usage,
  expression,
  quantity,
  estimatedHours,
  estimatedAmount,
  complexityScore,
  confidence,
  aiComment,
  customerNotes,
  inputData,
  analysisData,
  imageFile,
  sampleImagePath,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkUser() {
      const supabase = getSupabaseBrowserClient();

      const { data } = await supabase.auth.getUser();

      setUser(data.user ?? null);
      setCheckingUser(false);

      if (!data.user) return;

      const { data: existing } = await supabase
        .from('estimates')
        .select('id')
        .eq('estimate_code', estimateId)
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (existing) {
        setSaved(true);
      }
    }

    checkUser();
  }, [estimateId]);

  async function uploadEstimateImage(
    userId: string
  ): Promise<string | null> {
    const supabase = getSupabaseBrowserClient();

    let fileToUpload: File | null = imageFile ?? null;

    // サンプル画像の場合はブラウザから取得してFile化
    if (!fileToUpload && sampleImagePath) {
      try {
        const response = await fetch(sampleImagePath);

        if (!response.ok) {
          throw new Error('サンプル画像を取得できませんでした。');
        }

        const blob = await response.blob();

        let extension = 'jpg';

        if (blob.type === 'image/png') {
          extension = 'png';
        } else if (blob.type === 'image/webp') {
          extension = 'webp';
        }

        fileToUpload = new File(
          [blob],
          `reference.${extension}`,
          {
            type: blob.type || 'image/jpeg',
          }
        );
      } catch (e) {
        console.error('Sample image load error:', e);
        return null;
      }
    }

    if (!fileToUpload) {
      return null;
    }

    const extension = getExtension(fileToUpload);

    const storagePath =
      `${userId}/${estimateId}/reference.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('estimate-images')
      .upload(storagePath, fileToUpload, {
        cacheControl: '3600',
        upsert: true,
        contentType: fileToUpload.type,
      });

    if (uploadError) {
      console.error(
        'Estimate image upload error:',
        uploadError
      );

      throw new Error(
        '参考画像を保存できませんでした。'
      );
    }

    return storagePath;
  }

  async function saveEstimate() {
    if (!user || saving || saved) return;

    setSaving(true);
    setError('');

    const supabase = getSupabaseBrowserClient();

    try {
      // ログインユーザーが保存を押した時だけ画像を保存
      const imagePath = await uploadEstimateImage(
        user.id
      );

      const { error: saveError } = await supabase
        .from('estimates')
        .insert({
          estimate_code: estimateId,
          user_id: user.id,
          production_method: productionMethod,
          usage,
          expression,
          quantity,
          estimated_hours: estimatedHours,
          estimated_amount: estimatedAmount,
          image_path: imagePath,
          complexity_score: complexityScore,
          confidence: confidence ?? null,
          ai_comment: aiComment,
          customer_notes: customerNotes,
          input_data: inputData,
          analysis_data: analysisData,
          status: 'estimated',
        });

      if (saveError) {
        console.error(
          'Estimate save error:',
          saveError
        );

        if (saveError.code === '23505') {
          setSaved(true);
          return;
        }

        throw new Error(
          '見積りを保存できませんでした。'
        );
      }

      setSaved(true);
    } catch (e) {
      console.error(e);

      setError(
        e instanceof Error
          ? e.message
          : '見積りを保存できませんでした。'
      );
    } finally {
      setSaving(false);
    }
  }

  if (checkingUser) {
    return null;
  }

  if (!user) {
    return (
      <div
        className="card"
        style={{ padding: '22px' }}
      >
        <div className="eyebrow">
          CS Works
        </div>

        <h3 style={{ marginTop: '6px' }}>
          この見積りを保存できます
        </h3>

        <p className="muted">
          無料会員登録すると、
          AI概算見積りをMy Pageに保存して、
          後から確認できます。
        </p>

        <Link
          className="primaryButton"
          href="/signup"
          style={{
            display: 'inline-flex',
            textDecoration: 'none',
            justifyContent: 'center',
          }}
        >
          無料会員登録して見積りを保存
        </Link>

        <p className="footerNote">
          すでに会員の方は{' '}
          <Link href="/login">
            ログイン
          </Link>
        </p>
      </div>
    );
  }

  if (saved) {
    return (
      <div
        className="card"
        style={{
          padding: '22px',
          border: '1px solid #bfe7ce',
          background: '#f2fbf5',
        }}
      >
        <div
          style={{
            fontWeight: 800,
            color: '#16733b',
            marginBottom: '8px',
          }}
        >
          ✓ My Pageに保存しました
        </div>

        <p className="muted">
          このAI概算見積りは
          CS Worksに保存されています。
        </p>

        <Link
          className="dashboardLink"
          href="/mypage"
        >
          My Pageを見る →
        </Link>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{ padding: '22px' }}
    >
      <div className="eyebrow">
        CS Works
      </div>

      <h3 style={{ marginTop: '6px' }}>
        この見積りをMy Pageに保存
      </h3>

      <p className="muted">
        見積り結果と参考画像を保存しておくと、
        後からMy Pageで確認できます。
      </p>

      {error ? (
        <div className="errorBox">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        className="primaryButton"
        onClick={saveEstimate}
        disabled={saving}
      >
        {saving
          ? '見積りと画像を保存中…'
          : 'この見積りを保存'}
      </button>
    </div>
  );
}
