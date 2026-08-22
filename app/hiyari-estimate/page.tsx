import HiyariEstimateForm from '../../components/hiyari/HiyariEstimateForm';
import './hiyari-estimate.css';

export const metadata = {
  title: 'ヒヤリハット安全教育イラスト AI概算見積り｜クリエイトサポート',
  description:
    '工場内のヒヤリハット現場写真と状況説明から、安全教育イラスト制作の概算費用をAIが算出します。法人向け・請求書払い対応。',
};

export default function HiyariEstimatePage() {
  return <HiyariEstimateForm />;
}
