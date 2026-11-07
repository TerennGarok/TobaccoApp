import { Pressable, Text, View } from 'react-native';
import { colors, radius, space } from '../theme';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
        marginBottom: space.lg,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: on ? colors.surfaceRaised : 'transparent' }}
          >
            <Text style={{ textAlign: 'center', color: on ? colors.brass : colors.textMuted, fontWeight: on ? '700' : '500' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
