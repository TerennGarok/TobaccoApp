// Photo persistence: picker results live in a temp cache that the OS may purge,
// so queued photos are copied into the app's document directory first.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

export async function persistPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri; // blob/data URIs; nothing to copy
  const dir = new Directory(Paths.document, 'bands');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const ext = uri.split('?')[0].split('.').pop() || 'jpg';
  const dest = new File(dir, `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export async function readBase64(uri: string): Promise<{ data: string; mediaType: string }> {
  if (Platform.OS === 'web' || uri.startsWith('data:') || uri.startsWith('blob:')) {
    const blob = await (await fetch(uri)).blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const [head, data] = dataUrl.split(',');
    return { data, mediaType: head.match(/data:(.*?);/)?.[1] ?? 'image/jpeg' };
  }
  const lower = uri.toLowerCase();
  const mediaType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return { data: await new File(uri).base64(), mediaType };
}
