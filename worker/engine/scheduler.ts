import type { Persona, TimeConfig } from '../../shared/persona-schema.js';
import type { Prng } from '../../shared/prng.js';
import { round } from '../friction/friction.js';

/** Local hour (0..23) of a UTC instant in an IANA time zone. */
export function localHour(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at);
  return Number(h);
}

export function hourMultiplier(hour: number, cfg: TimeConfig): number {
  if (cfg.peakHours.includes(hour)) return cfg.multipliers.peak;
  if (cfg.workHours.includes(hour)) return cfg.multipliers.work;
  if (cfg.morningHours.includes(hour)) return cfg.multipliers.morning;
  return cfg.multipliers.offPeak;
}

/**
 * Probability that a persona starts a session in this round. Calibrated so the expected number of
 * sessions per week ≈ sessionsPerWeek × (0.5 + activityLevel) × mean hour multiplier.
 */
export function activationProbability(persona: Persona, at: Date, minutesPerRound: number, cfg: TimeConfig): number {
  const hour = localHour(at, persona.timezone);
  const roundsInActiveHoursPerWeek = (7 * persona.activeHours.length * 60) / minutesPerRound;
  const base = persona.sessionsPerWeek / roundsInActiveHoursPerWeek;
  const inHours = persona.activeHours.includes(hour) ? 1 : cfg.outsideActiveHoursFactor;
  return round(Math.min(1, base * (0.5 + persona.activityLevel) * hourMultiplier(hour, cfg) * inHours));
}

export interface ActivationCheck {
  active: boolean;
  probability: number;
  roll: number;
  localHour: number;
}

export function isActive(persona: Persona, at: Date, minutesPerRound: number, cfg: TimeConfig, prng: Prng): ActivationCheck {
  const probability = activationProbability(persona, at, minutesPerRound, cfg);
  const roll = round(prng.next());
  return { active: roll < probability, probability, roll, localHour: localHour(at, persona.timezone) };
}

/** Simulated instants of each round. */
export function roundTimes(start: Date, totalSimulatedDays: number, minutesPerRound: number): Date[] {
  const count = Math.floor((totalSimulatedDays * 24 * 60) / minutesPerRound);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * minutesPerRound * 60_000));
}
