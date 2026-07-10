type CustomerInfoProps = {
  companyName: string;
  customerName: string;
  email: string;
  onCompanyNameChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
};

export default function CustomerInfo({
  companyName,
  customerName,
  email,
  onCompanyNameChange,
  onCustomerNameChange,
  onEmailChange,
}: CustomerInfoProps) {
  return (
    <section className="customerFirstSection">
      <div className="sectionHeading">
        <div>
          <div className="eyebrow">STEP 1</div>
          <h2 className="sectionTitle">ご連絡先をご入力ください</h2>
        </div>
        <p className="muted compactText">
          概算見積り結果と正式見積りのご案内に使用します。
        </p>
      </div>

      <div className="grid grid-2">
        <div>
          <label htmlFor="companyName">会社名</label>
          <input
            id="companyName"
            name="companyName"
            placeholder="株式会社◯◯"
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="customerName">ご担当者名（必須）</label>
          <input
            id="customerName"
            name="customerName"
            placeholder="山田 太郎"
            required
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
          />
        </div>

        <div className="gridSpan2">
          <label htmlFor="email">メールアドレス（必須）</label>
          <input
            id="email"
            type="email"
            name="email"
            placeholder="sample@example.com"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
