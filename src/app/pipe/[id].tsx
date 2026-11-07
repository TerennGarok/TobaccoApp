import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { FlavorChip } from '../../components/FlavorChip';
import { Button, Card, Row, Screen, SectionLabel, StarRating } from '../../components/ui';
import { moistureLabel, PIPE_FLAVOR_FAMILIES, PIPE_RATING_FIELDS } from '../../data/pipe';
import { openShop, RETAILERS } from '../../data/retailers';
import { type InventoryLot, lotsFor, restingLabel } from '../../db/inventory';
import { getPipeReviews, getTobacco, overallPipe, type PipeReview, type PipeTobacco } from '../../db/pipe';
import { addWish } from '../../db/wishlist';
import { usePipeDraft } from '../../lib/pipeDraft';
import { bodyLabel } from '../../lib/types';
import { colors, radius, space, type } from '../../theme';

const LABEL = new Map(PIPE_FLAVOR_FAMILIES.flatMap((f) => f.notes).map((n) => [n.id, n.label]));

export default function TobaccoProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { start } = usePipeDraft();
  const [t, setT] = useState<PipeTobacco | null>(null);
  const [reviews, setReviews] = useState<PipeReview[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([getTobacco(Number(id)), getPipeReviews(Number(id)), lotsFor('pipe', Number(id))]).then(([a, b, c]) => {
        setT(a);
        setReviews(b);
        setLots(c);
      });
    }, [id]),
  );

  if (!t) return <Screen>{null}</Screen>;
  const n = reviews.length;
  const avg = (k: (r: PipeReview) => number) => (n ? reviews.reduce((s, r) => s + k(r), 0) / n : 0);
  const overall = avg((r) => overallPipe(r.ratings));
  const counts = new Map<string, number>();
  reviews.forEach((r) => r.flavors.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1)));
  const flavors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const query = `${t.brand} ${t.blend} pipe tobacco`;

  return (
    <Screen>
      <Stack.Screen options={{ title: t.brand }} />
      {t.imageUri ? <Image source={{ uri: t.imageUri }} style={{ width: '100%', aspectRatio: 1.8, borderRadius: radius.lg, marginBottom: space.lg }} /> : null}
      <Text style={type.label}>{t.brand}</Text>
      <Text style={[type.title, { marginTop: 2 }]}>{t.blend}</Text>
      <Text style={[type.caption, { marginTop: space.xs, marginBottom: space.xl }]}>
        {[t.cut, t.components.join(', '), t.aromatic ? 'Aromatic' : null].filter(Boolean).join(' · ')}
      </Text>

      <Card>
        <SectionLabel>My rating</SectionLabel>
        {n ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.md }}>
              <Text style={{ fontSize: 56, lineHeight: 60, color: colors.brass, fontWeight: '300' }}>{overall.toFixed(1)}</Text>
              <View style={{ paddingBottom: 8 }}>
                <StarRating value={Math.round(overall * 2) / 2} size={18} />
                <Text style={type.caption}>
                  across {n} {n === 1 ? 'bowl' : 'bowls'}
                </Text>
              </View>
            </View>
            {PIPE_RATING_FIELDS.map((f) => (
              <Row key={f.key} label={f.label} value={avg((r) => r.ratings[f.key]).toFixed(1)} />
            ))}
            <Row label="Strength" value={bodyLabel(avg((r) => r.strength))} />
            <Row label="Moisture" value={moistureLabel(avg((r) => r.moisture))} />
          </>
        ) : (
          <Text style={type.caption}>Not rated yet.</Text>
        )}
      </Card>

      {flavors.length ? (
        <Card>
          <SectionLabel>Flavor profile</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {flavors.map(([f, c]) => (
              <FlavorChip key={f} label={LABEL.get(f) ?? f} selected count={c} />
            ))}
          </View>
        </Card>
      ) : null}

      {lots.length ? (
        <Card>
          <SectionLabel>In your cellar</SectionLabel>
          {lots.map((l) => (
            <Row key={l.id} label={`Cellared ${restingLabel(l.acquiredAt)}`} value={`${l.quantity} oz`} />
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionLabel>Shop</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {RETAILERS.filter((r) => r.pipe).map((r) => (
            <Pressable
              key={r.id}
              onPress={() => void openShop(r, query)}
              style={{ paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.text }}>{r.name}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => void addWish({ kind: 'pipe', brand: t.brand, name: t.blend })}
            style={{ paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brass }}
          >
            <Text style={{ color: colors.brass }}>♡ Wishlist</Text>
          </Pressable>
        </View>
      </Card>

      <SectionLabel>Smoking log</SectionLabel>
      {reviews.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={type.body}>{new Date(r.smokedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</Text>
            <StarRating value={Math.round(overallPipe(r.ratings) * 2) / 2} size={16} />
          </View>
          <Text style={[type.caption, { marginTop: 4 }]}>
            {[r.pipe, r.pairing && `with ${r.pairing}`, r.occasion, r.durationMin && `${r.durationMin} min`].filter(Boolean).join(' · ')}
          </Text>
          {r.notes ? <Text style={[type.body, { marginTop: space.md, color: colors.textMuted }]}>{r.notes}</Text> : null}
        </Card>
      ))}
      <View style={{ gap: space.sm }}>
        <Button
          title="Log a bowl"
          icon="add"
          onPress={() => {
            start(t.id, `${t.brand} ${t.blend}`);
            router.push('/pipe/rate');
          }}
        />
        <Button title="Add to cellar" icon="file-tray-stacked-outline" variant="secondary" onPress={() => router.push(`/pipe/new?mode=stock&id=${t.id}`)} />
      </View>
    </Screen>
  );
}
