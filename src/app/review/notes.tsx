import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button, Card, Field, Row, Screen, StepHeader } from '../../components/ui';
import { noteLabel } from '../../data/flavors';
import { addReview, setQueueStatus, upsertCigar } from '../../db';
import { useDraft } from '../../lib/draft';
import { bodyLabel, formatVitola, RATING_FIELDS } from '../../lib/types';
import { space, type } from '../../theme';

export default function NotesStep() {
  const { draft, update, reset } = useDraft();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.cigar) return;
    setSaving(true);
    try {
      const cigarId = await upsertCigar(draft.cigar, draft.imageUri);
      await addReview({
        cigarId,
        vitola: draft.vitola,
        ratings: draft.ratings,
        hasSpice: draft.hasSpice,
        body: draft.body,
        flavors: draft.flavors,
        notes: draft.notes.trim(),
      });
      if (draft.queueId != null) await setQueueStatus(draft.queueId, 'confirmed');
      reset();
      router.dismissAll();
      router.replace(`/cigar/${cigarId}`);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const overall = RATING_FIELDS.reduce((s, f) => s + draft.ratings[f.key], 0) / RATING_FIELDS.length;

  return (
    <Screen footer={<Button title="Save to journal" icon="bookmark" loading={saving} onPress={() => void save()} />}>
      <StepHeader step={5} total={5} title="Notes" subtitle="Pairing, occasion, how it changed by thirds — anything worth remembering." />
      <Field
        label="Tasting notes"
        value={draft.notes}
        onChangeText={(notes) => update({ notes })}
        multiline
        placeholder="First third opened with…"
      />
      <Card>
        <Text style={[type.label, { marginBottom: space.sm }]}>Summary</Text>
        <Row label="Cigar" value={`${draft.cigar?.brand} ${draft.cigar?.line}`} />
        <Row label="Size" value={draft.vitola ? formatVitola(draft.vitola) : undefined} />
        <Row label="Overall" value={`${overall.toFixed(1)} / 5`} />
        <Row label="Body" value={bodyLabel(draft.body)} />
        <Row label="Spice" value={draft.hasSpice ? 'Yes' : 'No'} />
        <Row label="Flavors" value={draft.flavors.map(noteLabel).join(', ') || '—'} />
      </Card>
    </Screen>
  );
}
