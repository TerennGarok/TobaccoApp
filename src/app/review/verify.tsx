import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SizePicker } from '../../components/SizePicker';
import { Button, Card, Field, Row, Screen, SectionLabel, StepHeader } from '../../components/ui';
import { getCigar, getQueueItem } from '../../db';
import { useDraft } from '../../lib/draft';
import { type CigarCandidate, type QueueItem, STRENGTH_LABELS, type Vitola } from '../../lib/types';
import { colors, radius, space, type } from '../../theme';

const BLANK: CigarCandidate = { brand: '', line: '', vitolas: [], flavorSuggestions: [], externalReviews: [], confidence: 0 };

export default function Verify() {
  // Either a freshly identified photo (queueId) or a cigar already in the journal (cigarId).
  const { queueId, cigarId } = useLocalSearchParams<{ queueId?: string; cigarId?: string }>();
  const { begin } = useDraft();
  const [item, setItem] = useState<QueueItem | null>(null);
  const [index, setIndex] = useState(0);
  const [brand, setBrand] = useState('');
  const [line, setLine] = useState('');
  const [vitola, setVitola] = useState<Vitola>();

  useEffect(() => {
    if (queueId) void getQueueItem(Number(queueId)).then(setItem);
    else if (cigarId)
      void getCigar(Number(cigarId)).then((c) => {
        if (!c) return;
        setItem({
          id: -1,
          imageUri: c.imageUri ?? '',
          status: 'ready',
          attempts: 0,
          createdAt: c.createdAt,
          result: { candidates: [{ ...c, confidence: 1 }] },
        });
      });
  }, [queueId, cigarId]);

  const candidates = item?.result?.candidates ?? [];
  const candidate = candidates[index] ?? BLANK;

  // Selecting a different candidate resets the editable fields.
  useEffect(() => {
    setBrand(candidate.brand);
    setLine(candidate.line);
    setVitola(undefined);
  }, [candidate]);

  const confirm = () => {
    begin({ cigar: { ...candidate, brand: brand.trim(), line: line.trim() }, vitola, imageUri: item?.imageUri, queueId: item && item.id >= 0 ? item.id : undefined });
    router.push('/review/ratings');
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Yes, this is my cigar" icon="checkmark" disabled={!brand.trim() || !line.trim() || !vitola} onPress={confirm} />
          {!vitola ? <Text style={[type.caption, { textAlign: 'center' }]}>Choose a size to continue</Text> : null}
        </>
      }
    >
      <StepHeader step={1} total={5} title="Is this your cigar?" subtitle="Confirm the brand and line, then pick the size you smoked." />

      {item?.imageUri && !cigarId ? <Image source={{ uri: item.imageUri }} style={styles.photo} /> : null}
      {item?.result?.bandText ? <Text style={[type.caption, { marginBottom: space.lg }]}>Band reads: “{item.result.bandText}”</Text> : null}

      {candidates.length > 1 ? (
        <View style={{ marginBottom: space.lg }}>
          <SectionLabel>Best matches</SectionLabel>
          {candidates.map((c, i) => (
            <Pressable key={`${c.brand}-${c.line}`} onPress={() => setIndex(i)} style={[styles.candidate, i === index && styles.candidateOn]}>
              <Ionicons name={i === index ? 'radio-button-on' : 'radio-button-off'} size={20} color={i === index ? colors.brass : colors.textFaint} />
              <View style={{ flex: 1 }}>
                <Text style={type.body}>
                  {c.brand} {c.line}
                </Text>
                <Text style={type.caption}>{Math.round(c.confidence * 100)}% match</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Padrón" autoCapitalize="words" />
      <Field label="Line / Blend" value={line} onChangeText={setLine} placeholder="e.g. 1964 Anniversary Series Maduro" autoCapitalize="words" />

      <View style={{ marginBottom: space.lg }}>
        <SectionLabel>Size (vitola)</SectionLabel>
        <SizePicker vitolas={candidate.vitolas} value={vitola} onChange={setVitola} />
        <Text style={[type.caption, { marginTop: space.sm }]}>
          The band doesn't show size. {candidate.vitolas.length ? `${candidate.vitolas.length} sizes are listed for this line.` : ''}
        </Text>
      </View>

      {candidate.brand ? (
        <Card>
          <SectionLabel>From the manufacturer</SectionLabel>
          <Row label="Wrapper" value={candidate.wrapper} />
          <Row label="Binder" value={candidate.binder} />
          <Row label="Filler" value={candidate.filler} />
          <Row label="Origin" value={candidate.origin} />
          <Row label="Strength" value={candidate.strength ? STRENGTH_LABELS[candidate.strength] : undefined} />
          {candidate.description ? <Text style={[type.caption, { marginTop: space.md }]}>{candidate.description}</Text> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 1.6, borderRadius: radius.lg, marginBottom: space.md, backgroundColor: colors.surface },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.sm,
  },
  candidateOn: { borderColor: colors.brass, backgroundColor: colors.surface },
});
