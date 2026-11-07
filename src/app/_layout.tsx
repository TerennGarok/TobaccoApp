import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DraftProvider } from '../lib/draft';
import { PipeDraftProvider } from '../lib/pipeDraft';
import { startQueueWorker } from '../services/queue';
import { colors, fonts } from '../theme';

export default function RootLayout() {
  useEffect(() => {
    startQueueWorker();
  }, []);

  return (
    <SafeAreaProvider>
      <DraftProvider>
        <PipeDraftProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.brass,
            headerTitleStyle: { fontFamily: fonts.display, color: colors.text },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="capture" options={{ title: 'Add a Cigar', presentation: 'modal' }} />
          <Stack.Screen name="review/verify" options={{ title: 'Verify' }} />
          <Stack.Screen name="review/ratings" options={{ title: 'Ratings' }} />
          <Stack.Screen name="review/character" options={{ title: 'Character' }} />
          <Stack.Screen name="review/flavors" options={{ title: 'Flavors' }} />
          <Stack.Screen name="review/notes" options={{ title: 'Notes' }} />
          <Stack.Screen name="cigar/[id]" options={{ title: '' }} />
          <Stack.Screen name="pipe/new" options={{ title: 'Pipe Tobacco' }} />
          <Stack.Screen name="pipe/rate" options={{ title: 'Ratings' }} />
          <Stack.Screen name="pipe/notes" options={{ title: 'Flavors & Notes' }} />
          <Stack.Screen name="pipe/[id]" options={{ title: '' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
        </PipeDraftProvider>
      </DraftProvider>
    </SafeAreaProvider>
  );
}
