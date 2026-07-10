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
  '製品写真から取扱説明書用の白黒線画を作りたい',
  '図面と写真から製品説明用のカラー断面図を作りたい',
  '機械製品の写真からWEB掲載用のリアルイラストを作りたい',
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
    <section className="aiFirstSection aiFirstVisual">
      <div className="aiFirstVisualLeft">
        <div className="aiFirstBadge">STEP 2｜AI入力アシスタント</div>
        <h2 className="aiFirstTitle">
          作成したいイラストの内容をAIに伝えてください
        </h2>
        <p className="aiFirstDescription">
          AIが文章から制作方法・用途・イラスト表現を判定し、見積りフォームを自動で設定します。
        </p>
        <img
          className="aiRobotImage"
          src="https://www.create-support.co.jp/wp-content/uploads/2026/06/AI-image.jpg"
          alt="AI見積りアシスタント"
        />
      </div>

      <div className="aiFirstVisualRight">
        <div className="aiInputCard">
          <label htmlFor="assistMessage">イラストの依頼内容</label>
          <textarea
            id="assistMessage"
            className="aiFirstTextarea"
            value={assistText}
            onChange={(e) => onAssistTextChange(e.target.value)}
            placeholder="例：図面と写真があります。パーツカタログ用の分解図を白黒線画で作りたいです。"
          />

          <div className="aiExampleButtons">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onAssistTextChange(example)}
              >
                {example}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="aiFirstButton"
            onClick={onSuggest}
            disabled={assistLoading || !assistText.trim()}
          >
            {assistLoading ? 'AIが依頼内容を解析しています...' : '無料でAI見積りを始める'}
          </button>

          {assistLoading ? (
            <div className="aiAnalyzing">
              <div className="aiAnalyzingSpinner" />
              <div>
                <strong>AIが依頼内容を解析しています</strong>
                <span>制作方法・用途・イラスト表現を判定しています</span>
              </div>
            </div>
          ) : null}

          {suggestCompleted ? (
            <div className="aiSuggestionComplete">
              <strong>AIが見積りフォームを作成しました</strong>
              <span>提案内容は後から自由に変更できます。</span>
            </div>
          ) : null}

          {!showEstimateForm ? (
            <button type="button" className="manualInputButton" onClick={onManualInput}>
              AIを使わず手動で入力する
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
