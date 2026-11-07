import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Button, Card, Field, Row, Screen, SectionLabel, StepHeader } from '../../components/ui';
import { noteLabel } from '../../data/flavors';
import { addReview, findCigarId, setQueueStatus, upsertCigar } from '../../db';
import { adjustLot, type InventoryLot, lotsFor, pickLotToDeduct } from '../../db/inventory';
import { useDraft } from '../../lib/draft';
import { bodyLabel, formatVitola, RATING_FIELDS } from '../../lib/types';
import { contribute } from '../../services/catalog';
import { colors, space, type } from '../../theme';
import { THIRDS_TEMPLATE } from '../../lib/templates';

export default function NotesStep() {
  const { draft, update, reset } = useDraft();
  const [saving, setSaving] = useState(false);
  const [lot, setLot] = useState<InventoryLot>();

  // If this cigar is in inventory, offer to take one out.
  useEffect(() => {
    if (!draft.cigar) return;
    void (async () => {
      const id = await findCigarId(draft.cigar!.brand, draft.cigar!.line);
      if (id) setLot(pickLotToDeduct(await lotsFor('cigar', id), draft.vitola));
    })();
  }, [draft.cigar, draft.vitola]);

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
        pairing: draft.pairing.trim(),
        occasion: draft.occasion.trim(),
        durationMin: draft.durationMin,
      });
      if (lot && draft.deductInventory) await adjustLot(lot.id, -1);
      if (draft.queueId != null) await setQueueStatus(draft.queueId, 'confirmed');
      void contribute(draft.cigar, draft.vitola).catch(() => undefined);
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
      <StepHeader step={5} total={5} title="Notes" subtitle="The setting, and anything worth remembering." />

      <Card>
        <SectionLabel>The session</SectionLabel>
        <Field label="Pairing" value={draft.pairing} onChangeText={(pairing) => update({ pairing })} placeholder="e.g. Espresso, Old Fashioned, Port" />
        <Field label="Occasion" value={draft.occasion} onChangeText={(occasion) => update({ occasion })} placeholder="e.g. Back porch after dinner" />
        <Field
          label="Smoke time (minutes)"
          value={draft.durationMin ? String(draft.durationMin) : ''}
          onChangeText={(t) => update({ durationMin: Number(t.replace(/\D/g, '')) || undefined })}
          keyboardType="number-pad"
          placeholder="e.g. 75"
        />
      </Card>

      <Field label="Tasting notes" value={draft.notes} onChangeText={(notes) => update({ notes })} multiline placeholder="What stood out…" />
      <View style={{ marginTop: -space.sm, marginBottom: space.lg }}>
        <Button
          title="Insert first / second / final third"
          icon="list-outline"
          variant="secondary"
          disabled={draft.notes.includes('First third:')}
          onPress={() => update({ notes: draft.notes ? `${draft.notes.trimEnd()}\n\n${THIRDS_TEMPLATE}` : THIRDS_TEMPLATE })}
        />
      </View>

      {lot ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={type.body}>Take one from inventory</Text>
              <Text style={type.caption}>
                {lot.vitola ? formatVitola(lot.vitola) : 'Any size'} · {lot.quantity} on hand
              </Text>
            </View>
            <Switch
              value={draft.deductInventory}
              onValueChange={(v) => update({ deductInventory: v })}
              trackColor={{ true: colors.brassDim, false: colors.border }}
              thumbColor={draft.deductInventory ? colors.brass : colors.textMuted}
            />
          </View>
        </Card>
      ) : null}

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
