import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen, SectionLabel } from '../../components/ui';
import { adjustLot, type InventoryLot, listLots, restingLabel } from '../../db/inventory';
import { formatVitola } from '../../lib/types';
import { colors, radius, space, type } from '../../theme';

export default function Inventory() {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const load = useCallback(() => void listLots().then(setLots), []);
  useFocusEffect(load);

  const cigars = lots.filter((l) => l.kind === 'cigar');
  const pipe = lots.filter((l) => l.kind === 'pipe');
  const sticks = cigars.reduce((s, l) => s + l.quantity, 0);
  const value = lots.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0);

  const bump = async (l: InventoryLot, d: number) => {
    await adjustLot(l.id, d);
    load();
  };

  return (
    <Screen>
      <View style={styles.stats}>
        <Stat label="Cigars" value={String(sticks)} />
        <Stat label="Pipe tobacco" value={`${pipe.reduce((s, l) => s + l.quantity, 0)} oz`} />
        <Stat label="Value paid" value={`$${value.toFixed(0)}`} />
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.xl }}>
        <View style={{ flex: 1 }}>
          <Button title="Add cigars" icon="add" onPress={() => router.push('/review/verify?mode=stock')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Add tobacco" icon="add" variant="secondary" onPress={() => router.push('/pipe/new?mode=stock')} />
        </View>
      </View>

      {!lots.length ? (
        <Text style={[type.caption, { textAlign: 'center' }]}>
          Nothing here yet. Smokes you log are deducted from inventory automatically.
        </Text>
      ) : null}

      {[
        { title: 'Cigars', items: cigars },
        { title: 'Pipe tobacco', items: pipe },
      ]
        .filter((g) => g.items.length)
        .map((g) => (
          <View key={g.title}>
            <SectionLabel>{g.title}</SectionLabel>
            {g.items.map((l) => (
              <Card key={l.id} style={{ padding: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}
                    onPress={() => router.push(l.kind === 'cigar' ? `/cigar/${l.itemId}` : `/pipe/${l.itemId}`)}
                  >
                    {l.imageUri ? (
                      <Image source={{ uri: l.imageUri }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="leaf" size={18} color={colors.brassDim} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={type.caption}>{l.subtitle}</Text>
                      <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                        {l.title}
                      </Text>
                      <Text style={type.caption}>
                        {l.vitola ? `${formatVitola(l.vitola)} · ` : ''}resting {restingLabel(l.acquiredAt)}
                        {l.vendor ? ` · ${l.vendor}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={styles.stepper}>
                    <Pressable hitSlop={6} accessibilityLabel="One fewer" onPress={() => void bump(l, l.kind === 'pipe' ? -0.5 : -1)}>
                      <Ionicons name="remove" size={18} color={colors.textMuted} />
                    </Pressable>
                    <Text style={[type.body, { minWidth: 28, textAlign: 'center' }]}>{l.quantity}</Text>
                    <Pressable hitSlop={6} accessibilityLabel="One more" onPress={() => void bump(l, l.kind === 'pipe' ? 0.5 : 1)}>
                      <Ionicons name="add" size={18} color={colors.brass} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ))}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={{ color: colors.brass, fontSize: 24, fontWeight: '300' }}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  stat: { flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center' },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
});
