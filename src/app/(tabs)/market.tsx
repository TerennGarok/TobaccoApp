import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Screen, SectionLabel } from '../../components/ui';
import { WishCard } from '../../components/WishCard';
import { CIGARBID, openShop, RETAILERS, type Shop } from '../../data/retailers';
import { getReviews, searchCigars } from '../../db';
import { addWish, listWishes, removeWish, type WishItem } from '../../db/wishlist';
import { aggregate } from '../../lib/aggregate';
import { type CatalogEntry, catalogKey } from '../../lib/catalogFormat';
import { type Liked, recommend, type Recommendation } from '../../lib/recommend';
import { loadCatalog } from '../../services/catalog';
import { colors, radius, space, type } from '../../theme';

export default function Market() {
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Map<string, CatalogEntry>>(new Map());

  const load = useCallback(() => {
    void (async () => {
      setWishes(await listWishes());
      const mine = await searchCigars('');
      const liked: Liked[] = [];
      for (const c of mine.filter((m) => (m.avgScore ?? 0) >= 4)) {
        const agg = aggregate(await getReviews(c.id));
        liked.push({
          brand: c.brand,
          line: c.line,
          score: c.avgScore ?? 0,
          flavors: agg.flavorCounts.map((f) => f.noteId),
          body: agg.body ?? 50,
          wrapper: c.wrapper,
        });
      }
      const smoked = new Set(mine.filter((m) => m.reviewCount > 0).map((m) => catalogKey(m.brand, m.line)));
      const all = await loadCatalog();
      setCatalog(new Map(all.map((e) => [catalogKey(e.brand, e.line), e])));
      setRecs(recommend(all, liked, smoked));
    })();
  }, []);
  useFocusEffect(load);

  return (
    <Screen>
      <Card>
        <SectionLabel>Shop for anything</SectionLabel>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cigar or pipe tobacco name"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
        {query.trim() ? <ShopLinks query={query.trim()} /> : null}
      </Card>

      <SectionLabel>Wishlist · prices</SectionLabel>
      {wishes.length ? (
        wishes.map((w) => (
          <WishCard
            key={w.id}
            wish={w}
            vitolas={catalog.get(catalogKey(w.brand, w.name))?.vitolas ?? []}
            onChange={load}
            onRemove={() => void removeWish(w.id).then(load)}
          />
        ))
      ) : (
        <Text style={[type.caption, { marginBottom: space.xl }]}>Tap the heart on any cigar to save it here.</Text>
      )}

      <SectionLabel>Try next</SectionLabel>
      {recs.length ? (
        recs.map((r) => (
          <Card key={catalogKey(r.entry.brand, r.entry.line)}>
            <Text style={type.caption}>{r.entry.brand}</Text>
            <Text style={type.heading}>{r.entry.line}</Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              Because you liked {r.because} · {Math.round(r.similarity * 100)}% similar
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Wishlist"
                  icon="heart-outline"
                  variant="secondary"
                  onPress={() => void addWish({ kind: 'cigar', brand: r.entry.brand, name: r.entry.line }).then(load)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="CigarBid" icon="hammer" onPress={() => void openShop(CIGARBID, `${r.entry.brand} ${r.entry.line}`)} />
              </View>
            </View>
          </Card>
        ))
      ) : (
        <Text style={type.caption}>Rate a few cigars 4★ or higher and suggestions from the catalog will appear here.</Text>
      )}
    </Screen>
  );
}

function ShopLinks({ query, pipe }: { query: string; pipe?: boolean }) {
  const shops: Shop[] = pipe ? RETAILERS.filter((r) => r.pipe) : [CIGARBID, ...RETAILERS];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
      {shops.map((s) => (
        <Pressable key={s.id} style={[styles.chip, s.id === 'cigarbid' && styles.chipBid]} onPress={() => void openShop(s, query)}>
          {s.id === 'cigarbid' ? <Ionicons name="hammer" size={14} color={colors.bg} /> : null}
          <Text style={{ color: s.id === 'cigarbid' ? colors.bg : colors.text, fontSize: 14, fontWeight: s.id === 'cigarbid' ? '700' : '400' }}>
            {s.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    padding: space.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipBid: { backgroundColor: colors.brass, borderColor: colors.brass },
});
