// Offline-tolerant identification queue.
//
// Every photo is written to the local queue first. A worker drains the queue
// whenever the device is online — immediately after capture, on app start,
// and every time connectivity comes back. Finished items wait in "ready"
// state until the user verifies them; nothing enters the journal unverified.
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { claimPending, enqueuePhoto, setQueueResult, setQueueStatus } from '../db';
import { identifier } from './identify';
import { persistPhoto } from './photos';

const MAX_ATTEMPTS = 5;
type Listener = () => void;
const listeners = new Set<Listener>();
let draining = false;
let started = false;

export function onQueueChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

export async function isOnline(): Promise<boolean> {
  // NetInfo's web state can lag behind the browser's own flag.
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (Platform.OS === 'web') return true;
  const state = await NetInfo.fetch();
  return !!state.isConnected && state.isInternetReachable !== false;
}

/** Save the photo and queue it. Returns the queue id. */
export async function submitPhoto(uri: string): Promise<number> {
  const stored = await persistPhoto(uri);
  const id = await enqueuePhoto(stored);
  emit();
  void drain();
  return id;
}

export async function drain(): Promise<void> {
  if (draining || !(await isOnline())) return;
  draining = true;
  try {
    const items = await claimPending();
    if (items.length) emit();
    for (const item of items) {
      try {
        const result = await identifier.identify(item.imageUri);
        await setQueueResult(item.id, result);
        await notifyReady(result.candidates[0]?.brand);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Network-ish failures go back to pending; give up after a few tries.
        await setQueueStatus(item.id, item.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending', message);
      }
      emit();
    }
  } finally {
    draining = false;
  }
}

export async function retry(id: number): Promise<void> {
  await setQueueStatus(id, 'pending');
  emit();
  await drain();
}

export function startQueueWorker(): void {
  if (started) return;
  started = true;
  // Several wake-up signals; drain() itself re-checks connectivity and any
  // failed attempt simply returns the item to 'pending' for the next one.
  NetInfo.addEventListener((state) => {
    if (state.isConnected) void drain();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void drain();
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => void drain());
  }
  void drain();
}

async function notifyReady(brand?: string) {
  if (Platform.OS === 'web') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Cigar identified',
        body: brand ? `Tap to verify your ${brand} and finish the review.` : 'Tap to verify and finish the review.',
      },
      trigger: null,
    });
  } catch {
    // Notifications are a nicety; never let them break the queue.
  }
}
