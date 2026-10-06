import { adminClient } from './google-calendar-auth';

export type ConsultationHours = { start: string; end: string };
export const DEFAULT_CONSULTATION_HOURS: ConsultationHours = { start: '09:30', end: '18:00' };
export const timeMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
export function validConsultationHours(value: ConsultationHours) {
  const valid = (s: string) => /^\d{2}:(00|30)$/.test(s) && Number(s.slice(0,2)) < 24;
  return valid(value.start) && valid(value.end) && timeMinutes(value.end) - timeMinutes(value.start) >= 30;
}
export async function getConsultationHours(): Promise<ConsultationHours> {
  const { data, error } = await adminClient().from('consultation_settings').select('start_time,end_time').eq('id', 1).single();
  if (error) throw error;
  if (!data || !validConsultationHours({ start: data.start_time, end: data.end_time })) throw new Error('Invalid consultation settings');
  return { start: data.start_time, end: data.end_time };
}
export function epochForMinutes(day: string, minutes: number) {
  return Date.parse(`${day}T${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}:00+09:00`);
}
