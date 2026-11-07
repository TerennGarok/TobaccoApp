import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { colors, space, type } from '../theme';
import { Card, Screen } from './ui';

export function ComingSoon({
  icon,
  title,
  blurb,
  points,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  blurb: string;
  points: string[];
}) {
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginVertical: space.xl }}>
        <Ionicons name={icon} size={44} color={colors.brassDim} />
        <Text style={[type.title, { marginTop: space.md }]}>{title}</Text>
        <Text style={[type.caption, { textAlign: 'center', marginTop: space.sm }]}>{blurb}</Text>
      </View>
      <Card>
        <Text style={[type.label, { marginBottom: space.md }]}>Planned</Text>
        {points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
            <Text style={{ color: colors.brass }}>•</Text>
            <Text style={[type.body, { flex: 1, fontSize: 15 }]}>{p}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
