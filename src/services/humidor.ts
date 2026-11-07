// Humidor readings come from a small DIY sensor (hardware/humidor-sensor),
// either via the Google Sheet log (works anywhere) or straight from the
// sensor on your home Wi-Fi. Away-from-home alerts are sent by the sensor
// itself through ntfy, so they arrive even when this app is closed.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { type AppSettings, getSettings } from '../db/settings';
import { type Reading, sheet } from './sheet';

export type { Reading };

export async function fetchReadings(hours = 24 * 7): Promise<Reading[]> {
  const s = await getSettings();
  let readings: Reading[];
  if (s.humidorSource === 'device') {
    const res = await fetch(`${s.humidorDeviceUrl.replace(/\/$/, '')}/readings`);
    if (!res.ok) throw new Error(`Sensor returned ${res.status}`);
    readings = ((await res.json()) as { readings: Reading[] }).readings;
  } else {
    readings = await sheet.fetchReadings(hours);
  }
  const since = Date.now() - hours * 3_600_000;
  return readings.filter((r) => new Date(r.t).getTime() >= since).sort((a, b) => a.t.localeCompare(b.t));
}

export interface Issue {
  kind: 'rh-low' | 'rh-high' | 'temp-low' | 'temp-high' | 'stale';
  message: string;
}

export function evaluate(r: Reading | undefined, s: Pick<AppSettings, 'rhMin' | 'rhMax' | 'tempMin' | 'tempMax'>, at = Date.now()): Issue[] {
  if (!r) return [];
  const out: Issue[] = [];
  if (r.rh < s.rhMin) out.push({ kind: 'rh-low', message: `Humidity low: ${r.rh.toFixed(1)}% (min ${s.rhMin}%)` });
  if (r.rh > s.rhMax) out.push({ kind: 'rh-high', message: `Humidity high: ${r.rh.toFixed(1)}% (max ${s.rhMax}%)` });
  if (r.tempF < s.tempMin) out.push({ kind: 'temp-low', message: `Temperature low: ${r.tempF.toFixed(1)}°F (min ${s.tempMin}°F)` });
  if (r.tempF > s.tempMax) out.push({ kind: 'temp-high', message: `Temperature high: ${r.tempF.toFixed(1)}°F (max ${s.tempMax}°F)` });
  if (at - new Date(r.t).getTime() > 30 * 60_000) out.push({ kind: 'stale', message: 'No reading in over 30 minutes — check the sensor.' });
  return out;
}

let lastAlertKey = '';

/** Local notification while the app is open; the sensor's ntfy alerts cover the rest. */
export async function alertIfNeeded(issues: Issue[]): Promise<void> {
  const key = issues.map((i) => i.kind).sort().join(',');
  if (!key || key === lastAlertKey || Platform.OS === 'web') {
    lastAlertKey = key;
    return;
  }
  lastAlertKey = key;
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Humidor out of range', body: issues.map((i) => i.message).join('\n') },
      trigger: null,
    });
  } catch {
    // best effort
  }
}
