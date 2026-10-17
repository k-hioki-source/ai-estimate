import EstimateForm from '../components/EstimateForm';

export default function HomePage() {
  return (
    <main className="container">
      <section
        aria-labelledby="nda-information-title"
        style={{
          margin: '24px 0',
          padding: '20px 24px',
          border: '1px solid #cbdcf7',
          borderRadius: 12,
          background: '#f3f7ff',
          color: '#17345f',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            color: '#2458c6',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          安心してご相談いただくために
        </p>
        <h2
          id="nda-information-title"
          style={{ margin: '0 0 10px', fontSize: 'clamp(17px, 2.5vw, 21px)', lineHeight: 1.5 }}
        >
          秘密保持契約（NDA）のオンライン締結に対応
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.9 }}>
          機密情報を含む制作資料も安心してご相談いただけるよう、
          電子契約サービス「freeeサイン」を利用した秘密保持契約に対応しています。
          締結をご希望の場合は、担当者より電子契約のご案内をお送りします。
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#596b86', lineHeight: 1.7 }}>
          ※契約書の送付・締結は担当者による確認後となります。即時締結を保証するものではありません。
        </p>
      </section>
      <EstimateForm />
    </main>
  );
}
