export type NotificationPayload = {
  company?: string;
  name?: string;
  email?: string;
  usage?: string;
  style?: string;
  quantity?: number;
  notes?: string;
  complexityScore?: number;
  totalPrice?: number;
};

export async function sendNotificationEmail(payload: NotificationPayload) {
  console.log('sendNotificationEmail payload:', payload);

  return {
    ok: true,
  };
}
