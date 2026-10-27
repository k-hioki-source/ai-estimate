// Only an explicit two-drawing pair is treated as a combined scope. Ambiguous
// requests and repeated illustrations retain representative-unit pricing.
export function isSideAndDetailPair(notes: string, quantity: number, style: string): boolean {
  const text = notes.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (quantity !== 2 || style !== 'line') return false;
  if (/(?:不要|なし|要らない|含めない|作成しない|必要ない|ではない|同じ|セット|1枚に|一枚に|各\s*[2-9]|それぞれ\s*[2-9])/.test(text)) return false;
  return /側面図/.test(text) && /(?:部分拡大図|拡大図|詳細図|部分図)/.test(text);
}

export function hasRequestedAngleChange(notes: string): boolean {
  return notes.split(/[。\n！？!?]/).some(sentence =>
    /(?:別アングル|視点変更|角度を変|アングルを変|写真と(?:は)?異なる角度|写真にない(?:背面|側面))/.test(sentence) &&
    !/(?:不要|なし|必要ない|変更しない|変えない|ではない)/.test(sentence)
  );
}

export function priceEstimateHours(totalHours: number, quantity: number, hourlyRate: number) {
  const totalPrice = Math.round(totalHours * hourlyRate / 100) * 100;
  return { unitHours: totalHours / quantity, unitPrice: totalPrice / quantity, totalHours, totalPrice };
}
