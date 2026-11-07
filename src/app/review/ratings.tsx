import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Screen, StarRating, StepHeader } from '../../components/ui';
import { useDraft } from '../../lib/draft';
import { RATING_FIELDS } from '../../lib/types';
import { space, type } from '../../theme';

export default function RatingsStep() {
  const { draft, update } = useDraft();
  const complete = RATING_FIELDS.every(({ key }) => draft.ratings[key] > 0);
  return (
    <Screen footer={<Button title="Next: Character" disabled={!complete} onPress={() => router.push('/review/character')} />}>
      <StepHeader step={2} total={5} title="Ratings" subtitle={`${draft.cigar?.brand ?? ''} ${draft.cigar?.line ?? ''}`.trim()} />
      {RATING_FIELDS.map(({ key, label, hint }) => (
        <Card key={key}>
          <View style={{ gap: space.md }}>
            <View>
              <Text style={type.heading}>{label}</Text>
              <Text style={type.caption}>{hint}</Text>
            </View>
            <StarRating value={draft.ratings[key]} onChange={(v) => update({ ratings: { ...draft.ratings, [key]: v } })} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
