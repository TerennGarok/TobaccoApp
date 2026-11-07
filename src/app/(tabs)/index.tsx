import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StarRating } from '../../components/ui';
import { type CigarSummary, deleteQueueItem, listOpenQueue, searchCigars } from '../../db';
import type { QueueItem } from '../../lib/types';
import { getSettings } from '../../db/settings';
import { ocrAvailable } from '../../services/ocr';
import { onQueueChange, retry } from '../../services/queue';
import { colors, radius, space, type } from '../../theme';

export default function Journal() {
  const [query, setQuery] = useState('');
  const [cigars, setCigars] = useState<CigarSummary[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [hasSheet, setHasSheet] = useState(true);

  const load = useCallback(async () => {
    const [c, q, st] = await Promise.all([searchCigars(query), listOpenQueue(), getSettings()]);
    setCigars(c);
    setQueue(q);
    setHasSheet(!!st.sheetUrl);
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => onQueueChange(() => void load()), [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={cigars}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search brand, line, wrapper, flavor, notes…"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>
            {!hasSheet || !ocrAvailable() ? (
              <Pressable style={styles.hint} onPress={() => router.push('/settings')}>
                <Ionicons name="information-circle-outline" size={18} color={colors.brass} />
                <Text style={[type.caption, { flex: 1 }]}>
                  {!hasSheet
                    ? 'Connect your Google Sheet catalog in Settings so band lookups can find sizes and flavors.'
                    : 'Band reading needs the installed app build; here, type the band text on the verify screen.'}
                </Text>
              </Pressable>
            ) : null}
            {queue.length ? <QueueSection items={queue} onChange={load} /> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="leaf-outline" size={40} color={colors.brassDim} />
            <Text style={[type.heading, { marginTop: space.md }]}>{query ? 'No matches' : 'Your journal is empty'}</Text>
            <Text style={[type.caption, { textAlign: 'center', marginTop: space.sm }]}>
              {query ? 'Try a brand, wrapper, or a flavor like "cedar".' : 'Photograph a cigar band to log your first smoke.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => <CigarRow cigar={item} />}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Add a cigar" style={styles.fab} onPress={() => router.push('/capture')}>
        <Ionicons name="camera" size={22} color={colors.bg} />
        <Text style={styles.fabText}>Add cigar</Text>
      </Pressable>
    </View>
  );
}

function CigarRow({ cigar }: { cigar: CigarSummary }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} onPress={() => router.push(`/cigar/${cigar.id}`)}>
      {cigar.imageUri ? (
        <Image source={{ uri: cigar.imageUri }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="leaf" size={22} color={colors.brassDim} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={type.caption}>{cigar.brand}</Text>
        <Text style={[type.heading, { fontSize: 18 }]} numberOfLines={1}>
          {cigar.line}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 }}>
          {cigar.avgScore != null ? <StarRating value={Math.round(cigar.avgScore * 2) / 2} size={14} /> : null}
          <Text style={type.caption}>
            {cigar.reviewCount} {cigar.reviewCount === 1 ? 'smoke' : 'smokes'}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function QueueSection({ items, onChange }: { items: QueueItem[]; onChange: () => void }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[type.label, { marginBottom: space.sm }]}>Awaiting verification</Text>
      {items.map((item) => {
        const status =
          item.status === 'ready'
            ? `Identified${item.result?.candidates[0] ? ` · ${item.result.candidates[0].brand}` : ''} — tap to verify`
            : item.status === 'failed'
              ? `Couldn't identify — ${item.error ?? 'tap retry'}`
              : item.status === 'processing'
                ? 'Searching…'
                : 'Queued — will search when you are back online';
        return (
          <Pressable
            key={item.id}
            style={styles.queueRow}
            disabled={item.status !== 'ready'}
            onPress={() => router.push(`/review/verify?queueId=${item.id}`)}
          >
            <Image source={{ uri: item.imageUri }} style={styles.queueThumb} />
            <Text style={[type.body, { flex: 1, fontSize: 14 }]}>{status}</Text>
            {item.status === 'failed' ? (
              <Pressable hitSlop={8} onPress={() => void retry(item.id)}>
                <Ionicons name="refresh" size={20} color={colors.brass} />
              </Pressable>
            ) : null}
            <Pressable hitSlop={8} accessibilityLabel="Discard" onPress={() => void deleteQueueItem(item.id).then(onChange)}>
              <Ionicons name="close" size={20} color={colors.textFaint} />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
  },
  hint: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: space.lg,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: space.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: space.sm,
  },
  queueThumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: space.xl },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.brass,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
});
