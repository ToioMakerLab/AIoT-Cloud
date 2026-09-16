import { DeviceStatus } from '../constants/device-status.ts';

/** Hours of continuous OFFLINE after which a connectivity score bottoms out at 0. */
const CONNECTIVITY_FULL_DEGRADE_HOURS = 72;

const MS_PER_HOUR = 60 * 60 * 1000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

/** 0-100, higher is healthier — 100 at/before install, degrading linearly to 0 at the expected end of life. */
export function computeAgeScore(ageMonths: number, expectedLifespanMonths: number): number {
  const ageRatio = Math.max(0, ageMonths) / expectedLifespanMonths;

  return Math.round(clamp(100 * (1 - ageRatio), 0, 100));
}

/**
 * 0-100 connectivity score for a single device/node: 100 while online (or if it's never reported a
 * heartbeat yet — "no signal" isn't penalized), degrading linearly over `CONNECTIVITY_FULL_DEGRADE_HOURS`
 * of continuous offline time down to 0.
 */
export function computeConnectivityScore(status: DeviceStatus, lastSeenAt: Date | null, now: Date): { score: number; detail: string } {
  if (status === DeviceStatus.ONLINE) {
    return { score: 100, detail: 'Currently online' };
  }

  if (!lastSeenAt) {
    return { score: 100, detail: 'No heartbeat recorded yet' };
  }

  const offlineHours = (now.getTime() - lastSeenAt.getTime()) / MS_PER_HOUR;
  const score = Math.round(clamp(100 * (1 - offlineHours / CONNECTIVITY_FULL_DEGRADE_HOURS), 0, 100));

  return { score, detail: `Offline for ${roundTo(offlineHours, 1)}h` };
}
