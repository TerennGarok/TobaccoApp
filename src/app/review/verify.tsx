import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../../components/Segmented';
import { SizePicker } from '../../components/SizePicker';
import { Button, Card, Field, Row, Screen, SectionLabel, StepHeader } from '../../components/ui';
import { getCigar, getQueueItem, setQueueStatus, upsertCigar } from '../../db';
import { addLot } from '../../db/inventory';
import { useDraft } from '../../lib/draft';
import { type CigarCandidate, type QueueItem, STRENGTH_LABELS, type Vitola } from '../../lib/types';
import { contribute } from '../../services/catalog';
import { searchCatalog } from '../../services/identify';
import { ocrAvailable } from '../../services/ocr';
import { colors, radius, space, type } from '../../theme';

const BLANK: CigarCandidate = { brand: '', line: '', vitolas: [], flavorSuggestions: [], externalReviews: [], confidence: 0 };
type Mode = 'smoke' | 'stock';

export default function Verify() {
  // A freshly identified photo (queueId), a cigar already in the journal
  // (cigarId), or neither — manual entry. mode=stock starts on "Add to inventory".
  const params = useLocalSearchParams<{ queueId?: string; cigarId?: string; mode?: Mode }>();
  const { begin } = useDraft();
  const [item, setItem] = useState<QueueItem | null>(null);
  const [candidates, setCandidates] = useState<CigarCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [brand, setBrand] = useState('');
  const [line, setLine] = useState('');
  const [vitola, setVitola] = useState<Vitola>();
  const [mode, setMode] = useState<Mode>(params.mode === 'stock' ? 'stock' : 'smoke');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CigarCandidate[]>([]);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [vendor, setVendor] = useState('');
  const [busy, setBusy] = useState(false);

  // Choosing a candidate fills the editable fields and clears the size.
  const select = useCallback((list: CigarCandidate[], i: number) => {
    setIndex(i);
    setBrand(list[i]?.brand ?? '');
    setLine(list[i]?.line ?? '');
    setVitola(undefined);
  }, []);
  const showCandidates = useCallback(
    (list: CigarCandidate[]) => {
      setCandidates(list);
      select(list, 0);
    },
    [select],
  );

  useEffect(() => {
    if (params.queueId)
      void getQueueItem(Number(params.queueId)).then((q) => {
        setItem(q);
        showCandidates(q?.result?.candidates ?? []);
      });
    else if (params.cigarId)
      void getCigar(Number(params.cigarId)).then((c) => c && showCandidates([{ ...c, confidence: 1 }]));
  }, [params.queueId, params.cigarId, showCandidates]);

  useEffect(() => {
    let live = true;
    void searchCatalog(query).then((r) => live && setResults(r));
    return () => {
      live = false;
    };
  }, [query]);

  const candidate = candidates[index] ?? BLANK;

  const cigar = useMemo(() => ({ ...candidate, brand: brand.trim(), line: line.trim() }), [candidate, brand, line]);
  const named = !!cigar.brand && !!cigar.line;
  const fromQueue = item && item.id >= 0 ? item.id : undefined;

  const choose = (c: CigarCandidate) => {
    showCandidates([c, ...candidates.filter((p) => p.brand !== c.brand || p.line !== c.line)]);
    setQuery('');
  };

  const confirmSmoke = () => {
    begin({ cigar, vitola, imageUri: item?.imageUri, queueId: fromQueue });
    router.push('/review/ratings');
  };

  const confirmStock = async () => {
    setBusy(true);
    const cigarId = await upsertCigar(cigar, item?.imageUri);
    await addLot({
      kind: 'cigar',
      itemId: cigarId,
      vitola,
      quantity: Math.max(1, Number(qty) || 1),
      unitPrice: Number(price) || undefined,
      vendor: vendor.trim() || undefined,
    });
    if (fromQueue != null) await setQueueStatus(fromQueue, 'confirmed');
    void contribute(cigar, vitola).catch(() => undefined);
    router.dismissAll();
    router.replace(`/cigar/${cigarId}`);
  };

  return (
    <Screen
      footer={
        <>
          {mode === 'smoke' ? (
            <Button title="Yes — rate this smoke" icon="checkmark" disabled={!named || !vitola} onPress={confirmSmoke} />
          ) : (
            <Button title="Add to inventory" icon="file-tray-stacked" loading={busy} disabled={!named || !vitola} onPress={() => void confirmStock()} />
          )}
          {named && !vitola ? <Text style={[type.caption, { textAlign: 'center' }]}>Choose a size to continue</Text> : null}
        </>
      }
    >
      <StepHeader step={1} total={5} title="Is this your cigar?" subtitle="Confirm the brand and line, then pick the size." />
      <Segmented
        options={[
          { value: 'smoke', label: 'I smoked it' },
          { value: 'stock', label: 'I bought some' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {item?.imageUri && !params.cigarId ? <Image source={{ uri: item.imageUri }} style={styles.photo} /> : null}
      {item?.result?.bandText ? <Text style={[type.caption, { marginBottom: space.lg }]}>Band reads: “{item.result.bandText}”</Text> : null}

      {candidates.length > 1 ? (
        <View style={{ marginBottom: space.lg }}>
          <SectionLabel>Best matches</SectionLabel>
          {candidates.map((c, i) => (
            <Pressable key={`${c.brand}-${c.line}`} onPress={() => select(candidates, i)} style={[styles.candidate, i === index && styles.candidateOn]}>
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

      {!params.cigarId ? (
        <View style={{ marginBottom: space.lg }}>
          <Field
            label={candidates.length ? 'Not right? Search the catalog' : 'Search the catalog'}
            value={query}
            onChangeText={setQuery}
            placeholder={ocrAvailable() ? 'Type words from the band' : 'Type what the band says, e.g. "Padron 1964"'}
            autoCapitalize="none"
            style={{ marginBottom: 0 }}
          />
          {results.map((c) => (
            <Pressable key={`${c.brand}-${c.line}`} style={styles.result} onPress={() => choose(c)}>
              <Text style={type.body}>
                {c.brand} <Text style={{ color: colors.textMuted }}>{c.line}</Text>
              </Text>
              <Text style={type.caption}>{c.vitolas.length} sizes</Text>
            </Pressable>
          ))}
          {query.trim().length >= 2 && !results.length ? (
            <Text style={[type.caption, { marginTop: space.sm }]}>Not in the catalog yet — enter it below and it will be added.</Text>
          ) : null}
        </View>
      ) : null}

      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Padrón" autoCapitalize="words" />
      <Field label="Line / Blend" value={line} onChangeText={setLine} placeholder="e.g. 1964 Anniversary Series Maduro" autoCapitalize="words" />

      <View style={{ marginBottom: space.lg }}>
        <SectionLabel>Size (vitola)</SectionLabel>
        <SizePicker vitolas={candidate.vitolas} value={vitola} onChange={setVitola} />
        <Text style={[type.caption, { marginTop: space.sm }]}>
          The band doesn&apos;t show size.{' '}
          {candidate.vitolas.length ? `${candidate.vitolas.length} sizes are listed for this line.` : 'Add yours with "Size not listed…".'}
        </Text>
      </View>

      {mode === 'stock' ? (
        <Card>
          <SectionLabel>Purchase</SectionLabel>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Price each ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="12.50" />
            </View>
          </View>
          <Field label="Bought from" value={vendor} onChangeText={setVendor} placeholder="e.g. CigarBid, local shop" />
        </Card>
      ) : null}

      {candidate.wrapper || candidate.origin ? (
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
  result: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
