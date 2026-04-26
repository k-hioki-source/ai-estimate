export function calculateEstimate({
  workType,
  difficultyScore,
  quantity,
}: {
  workType: string;
  difficultyScore: number;
  quantity: number;
}) {
  // ■基準時間
  const baseHoursMap: Record<string, number> = {
    simple_trace: 1,
    standard_trace: 1.5,
    technical_drawing: 3,
    realistic_illustration: 10,
    concept_diagram: 30,
  };

  let baseHours = baseHoursMap[workType] || 1.5;

  // ■難易度補正
  const factor = 0.8 + (difficultyScore / 100) * 0.6;
  let hours = baseHours * factor;

  // ■微調整（オプション）
  hours += (difficultyScore - 50) / 50;

  // ■丸め
  hours = Math.max(0.8, Math.round(hours * 2) / 2);

  const hourlyRate = 3000;

  const unitPrice = Math.round((hours * hourlyRate) / 100) * 100;

  const totalPrice = Math.round((unitPrice * quantity) / 100) * 100;

  return {
    hours,
    unitPrice,
    totalPrice,
    hourlyRate,
  };
}
