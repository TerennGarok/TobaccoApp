import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Screen, SectionLabel, StarRating, StepHeader } from '../../components/ui';
import { moistureLabel, PIPE_RATING_FIELDS } from '../../data/pipe';
import { usePipeDraft } from '../../lib/pipeDraft';
import { bodyLabel } from '../../lib/types';
import { colors, space, type } from '../../theme';

export default function PipeRate() {
  const { draft, update } = usePipeDraft();
  const complete = PIPE_RATING_FIELDS.every((f) => draft.ratings[f.key] > 0);
  return (
    <Screen footer={<Button title="Next: Flavors & notes" disabled={!complete} onPress={() => router.push('/pipe/notes')} />}>
      <StepHeader step={1} total={2} title="Ratings & character" subtitle={draft.title} />
      {PIPE_RATING_FIELDS.map(({ key, label, hint }) => (
        <Card key={key}>
          <Text style={type.heading}>{label}</Text>
          <Text style={[type.caption, { marginBottom: space.md }]}>{hint}</Text>
          <StarRating value={draft.ratings[key]} onChange={(v) => update({ ratings: { ...draft.ratings, [key]: v } })} />
        </Card>
      ))}
      <Card>
        <SectionLabel>Strength</SectionLabel>
        <Text style={[type.heading, { color: colors.brass }]}>{bodyLabel(draft.strength)}</Text>
        <Slider
          style={{ width: '100%', height: 44 }}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={draft.strength}
          onValueChange={(v: number) => update({ strength: v })}
          minimumTrackTintColor={colors.brass}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.brass}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={type.caption}>Mild</Text>
          <Text style={type.caption}>Full</Text>
        </View>
      </Card>
      <Card>
        <SectionLabel>Moisture out of the tin</SectionLabel>
        <Text style={[type.heading, { color: colors.brass }]}>{moistureLabel(draft.moisture)}</Text>
        <Slider
          style={{ width: '100%', height: 44 }}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={draft.moisture}
          onValueChange={(v: number) => update({ moisture: v })}
          minimumTrackTintColor={colors.brass}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.brass}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={type.caption}>Dry</Text>
          <Text style={type.caption}>Wet</Text>
        </View>
      </Card>
    </Screen>
  );
}
