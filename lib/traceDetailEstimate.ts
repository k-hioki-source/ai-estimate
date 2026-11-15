export function traceDetailHours(input: {
  sourceType: string; usage: string; style: string;
  visibleComponentCount?: number; repeatedDetailCount?: number;
}) {
  if (input.sourceType !== 'photo_trace' || input.usage !== 'manual' || input.style !== 'line') return 0;
  const parts = input.visibleComponentCount || 0;
  const details = input.repeatedDetailCount || 0;
  // Components within one illustration are workload, not order quantity.
  if ((parts >= 3 && details >= 20) || details >= 60 || parts >= 5) {
    return parts >= 10 || details >= 300 ? 6 : parts >= 8 || details >= 200 ? 5 : 4;
  }
  if (parts >= 2 || details >= 20) return 2.5;
  return 0;
}
