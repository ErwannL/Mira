import type { Plan } from '../../shared/plans.js';

export const PLANS: Plan[] = [
  { key: 'free', name: 'Free', priceMonthly: 0, currency: 'EUR', perSeat: false, features: [] },
  { key: 'pro', name: 'Pro', priceMonthly: 9, currency: 'EUR', perSeat: false, features: ['automation', 'qr', 'bulk', 'export'] },
  { key: 'team', name: 'Team', priceMonthly: 5, currency: 'EUR', perSeat: true, features: ['automation', 'qr', 'bulk', 'export', 'seats'] },
];
