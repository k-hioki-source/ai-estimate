import type { ReviewBatch, ReviewFile } from './image-annotations';
export const illustrationsEnabled = process.env.NEXT_PUBLIC_CSWORKS_ILLUSTRATION_WORKFLOW === 'true';
export type IllustrationProject = { id: string; status: string; formal_quote_id?: string | null; illustration_workflow?: boolean };
export type IllustrationVersion = { id: string; illustration_id: string; project_id: string; revision: number; file_id: string; review_batch_id: string | null; file: ReviewFile; review: ReviewBatch | null };
export type Illustration = { id: string; project_id: string; number: string; name: string; position: number; state: 'in_production' | 'customer_review' | 'revision' | 'approved'; current_version_id: string | null; versions: IllustrationVersion[] };
export type IllustrationContext = { project: IllustrationProject; items: Illustration[] };
export type IllustrationResult = { project: IllustrationProject; operationId: string; notificationType: 'review_requested' | 'revision_requested' | 'approved' | 'customer_message'; replayed: boolean };
