import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FlavorSource } from '../lib/types';
import { colors, radius, space } from '../theme';

export const SOURCE_COLOR: Record<FlavorSource, string> = {
  manufacturer: colors.srcManufacturer,
  reviews: colors.srcReviews,
  both: colors.srcBoth,
};

export const SOURCE_LABEL: Record<FlavorSource, string> = {
  manufacturer: 'Manufacturer',
  reviews: 'Reviewers',
  both: 'Maker & reviewers',
};

/**
 * A flavor push-button. Fill = "I taste this". Colored ring + dot = the app
 * expected this note (manufacturer / reviewers / both).
 */
export function FlavorChip({
  label,
  selected,
  source,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  source?: FlavorSource;
  onPress?: () => void;
  count?: number;
}) {
  const accent = source ? SOURCE_COLOR[source] : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${source ? `, suggested by ${SOURCE_LABEL[source]}` : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.chip,
        source && { borderColor: accent, borderWidth: 1.5 },
        selected && { backgroundColor: source ? accent : colors.text, borderColor: source ? accent : colors.text },
        pressed && { opacity: 0.7 },
      ]}
    >
      {source && !selected ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
      <Text style={[styles.text, selected && { color: colors.bg, fontWeight: '700' }]}>
        {label}
        {count && count > 1 ? `  ×${count}` : ''}
      </Text>
    </Pressable>
  );
}

export function SourceLegend() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {(Object.keys(SOURCE_COLOR) as FlavorSource[]).map((s) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.dot, { backgroundColor: SOURCE_COLOR[s], marginRight: 0 }]} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{SOURCE_LABEL[s]}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[styles.dot, { backgroundColor: colors.text, marginRight: 0 }]} />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Your addition</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  text: { color: colors.text, fontSize: 14 },
});
