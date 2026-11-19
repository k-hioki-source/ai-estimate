import './landing.css';
import EstimateForm from '../components/EstimateForm';

export default function HomePage() {
  return <main className="container cswLandingPage"><EstimateForm mode="landing" showEstimateExamples={process.env.ESTIMATE_REVIEWS_ENABLED === '1'} /></main>;
}
