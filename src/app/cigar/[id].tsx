// One-page cigar profile: everything known about a cigar, amalgamated from the
// catalog lookup and every session you've logged.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlavorChip, SourceLegend } from '../../components/FlavorChip';
import { Button, Card, Row, Screen, SectionLabel, StarRating } from '../../components/ui';
import { noteLabel } from '../../data/flavors';
import { getCigar, getReviews } from '../../db';
import { type InventoryLot, lotsFor, restingLabel } from '../../db/inventory';
import { addWish, isWished, removeWish } from '../../db/wishlist';
import { CIGARBID, openShop, RETAILERS } from '../../data/retailers';
import { aggregate } from '../../lib/aggregate';
import { bodyLabel, type Cigar, formatVitola, RATING_FIELDS, type Review, STRENGTH_LABELS } from '../../lib/types';
import { colors, radius, space, type } from '../../theme';

export default function CigarProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cigar, setCigar] = useState<Cigar | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [wishId, setWishId] = useState<number | null>(null);

  const load = useCallback(() => {
    void Promise.all([getCigar(Number(id)), getReviews(Number(id)), lotsFor('cigar', Number(id))]).then(async ([c, r, l]) => {
      setCigar(c);
      setReviews(r);
      setLots(l);
      if (c) setWishId(await isWished('cigar', c.brand, c.line));
    });
  }, [id]);
  useFocusEffect(load);

  if (!cigar) return <Screen>{null}</Screen>;
  const agg = aggregate(reviews);
  const sourceOf = new Map(cigar.flavorSuggestions.map((s) => [s.noteId, s.source]));
  const tasted = new Set(agg.flavorCounts.map((f) => f.noteId));
  const expectedNotTasted = cigar.flavorSuggestions.filter((s) => !tasted.has(s.noteId));

  // Re-confirm size each time — you may be smoking a different vitola.
  const smokeAgain = () => router.push(`/review/verify?cigarId=${cigar.id}`);
  const query = `${cigar.brand} ${cigar.line}`;
  const onHand = lots.reduce((s, l) => s + l.quantity, 0);
  const toggleWish = async () => {
    if (wishId) await removeWish(wishId);
    else await addWish({ kind: 'cigar', brand: cigar.brand, name: cigar.line, cigarId: cigar.id });
    load();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: cigar.brand }} />

      {/* Hero */}
      <View style={styles.hero}>
        {cigar.imageUri ? <Image source={{ uri: cigar.imageUri }} style={styles.heroImg} /> : null}
        <Text style={type.label}>{cigar.brand}</Text>
        <Text style={[type.title, { marginTop: 2 }]}>{cigar.line}</Text>
        <Text style={[type.caption, { marginTop: space.xs }]}>
          {[cigar.origin, cigar.wrapper, cigar.strength ? STRENGTH_LABELS[cigar.strength] : null].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.actions}>
        <Action icon="add-circle-outline" label="Log smoke" onPress={smokeAgain} />
        <Action
          icon="file-tray-stacked-outline"
          label={onHand ? `${onHand} on hand` : 'Add stock'}
          onPress={() => router.push(`/review/verify?cigarId=${cigar.id}&mode=stock`)}
        />
        <Action icon={wishId ? 'heart' : 'heart-outline'} label={wishId ? 'Wishlisted' : 'Wishlist'} onPress={() => void toggleWish()} active={!!wishId} />
        <Action icon="hammer-outline" label="CigarBid" onPress={() => void openShop(CIGARBID, query)} />
      </View>

      {/* My verdict */}
      <Card>
        <SectionLabel>My rating</SectionLabel>
        {agg.ratings ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.md }}>
              <Text style={styles.bigScore}>{agg.overall!.toFixed(1)}</Text>
              <View style={{ paddingBottom: 8 }}>
                <StarRating value={Math.round(agg.overall! * 2) / 2} size={18} />
                <Text style={type.caption}>
                  across {agg.count} {agg.count === 1 ? 'smoke' : 'smokes'}
                </Text>
              </View>
            </View>
            {RATING_FIELDS.map(({ key, label }) => (
              <View key={key} style={styles.barRow}>
                <Text style={[type.caption, { width: 100 }]}>{label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(agg.ratings![key] / 5) * 100}%` }]} />
                </View>
                <Text style={[type.caption, { width: 30, textAlign: 'right' }]}>{agg.ratings![key].toFixed(1)}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={type.caption}>Not rated yet.</Text>
        )}
      </Card>

      {/* Body & spice */}
      {agg.body != null ? (
        <Card>
          <SectionLabel>Body & spice</SectionLabel>
          <View style={styles.bodyTrack}>
            <View style={[styles.bodyMarker, { left: `${agg.body}%` }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
            <Text style={type.caption}>Mild</Text>
            <Text style={[type.caption, { color: colors.brass }]}>{bodyLabel(agg.body)}</Text>
            <Text style={type.caption}>Full</Text>
          </View>
          <Text style={[type.body, { marginTop: space.md }]}>
            Spice noted in {Math.round(agg.spicePct!)}% of smokes
          </Text>
        </Card>
      ) : null}

      {/* Flavor profile */}
      <Card>
        <SectionLabel>Flavor profile</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
          {agg.flavorCounts.map((f) => (
            <FlavorChip key={f.noteId} label={noteLabel(f.noteId)} selected source={sourceOf.get(f.noteId)} count={f.count} />
          ))}
          {!agg.flavorCounts.length ? <Text style={type.caption}>No flavors logged yet.</Text> : null}
        </View>
        {expectedNotTasted.length ? (
          <>
            <Text style={[type.caption, { marginBottom: space.sm }]}>Expected, but you haven't noted:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
              {expectedNotTasted.map((s) => (
                <FlavorChip key={s.noteId} label={noteLabel(s.noteId)} selected={false} source={s.source} />
              ))}
            </View>
          </>
        ) : null}
        {cigar.flavorSuggestions.length ? <SourceLegend /> : null}
      </Card>

      {/* What others say */}
      {cigar.externalReviews.length ? (
        <Card>
          <SectionLabel>What others say</SectionLabel>
          {cigar.externalReviews.map((r, i) => {
            const mine = agg.overall != null && r.score != null && r.scale ? (agg.overall / 5) * r.scale : null;
            return (
              <Pressable key={i} disabled={!r.url} onPress={() => r.url && void Linking.openURL(r.url)} style={styles.extRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{r.source}</Text>
                  {r.summary ? <Text style={type.caption}>{r.summary}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {r.score != null ? (
                    <Text style={[type.heading, { color: colors.srcReviews }]}>
                      {r.score}
                      <Text style={type.caption}>/{r.scale ?? '?'}</Text>
                    </Text>
                  ) : null}
                  {mine != null ? <Text style={type.caption}>you: {mine.toFixed(r.scale! > 10 ? 0 : 1)}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {/* Inventory */}
      {lots.length ? (
        <Card>
          <SectionLabel>In your humidor</SectionLabel>
          {lots.map((l) => (
            <Row
              key={l.id}
              label={`${l.vitola?.name ?? 'Any size'} · resting ${restingLabel(l.acquiredAt)}`}
              value={`${l.quantity}${l.unitPrice ? ` @ $${l.unitPrice.toFixed(2)}` : ''}`}
            />
          ))}
        </Card>
      ) : null}

      {/* Shop */}
      <Card>
        <SectionLabel>Shop & auctions</SectionLabel>
        <Button title="Find on CigarBid" icon="hammer" onPress={() => void openShop(CIGARBID, query)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {RETAILERS.map((r) => (
            <Pressable key={r.id} style={styles.shopChip} onPress={() => void openShop(r, query)}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{r.name}</Text>
              <Ionicons name="open-outline" size={14} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Specs */}
      <Card>
        <SectionLabel>Specifications</SectionLabel>
        <Row label="Manufacturer" value={cigar.manufacturer} />
        <Row label="Wrapper" value={cigar.wrapper} />
        <Row label="Binder" value={cigar.binder} />
        <Row label="Filler" value={cigar.filler} />
        <Row label="Origin" value={cigar.origin} />
        <Row label="Strength (maker)" value={cigar.strength ? STRENGTH_LABELS[cigar.strength] : undefined} />
        {cigar.description ? <Text style={[type.caption, { marginTop: space.md }]}>{cigar.description}</Text> : null}
        {cigar.vitolas.length ? (
          <>
            <Text style={[type.label, { marginTop: space.lg, marginBottom: space.sm }]}>Sizes in this line</Text>
            {cigar.vitolas.map((v) => (
              <Text key={`${v.name}-${v.lengthIn}`} style={[type.caption, { paddingVertical: 2 }]}>
                {formatVitola(v)}
                {reviews.some((r) => r.vitola?.name === v.name) ? '  ✓ smoked' : ''}
              </Text>
            ))}
          </>
        ) : null}
      </Card>

      {/* Sessions */}
      <SectionLabel>Smoking log</SectionLabel>
      {reviews.map((r) => {
        const overall = RATING_FIELDS.reduce((s, f) => s + r.ratings[f.key], 0) / RATING_FIELDS.length;
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={type.body}>{new Date(r.smokedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</Text>
                <Text style={type.caption}>{r.vitola ? formatVitola(r.vitola) : 'Size not recorded'}</Text>
              </View>
              <StarRating value={Math.round(overall * 2) / 2} size={16} />
            </View>
            {r.pairing || r.occasion || r.durationMin ? (
              <Text style={[type.caption, { marginTop: space.sm }]}>
                {[r.pairing && `with ${r.pairing}`, r.occasion, r.durationMin && `${r.durationMin} min`].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {r.notes ? <Text style={[type.body, { marginTop: space.md, color: colors.textMuted }]}>{r.notes}</Text> : null}
          </Card>
        );
      })}

      {!reviews.length ? <Text style={[type.caption, { marginBottom: space.lg }]}>Not smoked yet.</Text> : null}
      <Button title="Log a smoke" icon="add" onPress={smokeAgain} />
      {cigar.sourceUrls?.length ? (
        <View style={{ marginTop: space.xl }}>
          <SectionLabel>Sources</SectionLabel>
          {cigar.sourceUrls.map((u) => (
            <Pressable key={u} onPress={() => void Linking.openURL(u)} style={{ flexDirection: 'row', gap: 6, paddingVertical: 4 }}>
              <Ionicons name="link" size={14} color={colors.textFaint} />
              <Text style={[type.caption, { flexShrink: 1 }]} numberOfLines={1}>
                {u}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function Action({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={22} color={active ? colors.danger : colors.brass} />
      <Text style={[type.caption, { fontSize: 12, marginTop: 4 }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  shopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: { marginBottom: space.xl },
  heroImg: { width: '100%', aspectRatio: 1.8, borderRadius: radius.lg, marginBottom: space.lg, backgroundColor: colors.surface },
  bigScore: { fontSize: 56, lineHeight: 60, color: colors.brass, fontWeight: '300' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.brass },
  bodyTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: space.sm },
  bodyMarker: {
    position: 'absolute',
    top: -5,
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brass,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  extRow: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
