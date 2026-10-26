export const annotationsEnabled = process.env.NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS === 'true';
export type Point = { x: number; y: number };
export type AnnotationPin = Point & { id: string; number: number; comment: string };
export type AnnotationStroke = { id: string; points: Point[] };
export type AnnotationDocument = { schemaVersion: 1; pins: AnnotationPin[]; strokes: AnnotationStroke[] };
export const emptyAnnotations = (): AnnotationDocument => ({ schemaVersion: 1, pins: [], strokes: [] });
export function annotationImage(name: string, mime?: string | null) {
  const type = (mime ?? '').split(';')[0].toLowerCase().trim();
  return type === 'image/png' || type === 'image/jpeg' || (!type && /\.(png|jpe?g)$/i.test(name));
}
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
}
export function validateAnnotations(value: unknown): value is AnnotationDocument {
  if (!value || typeof value !== 'object') return false;
  const d = value as AnnotationDocument;
  if (d.schemaVersion !== 1 || !Array.isArray(d.pins) || !Array.isArray(d.strokes) || d.pins.length > 100 || d.strokes.length > 200) return false;
  const ids = new Set<string>(), numbers = new Set<number>();
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(v) && !ids.has(v) && !!ids.add(v);
  const point = (p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  if (!d.pins.every(p => point(p) && id(p.id) && Number.isInteger(p.number) && p.number > 0 && p.number <= 10000 && !numbers.has(p.number) && !!numbers.add(p.number) && typeof p.comment === 'string' && p.comment.trim().length > 0 && p.comment.length <= 2000)) return false;
  return d.strokes.every(s => s && id(s.id) && Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= 2000 && s.points.every(point)) && d.strokes.reduce((n, s) => n + s.points.length, 0) <= 20000;
}
export type ReviewFile = { id: string; project_id: string; file_name: string; mime_type: string | null; storage_path: string; file_type: string; created_at: string };
export type ReviewBatch = { id: string; project_id: string; round_number: number; state: 'open' | 'revision_request' | 'approval' | 'closed'; message_id: string | null; illustration_id?: string | null; illustration_revision?: number | null; illustration_label?: string | null };
export type SavedAnnotation = { batch_id: string; file_id: string; document: AnnotationDocument; version: number; finalized_at: string | null };
export type ReviewContext = { batches: ReviewBatch[]; members: { batch_id: string; file_id: string }[]; annotations: SavedAnnotation[]; files: ReviewFile[] };
