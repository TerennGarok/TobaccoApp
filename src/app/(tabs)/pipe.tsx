import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StarRating } from '../../components/ui';
import { searchTobaccos, type TobaccoSummary } from '../../db/pipe';
import { colors, radius, space, type } from '../../theme';

export default function PipeJournal() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TobaccoSummary[]>([]);
  useFocusEffect(useCallback(() => void searchTobaccos(query).then(setItems), [query]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search blend, brand, leaf, notes…"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 80 }}>
            <Ionicons name="flame-outline" size={40} color={colors.brassDim} />
            <Text style={[type.heading, { marginTop: space.md }]}>{query ? 'No matches' : 'No pipe tobacco yet'}</Text>
            <Text style={[type.caption, { marginTop: space.sm }]}>Add a blend to start your pipe journal.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/pipe/${item.id}`)}>
            {item.imageUri ? (
              <Image source={{ uri: item.imageUri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="flame" size={20} color={colors.brassDim} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={type.caption}>{item.brand}</Text>
              <Text style={[type.heading, { fontSize: 18 }]} numberOfLines={1}>
                {item.blend}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 }}>
                {item.avgScore != null ? <StarRating value={Math.round(item.avgScore * 2) / 2} size={14} /> : null}
                <Text style={type.caption}>{[item.cut, item.components.slice(0, 2).join(' / ')].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/pipe/new')}>
        <Ionicons name="add" size={22} color={colors.bg} />
        <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 16 }}>Add blend</Text>
      </Pressable>
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
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: space.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
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
  },
});
