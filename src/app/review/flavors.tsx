import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { FlavorChip, SourceLegend } from '../../components/FlavorChip';
import { Button, Card, Screen, StepHeader } from '../../components/ui';
import { FLAVOR_FAMILIES } from '../../data/flavors';
import { useDraft } from '../../lib/draft';
import { space, type } from '../../theme';

export default function FlavorsStep() {
  const { draft, update } = useDraft();
  const sourceOf = new Map(draft.suggestions.map((s) => [s.noteId, s.source]));
  const toggle = (id: string) =>
    update({ flavors: draft.flavors.includes(id) ? draft.flavors.filter((f) => f !== id) : [...draft.flavors, id] });

  // Families holding a suggested note float to the top.
  const families = [...FLAVOR_FAMILIES].sort(
    (a, b) => Number(b.notes.some((n) => sourceOf.has(n.id))) - Number(a.notes.some((n) => sourceOf.has(n.id))),
  );

  return (
    <Screen footer={<Button title={`Next: Notes (${draft.flavors.length} selected)`} onPress={() => router.push('/review/notes')} />}>
      <StepHeader
        step={4}
        total={5}
        title="Flavors"
        subtitle="Expected notes are pre-selected and ringed by where they came from. Tap to add what you taste, or remove what you don't."
      />
      {draft.suggestions.length ? (
        <Card>
          <SourceLegend />
        </Card>
      ) : null}
      {families.map((family) => (
        <View key={family.id} style={{ marginBottom: space.xl }}>
          <Text style={[type.label, { marginBottom: space.sm }]}>{family.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {family.notes.map((note) => (
              <FlavorChip
                key={note.id}
                label={note.label}
                selected={draft.flavors.includes(note.id)}
                source={sourceOf.get(note.id)}
                onPress={() => toggle(note.id)}
              />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
