// A wishlist entry as a price board: one row per retailer with the
// single-stick price (per ounce for pipe tobacco), when it was checked, and
// the best price highlighted. Tap "Check" to open that store's search for the
// exact cigar and size; tap the price to record what you see.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CIGARBID, openShop, RETAILERS, type Shop } from '../data/retailers';
import { bestPrice, setWishPrice, setWishVitola, type WishItem } from '../db/wishlist';
import type { Vitola } from '../lib/types';
import { colors, radius, space, type } from '../theme';
import { SizePicker } from './SizePicker';
import { Card } from './ui';

const STALE_DAYS = 7;

export function ago(iso: string, at = Date.now()): string {
  const days = Math.floor((at - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function WishCard({
  wish,
  vitolas,
  onChange,
  onRemove,
}: {
  wish: WishItem;
  vitolas: Vitola[];
  onChange: () => void;
  onRemove: () => void;
}) {
  const pipe = wish.kind === 'pipe';
  const shops: Shop[] = pipe ? RETAILERS.filter((r) => r.pipe) : [...RETAILERS, CIGARBID];
  const best = bestPrice(wish);
  const query = [wish.brand, wish.name, !pipe && wish.vitola?.name].filter(Boolean).join(' ');

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md }}>
        <Pressable style={{ flex: 1 }} disabled={!wish.cigarId} onPress={() => router.push(`/cigar/${wish.cigarId}`)}>
          <Text style={type.caption}>{wish.brand}</Text>
          <Text style={type.heading}>{wish.name}</Text>
          {best ? (
            <Text style={[type.caption, { color: colors.brass, marginTop: 2 }]}>
              Best ${best.price.toFixed(2)}
              {pipe ? '/oz' : ' a stick'} at {shops.find((s) => s.id === best.shopId)?.name ?? best.shopId}
            </Text>
          ) : null}
        </Pressable>
        <Pressable hitSlop={8} accessibilityLabel="Remove from wishlist" onPress={onRemove}>
          <Ionicons name="close" size={20} color={colors.textFaint} />
        </Pressable>
      </View>

      {!pipe ? (
        <View style={{ marginBottom: space.md }}>
          <SizePicker
            vitolas={vitolas}
            value={wish.vitola}
            onChange={(v) => void setWishVitola(wish.id, v).then(onChange)}
          />
          {!wish.vitola ? <Text style={[type.caption, { marginTop: 4 }]}>Pick a size so prices compare like for like.</Text> : null}
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={[type.caption, { flex: 1 }]}>Retailer</Text>
        <Text style={[type.caption, { width: 110, textAlign: 'right' }]}>{pipe ? 'Per oz' : 'Single stick'}</Text>
        <View style={{ width: 64 }} />
      </View>
      {shops.map((s) => (
        <PriceRow
          key={s.id}
          shop={s}
          entry={wish.prices[s.id]}
          isBest={best?.shopId === s.id}
          auction={s.id === CIGARBID.id}
          onSave={(p) => void setWishPrice(wish.id, s.id, p).then(onChange)}
          onOpen={() => void openShop(s, query)}
        />
      ))}
    </Card>
  );
}

function PriceRow({
  shop,
  entry,
  isBest,
  auction,
  onSave,
  onOpen,
}: {
  shop: Shop;
  entry?: { price: number; checkedAt: string };
  isBest: boolean;
  auction: boolean;
  onSave: (price: number | null) => void;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [openedAt] = useState(() => Date.now());
  const stale = entry && openedAt - new Date(entry.checkedAt).getTime() > STALE_DAYS * 86_400_000;

  const commit = () => {
    setEditing(false);
    const v = Number(text.replace(/[^\d.]/g, ''));
    onSave(text.trim() === '' ? null : Number.isFinite(v) && v > 0 ? v : entry?.price ?? null);
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontSize: 15 }]} numberOfLines={1}>
          {shop.name}
        </Text>
        {auction ? <Text style={[type.caption, { fontSize: 11 }]}>auction · per-stick bid</Text> : null}
      </View>
      <View style={{ width: 110, alignItems: 'flex-end' }}>
        {editing ? (
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            accessibilityLabel={`${shop.name} price`}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={entry ? `${shop.name} $${entry.price.toFixed(2)}, edit` : `Enter ${shop.name} price`}
            onPress={() => {
              setText(entry ? entry.price.toFixed(2) : '');
              setEditing(true);
            }}
            style={{ alignItems: 'flex-end' }}
          >
            {entry ? (
              <>
                <Text style={[styles.price, isBest && { color: colors.brass }, stale && { color: colors.textMuted }]}>
                  ${entry.price.toFixed(2)}
                  {isBest ? ' ★' : ''}
                </Text>
                <Text style={[type.caption, { fontSize: 11 }]}>{ago(entry.checkedAt)}</Text>
              </>
            ) : (
              <Text style={[type.caption, { color: colors.textFaint }]}>+ add price</Text>
            )}
          </Pressable>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Check ${shop.name}`} onPress={onOpen} style={styles.open}>
        <Text style={{ color: colors.brass, fontSize: 13, fontWeight: '600' }}>Check</Text>
        <Ionicons name="open-outline" size={12} color={colors.brass} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: space.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  price: { color: colors.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  input: {
    width: 90,
    textAlign: 'right',
    color: colors.text,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.brass,
    paddingVertical: 4,
  },
  open: {
    width: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
});
