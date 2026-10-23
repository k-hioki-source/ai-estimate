import EstimateForm from '../components/EstimateForm';

export default function HomePage() {
  return (
    <main className="container cswHomeWide">
      <style>{`
        .cswHomeWide { max-width: 1400px !important; width: calc(100% - 32px) !important; box-sizing: border-box; margin-left: auto; margin-right: auto; }
        @media (max-width: 700px) { .cswHomeWide { width: calc(100% - 20px) !important; } }
      `}</style>
      <EstimateForm />
    </main>
  );
}
