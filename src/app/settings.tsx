import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Segmented } from '../components/Segmented';
import { Button, Card, Field, Row, Screen, SectionLabel } from '../components/ui';
import { type AppSettings, DEFAULT_SETTINGS, getSettings, saveSettings } from '../db/settings';
import { backupToDrive, buildBackup, buildCigarCsv, buildPipeCsv, restoreBackup, shareText, stamp } from '../services/backup';
import { syncCatalog } from '../services/catalog';
import { identifier } from '../services/identify';
import { ocrAvailable } from '../services/ocr';
import { sheet } from '../services/sheet';
import { colors, space, type } from '../theme';

const confirm = (title: string, message: string): Promise<boolean> =>
  Platform.OS === 'web'
    ? Promise.resolve(window.confirm(`${title}\n\n${message}`))
    : new Promise((resolve) =>
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );

const notify = (msg: string) => (Platform.OS === 'web' ? window.alert(msg) : Alert.alert(msg));

export default function Settings() {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string>();

  useEffect(() => {
    void getSettings().then(setS);
  }, []);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    void saveSettings({ [k]: v } as Partial<AppSettings>);
  };
  const num = (k: 'rhMin' | 'rhMax' | 'tempMin' | 'tempMax') => (t: string) => set(k, Number(t.replace(/[^\d.]/g, '')) || 0);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const msg = await fn();
      if (msg) notify(msg);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Screen>
      <Card>
        <SectionLabel>Shared catalog · Google Sheet</SectionLabel>
        <Text style={[type.caption, { marginBottom: space.lg }]}>
          A free Apps Script in your Google Drive serves the cigar catalog, stores humidor readings and receives backups.
          Friends can point their app at the same script to share the catalog. Setup: backend-google/README.md.
        </Text>
        <Field label="Apps Script web-app URL" value={s.sheetUrl} onChangeText={(v) => set('sheetUrl', v.trim())} autoCapitalize="none" placeholder="https://script.google.com/macros/s/…/exec" />
        <Field label="Access token" value={s.sheetToken} onChangeText={(v) => set('sheetToken', v.trim())} autoCapitalize="none" secureTextEntry />
        <Field label="Your name (shown on entries you add)" value={s.displayName} onChangeText={(v) => set('displayName', v)} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Test"
              variant="secondary"
              loading={busy === 'test'}
              disabled={!s.sheetUrl}
              onPress={() => void run('test', async () => `Connected (backend v${(await sheet.ping()).version}).`)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Sync now"
              loading={busy === 'sync'}
              disabled={!s.sheetUrl}
              onPress={() =>
                void run('sync', async () => {
                  const r = await syncCatalog();
                  setStatus(r ? `${r.pulled} catalog entries · ${r.pushed} contributions sent` : '');
                  setS(await getSettings());
                })
              }
            />
          </View>
        </View>
        {status || s.lastCatalogSync ? (
          <Text style={[type.caption, { marginTop: space.sm }]}>
            {status || `Last synced ${new Date(s.lastCatalogSync).toLocaleString()}`}
          </Text>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Band identification</SectionLabel>
        <Row label="On-device band reading" value={ocrAvailable() ? 'Available' : 'Needs the installed app build'} />
        <Row label="Online research service" value={identifier.name === 'remote' ? 'On' : 'Off (free mode)'} />
      </Card>

      <Card>
        <SectionLabel>Humidor</SectionLabel>
        <Segmented
          options={[
            { value: 'sheet', label: 'Via Google Sheet' },
            { value: 'device', label: 'Direct (home Wi-Fi)' },
          ]}
          value={s.humidorSource}
          onChange={(v) => set('humidorSource', v)}
        />
        {s.humidorSource === 'device' ? (
          <Field label="Sensor address" value={s.humidorDeviceUrl} onChangeText={(v) => set('humidorDeviceUrl', v.trim())} autoCapitalize="none" />
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Min RH %" value={String(s.rhMin)} onChangeText={num('rhMin')} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max RH %" value={String(s.rhMax)} onChangeText={num('rhMax')} keyboardType="decimal-pad" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Min °F" value={String(s.tempMin)} onChangeText={num('tempMin')} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max °F" value={String(s.tempMax)} onChangeText={num('tempMax')} keyboardType="decimal-pad" />
          </View>
        </View>
        <Field label="ntfy topic (for away alerts)" value={s.ntfyTopic} onChangeText={(v) => set('ntfyTopic', v.trim())} autoCapitalize="none" placeholder="e.g. humidor-7f3k9q" />
        <Text style={type.caption}>
          Put the same limits and topic in the sensor's config. Install the free ntfy app and subscribe to the topic to get alerts even
          when this app is closed. Use a long random topic name — anyone who knows it can read it.
        </Text>
      </Card>

      <Card>
        <SectionLabel>Your data</SectionLabel>
        <View style={{ gap: space.sm }}>
          <Button title="Export cigar journal (CSV)" icon="document-text-outline" variant="secondary" onPress={() => void run('csv', async () => shareText(`cigars-${stamp()}.csv`, await buildCigarCsv(), 'text/csv'))} />
          <Button title="Export pipe journal (CSV)" icon="document-text-outline" variant="secondary" onPress={() => void run('pcsv', async () => shareText(`pipe-${stamp()}.csv`, await buildPipeCsv(), 'text/csv'))} />
          <Button title="Save full backup" icon="save-outline" variant="secondary" onPress={() => void run('bk', async () => shareText(`humidor-backup-${stamp()}.json`, await buildBackup(), 'application/json'))} />
          <Button
            title="Back up to Google Drive"
            icon="cloud-upload-outline"
            variant="secondary"
            disabled={!s.sheetUrl}
            loading={busy === 'drive'}
            onPress={() => void run('drive', async () => ((await backupToDrive()) ? 'Backup saved to your Drive folder.' : 'Backup saved to Drive.'))}
          />
          <Button
            title="Restore from backup…"
            icon="refresh-outline"
            variant="ghost"
            onPress={() =>
              void run('restore', async () => {
                const pick = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
                if (pick.canceled || !pick.assets[0]) return;
                const ok = await confirm('Replace all data?', 'Everything on this device will be replaced by the backup. This cannot be undone.');
                if (!ok) return;
                const uri = pick.assets[0].uri;
                const text = Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text();
                await restoreBackup(text);
                setS(await getSettings());
                return 'Backup restored.';
              })
            }
          />
        </View>
        <Text style={[type.caption, { marginTop: space.md, color: colors.textFaint }]}>
          The app also keeps an automatic weekly backup on the device and, if the Sheet is connected, in Drive.
        </Text>
      </Card>
    </Screen>
  );
}
