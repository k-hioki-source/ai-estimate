type AiAssistantProps = {
  assistText: string;
  assistLoading: boolean;
  suggestCompleted: boolean;
  showEstimateForm: boolean;
  onAssistTextChange: (value: string) => void;
  onSuggest: () => void;
  onManualInput: () => void;
};

const examples = [
  {
    label: '取説用の線画',
    text: '製品写真から、取扱説明書に使用する白黒線画を1点作成したい。',
  },
  {
    label: 'カラー説明図',
    text: '写真と図面を参考に、製品説明用のカラー断面図を作成したい。',
  },
  {
    label: 'WEB用リアル',
    text: '機械製品の写真から、WEB掲載用のリアルイラストを作成したい。',
  },
];

export default function AiAssistant({
  assistText,
  assistLoading,
  suggestCompleted,
  showEstimateForm,
  onAssistTextChange,
  onSuggest,
  onManualInput,
}: AiAssistantProps) {
  return (
    <section className="aiAssistCompact">
      <div className="aiAssistIntro">
        <div className="aiAssistBadge">STEP 2｜AIに依頼内容を伝える</div>

        <div className="aiAssistIntroBody">
          <div className="aiAssistCopy">
            <h2>作りたいイラストを文章で入力してください</h2>
            <p>
              AIが文章を読み取り、制作方法・用途・イラスト表現を自動で選択します。
              分かる範囲だけで大丈夫です。
            </p>
          </div>

          <img
            className="aiAssistRobot"
            src="https://www.create-support.co.jp/wp-content/uploads/2026/06/AI-image2.jpg"
            alt="AI見積り入力アシスタント"
          />
        </div>
      </div>

      <div className="aiAssistInputPanel">
        <div className="aiAssistHowTo">
          <strong>入力する内容の目安</strong>
          <span>① 支給資料　② 使用用途　③ 希望する表現</span>
          <small>例：写真から、取扱説明書用の白黒線画を作りたい</small>
        </div>

        <label className="aiAssistLabel" htmlFor="assistMessage">
          イラストの依頼内容
        </label>

        <textarea
          id="assistMessage"
          className="aiAssistTextarea"
          value={assistText}
          onChange={(e) => onAssistTextChange(e.target.value)}
          placeholder="例：製品写真から、取扱説明書に使用する白黒線画を1点作成したい。"
        />

        <div className="aiAssistExamples">
          <span>入力例を選ぶ</span>
          <div className="aiAssistExampleButtons">
            {examples.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => onAssistTextChange(example.text)}
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="aiAssistStartButton"
          onClick={onSuggest}
          disabled={assistLoading || !assistText.trim()}
        >
          <span aria-hidden="true">✦</span>
          {assistLoading
            ? 'AIが依頼内容を解析しています...'
            : '無料でAI見積りを始める'}
        </button>

        {assistLoading ? (
          <div className="aiAssistStatus analyzing">
            <div className="aiAssistSpinner" />
            <div>
              <strong>AIが依頼内容を解析しています</strong>
              <span>制作方法・用途・イラスト表現を判定しています</span>
            </div>
          </div>
        ) : null}

        {suggestCompleted ? (
          <div className="aiAssistStatus completed">
            <div aria-hidden="true">✓</div>
            <div>
              <strong>AIが見積り条件を設定しました</strong>
              <span>下に表示された提案内容を確認し、必要に応じて変更してください。</span>
            </div>
          </div>
        ) : null}

        {!showEstimateForm ? (
          <button
            type="button"
            className="aiAssistManualButton"
            onClick={onManualInput}
          >
            AIを使わず、手動で条件を入力する
          </button>
        ) : null}
      </div>

      <style jsx>{`
        .aiAssistCompact {
          display: grid;
          grid-template-columns: minmax(230px, 0.78fr) minmax(0, 1.35fr);
          gap: 18px;
          padding: 20px;
          border: 1px solid #cfe0f4;
          border-radius: 18px;
          background: linear-gradient(135deg, #f4f9ff 0%, #ffffff 68%);
          box-shadow: 0 10px 28px rgba(31, 72, 122, 0.07);
        }

        .aiAssistIntro {
          min-width: 0;
        }

        .aiAssistBadge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 11px;
          border-radius: 999px;
          background: #e3efff;
          color: #1760b5;
          font-size: 12px;
          font-weight: 800;
        }

        .aiAssistIntroBody {
          display: flex;
          flex-direction: column;
          height: calc(100% - 38px);
        }

        .aiAssistCopy h2 {
          margin: 14px 0 8px;
          color: #102d50;
          font-size: clamp(20px, 2.2vw, 27px);
          line-height: 1.45;
          letter-spacing: 0.01em;
        }

        .aiAssistCopy p {
          margin: 0;
          color: #5d6f85;
          font-size: 13px;
          line-height: 1.85;
        }

        .aiAssistRobot {
          display: block;
          width: 100%;
          max-width: 350px;
          max-height: 145px;
          margin: auto auto 0;
          object-fit: contain;
          object-position: center bottom;
          mix-blend-mode: multiply;
        }

        .aiAssistInputPanel {
          min-width: 0;
          padding: 18px;
          border: 1px solid #d7e4f2;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.96);
        }

        .aiAssistHowTo {
          display: grid;
          gap: 3px;
          margin-bottom: 13px;
          padding: 11px 13px;
          border-radius: 11px;
          background: #f2f7fd;
          color: #53667d;
        }

        .aiAssistHowTo strong {
          color: #175ca8;
          font-size: 13px;
        }

        .aiAssistHowTo span {
          font-size: 13px;
          font-weight: 700;
        }

        .aiAssistHowTo small {
          color: #74869a;
          font-size: 12px;
        }

        .aiAssistLabel {
          display: block;
          margin-bottom: 7px;
          color: #203b5e;
          font-size: 13px;
          font-weight: 800;
        }

        .aiAssistTextarea {
          display: block;
          width: 100%;
          min-height: 112px;
          padding: 14px 15px;
          border: 1px solid #b9cce2;
          border-radius: 11px;
          background: #ffffff;
          color: #172b44;
          font: inherit;
          font-size: 14px;
          line-height: 1.7;
          resize: vertical;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .aiAssistTextarea:focus {
          outline: none;
          border-color: #178fd1;
          box-shadow: 0 0 0 4px rgba(19, 174, 234, 0.11);
        }

        .aiAssistTextarea::placeholder {
          color: #9aa8b8;
        }

        .aiAssistExamples {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }

        .aiAssistExamples > span {
          flex: 0 0 auto;
          color: #65778d;
          font-size: 12px;
          font-weight: 700;
        }

        .aiAssistExampleButtons {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .aiAssistExampleButtons button {
          padding: 7px 10px;
          border: 1px solid #cbd9e9;
          border-radius: 999px;
          background: #ffffff;
          color: #315f91;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .aiAssistExampleButtons button:hover {
          border-color: #4aaee0;
          background: #eef9ff;
          color: #087eb8;
        }

        .aiAssistStartButton {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 52px;
          margin-top: 14px;
          padding: 13px 18px;
          border: 0;
          border-radius: 9px;
          background: linear-gradient(135deg, #15b5ec, #0697d4);
          color: #ffffff;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.02em;
          box-shadow: 0 9px 20px rgba(4, 151, 212, 0.22);
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .aiAssistStartButton:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px rgba(4, 151, 212, 0.28);
        }

        .aiAssistStartButton:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .aiAssistStatus {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: 11px;
          padding: 11px 13px;
          border-radius: 10px;
          font-size: 12px;
        }

        .aiAssistStatus strong,
        .aiAssistStatus span {
          display: block;
        }

        .aiAssistStatus span {
          margin-top: 2px;
        }

        .aiAssistStatus.analyzing {
          border: 1px solid #d4e7fb;
          background: #f4f9ff;
          color: #355b85;
        }

        .aiAssistStatus.completed {
          border: 1px solid #bce8cc;
          background: #f1fbf5;
          color: #17653a;
        }

        .aiAssistSpinner {
          width: 20px;
          height: 20px;
          flex: 0 0 auto;
          border: 3px solid #d8e9fa;
          border-top-color: #159dd8;
          border-radius: 50%;
          animation: aiAssistSpin 0.8s linear infinite;
        }

        .aiAssistManualButton {
          display: block;
          margin: 12px auto 0;
          padding: 5px 8px;
          border: 0;
          background: transparent;
          color: #6d7f92;
          font-size: 12px;
          text-decoration: underline;
          cursor: pointer;
        }

        @keyframes aiAssistSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 820px) {
          .aiAssistCompact {
            grid-template-columns: 1fr;
          }

          .aiAssistIntroBody {
            display: grid;
            grid-template-columns: 1fr 130px;
            gap: 12px;
            align-items: end;
            height: auto;
          }

          .aiAssistRobot {
            max-width: 130px;
            max-height: 105px;
            margin: 0;
          }
        }

        @media (max-width: 560px) {
          .aiAssistCompact {
            padding: 15px;
            gap: 13px;
            border-radius: 15px;
          }

          .aiAssistIntroBody {
            grid-template-columns: 1fr 92px;
          }

          .aiAssistCopy h2 {
            font-size: 20px;
          }

          .aiAssistRobot {
            max-width: 92px;
            max-height: 85px;
          }

          .aiAssistInputPanel {
            padding: 14px;
          }

          .aiAssistExamples {
            align-items: flex-start;
            flex-direction: column;
            gap: 6px;
          }

          .aiAssistExampleButtons {
            width: 100%;
          }

          .aiAssistExampleButtons button {
            flex: 1 1 auto;
          }
        }
      `}</style>
    </section>
  );
}
