import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { FlavorChip } from '../../components/FlavorChip';
import { Button, Card, Field, Screen, SectionLabel, StepHeader } from '../../components/ui';
import { PIPE_FLAVOR_FAMILIES } from '../../data/pipe';
import { adjustLot, type InventoryLot, lotsFor } from '../../db/inventory';
import { addPipeReview } from '../../db/pipe';
import { usePipeDraft } from '../../lib/pipeDraft';
import { colors, space, type } from '../../theme';

export default function PipeNotes() {
  const { draft, update } = usePipeDraft();
  const [saving, setSaving] = useState(false);
  const [lot, setLot] = useState<InventoryLot>();

  useEffect(() => {
    if (draft.tobaccoId) void lotsFor('pipe', draft.tobaccoId).then((l) => setLot(l.find((x) => x.quantity > 0)));
  }, [draft.tobaccoId]);

  const toggle = (id: string) =>
    update({ flavors: draft.flavors.includes(id) ? draft.flavors.filter((f) => f !== id) : [...draft.flavors, id] });

  const save = async () => {
    if (!draft.tobaccoId) return;
    setSaving(true);
    await addPipeReview({
      tobaccoId: draft.tobaccoId,
      ratings: draft.ratings,
      strength: draft.strength,
      moisture: draft.moisture,
      flavors: draft.flavors,
      pipe: draft.pipe.trim(),
      pairing: draft.pairing.trim(),
      occasion: draft.occasion.trim(),
      durationMin: draft.durationMin,
      notes: draft.notes.trim(),
    });
    // A bowl is roughly 1/10 oz.
    if (lot && draft.deductInventory) await adjustLot(lot.id, -0.1);
    router.dismissAll();
    router.replace(`/pipe/${draft.tobaccoId}`);
  };

  return (
    <Screen footer={<Button title="Save to journal" icon="bookmark" loading={saving} onPress={() => void save()} />}>
      <StepHeader step={2} total={2} title="Flavors & notes" subtitle={draft.title} />
      {PIPE_FLAVOR_FAMILIES.map((family) => (
        <View key={family.id} style={{ marginBottom: space.lg }}>
          <Text style={[type.label, { marginBottom: space.sm }]}>{family.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {family.notes.map((n) => (
              <FlavorChip key={n.id} label={n.label} selected={draft.flavors.includes(n.id)} onPress={() => toggle(n.id)} />
            ))}
          </View>
        </View>
      ))}
      <Card>
        <SectionLabel>The session</SectionLabel>
        <Field label="Pipe used" value={draft.pipe} onChangeText={(pipe) => update({ pipe })} placeholder="e.g. Briar billiard, corn cob" />
        <Field label="Pairing" value={draft.pairing} onChangeText={(pairing) => update({ pairing })} placeholder="e.g. Black coffee" />
        <Field label="Occasion" value={draft.occasion} onChangeText={(occasion) => update({ occasion })} />
        <Field
          label="Smoke time (minutes)"
          value={draft.durationMin ? String(draft.durationMin) : ''}
          onChangeText={(t) => update({ durationMin: Number(t.replace(/\D/g, '')) || undefined })}
          keyboardType="number-pad"
        />
      </Card>
      <Field label="Tasting notes" value={draft.notes} onChangeText={(notes) => update({ notes })} multiline placeholder="How it changed down the bowl…" />
      {lot ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={type.body}>Deduct a bowl (0.1 oz) — {lot.quantity} oz on hand</Text>
            <Switch
              value={draft.deductInventory}
              onValueChange={(v) => update({ deductInventory: v })}
              trackColor={{ true: colors.brassDim, false: colors.border }}
              thumbColor={draft.deductInventory ? colors.brass : colors.textMuted}
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
