import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { RangeChart } from '../../components/RangeChart';
import { Segmented } from '../../components/Segmented';
import { Button, Card, Row, Screen, SectionLabel } from '../../components/ui';
import { type AppSettings, getSettings } from '../../db/settings';
import { alertIfNeeded, evaluate, fetchReadings, type Issue, type Reading } from '../../services/humidor';
import { colors, space, type } from '../../theme';

type Span = '24' | '168';

export default function Humidor() {
  const [settings, setSettings] = useState<AppSettings>();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [span, setSpan] = useState<Span>('24');
  const [error, setError] = useState<string>();
  const [issues, setIssues] = useState<Issue[]>([]);

  const load = useCallback(() => {
    let live = true;
    const tick = async () => {
      const s = await getSettings();
      if (!live) return;
      setSettings(s);
      const configured = s.humidorSource === 'device' ? !!s.humidorDeviceUrl : !!s.sheetUrl;
      if (!configured) return;
      try {
        const r = await fetchReadings(Number(span));
        if (!live) return;
        setReadings(r);
        setError(undefined);
        const found = evaluate(r[r.length - 1], s);
        setIssues(found);
        void alertIfNeeded(found);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [span]);
  useFocusEffect(load);

  if (!settings) return <Screen>{null}</Screen>;
  const configured = settings.humidorSource === 'device' ? !!settings.humidorDeviceUrl : !!settings.sheetUrl;
  const latest = readings[readings.length - 1];

  if (!configured) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', marginVertical: space.xl }}>
          <Ionicons name="water-outline" size={44} color={colors.brassDim} />
          <Text style={[type.title, { marginTop: space.md }]}>Humidor Monitor</Text>
          <Text style={[type.caption, { textAlign: 'center', marginTop: space.sm }]}>
            Live humidity and temperature from a small Wi-Fi sensor in your humidor, with alerts when it drifts out of range.
          </Text>
        </View>
        <Card>
          <SectionLabel>What you need</SectionLabel>
          <Text style={type.body}>• ESP32-C3 mini board (~$4){'\n'}• Sensirion SHT45 sensor breakout (~$5–13){'\n'}• USB power supply and cable</Text>
          <Text style={[type.caption, { marginTop: space.md }]}>
            Build and flashing steps are in hardware/humidor-sensor/README.md. Then connect it in Settings.
          </Text>
        </Card>
        <Button title="Open Settings" icon="settings-outline" onPress={() => router.push('/settings')} />
      </Screen>
    );
  }

  const ok = latest && !issues.length;
  return (
    <Screen>
      <Card style={{ borderColor: ok ? colors.border : colors.danger, borderWidth: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
          <Ionicons
            name={!latest ? 'help-circle-outline' : ok ? 'checkmark-circle' : 'warning'}
            size={20}
            color={!latest ? colors.textMuted : ok ? colors.success : colors.danger}
          />
          <Text style={[type.body, { fontWeight: '600' }]}>{!latest ? 'Waiting for readings' : ok ? 'In range' : 'Needs attention'}</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Big label="Humidity" value={latest ? `${latest.rh.toFixed(1)}%` : '—'} sub={`target ${settings.rhMin}–${settings.rhMax}%`} />
          <Big label="Temperature" value={latest ? `${latest.tempF.toFixed(1)}°` : '—'} sub={`target ${settings.tempMin}–${settings.tempMax}°F`} />
        </View>
        {issues.map((i) => (
          <Text key={i.kind} style={[type.caption, { color: colors.text, marginTop: space.sm }]}>
            ⚠︎ {i.message}
          </Text>
        ))}
        {latest ? (
          <Text style={[type.caption, { marginTop: space.md }]}>Updated {new Date(latest.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
        ) : null}
        {error ? <Text style={[type.caption, { color: colors.danger, marginTop: space.sm }]}>{error}</Text> : null}
      </Card>

      <Segmented
        options={[
          { value: '24', label: '24 hours' },
          { value: '168', label: '7 days' },
        ]}
        value={span}
        onChange={setSpan}
      />

      <Card>
        <RangeChart
          title="Humidity (%RH)"
          unit="%"
          points={readings.map((r) => ({ t: new Date(r.t).getTime(), v: r.rh }))}
          min={settings.rhMin}
          max={settings.rhMax}
          color={colors.srcReviews}
        />
        <RangeChart
          title="Temperature (°F)"
          unit="°"
          points={readings.map((r) => ({ t: new Date(r.t).getTime(), v: r.tempF }))}
          min={settings.tempMin}
          max={settings.tempMax}
          color={colors.cedar}
        />
        <Text style={type.caption}>Shaded band = your target range. Touch a chart to read values.</Text>
      </Card>

      <Card>
        <SectionLabel>Recent readings</SectionLabel>
        {readings
          .slice(-6)
          .reverse()
          .map((r) => (
            <Row
              key={r.t}
              label={new Date(r.t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              value={`${r.rh.toFixed(1)}% · ${r.tempF.toFixed(1)}°F`}
            />
          ))}
      </Card>
    </Screen>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.label}>{label}</Text>
      <Text style={{ fontSize: 40, color: colors.text, fontWeight: '300' }}>{value}</Text>
      <Text style={type.caption}>{sub}</Text>
    </View>
  );
}
