import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { Switch, Text, View } from 'react-native';
import { Button, Card, Screen, SectionLabel, StepHeader } from '../../components/ui';
import { useDraft } from '../../lib/draft';
import { bodyLabel } from '../../lib/types';
import { colors, space, type } from '../../theme';

export default function CharacterStep() {
  const { draft, update } = useDraft();
  return (
    <Screen footer={<Button title="Next: Flavors" onPress={() => router.push('/review/flavors')} />}>
      <StepHeader step={3} total={5} title="Character" subtitle="Body and spice — pre-set from the manufacturer's description." />

      <Card>
        <SectionLabel>Body</SectionLabel>
        <Text style={[type.heading, { color: colors.brass }]}>{bodyLabel(draft.body)}</Text>
        <Slider
          style={{ width: '100%', height: 44, marginTop: space.sm }}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={draft.body}
          onValueChange={(v: number) => update({ body: v })}
          minimumTrackTintColor={colors.brass}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.brass}
          accessibilityLabel="Body, from mild to full"
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={type.caption}>Mild</Text>
          <Text style={type.caption}>Medium</Text>
          <Text style={type.caption}>Full</Text>
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={type.heading}>Spice</Text>
            <Text style={type.caption}>Any pepper, baking spice or tingle on the palate or retrohale</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={[type.body, { color: draft.hasSpice ? colors.brass : colors.textMuted }]}>{draft.hasSpice ? 'Yes' : 'No'}</Text>
            <Switch
              value={draft.hasSpice}
              onValueChange={(v) => update({ hasSpice: v })}
              trackColor={{ true: colors.brassDim, false: colors.border }}
              thumbColor={draft.hasSpice ? colors.brass : colors.textMuted}
              accessibilityLabel="Has spice"
            />
          </View>
        </View>
      </Card>
    </Screen>
  );
}
