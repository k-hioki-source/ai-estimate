import EstimateForm from '../../components/EstimateForm';

export default function EstimatePage() {
  return (
    <main className="container">
      <EstimateForm showEstimateExamples={process.env.ESTIMATE_REVIEWS_ENABLED === '1'} />
    </main>
  );
}
