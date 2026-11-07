import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatVitola, type Vitola } from '../lib/types';
import { colors, radius, space, type } from '../theme';
import { Button, Field } from './ui';

/**
 * Drop-down of every vitola (size) in the identified line. A band photo can't
 * reveal length or ring gauge, so the smoker always chooses — with an escape
 * hatch for sizes the catalog doesn't list (lounge exclusives, new releases).
 */
export function SizePicker({
  vitolas,
  value,
  onChange,
}: {
  vitolas: Vitola[];
  value?: Vitola;
  onChange: (v: Vitola) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [length, setLength] = useState('');
  const [ring, setRing] = useState('');

  const close = () => {
    setOpen(false);
    setCustom(false);
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.trigger}>
        <Text style={[type.body, !value && { color: colors.textFaint }]}>
          {value ? formatVitola(value) : 'Select a size'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={[type.heading, { marginBottom: space.md }]}>{custom ? 'Custom size' : 'Choose size'}</Text>
            {custom ? (
              <View>
                <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Robusto" />
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Field label='Length (in)' value={length} onChangeText={setLength} keyboardType="decimal-pad" placeholder="5.5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Ring gauge" value={ring} onChangeText={setRing} keyboardType="number-pad" placeholder="50" />
                  </View>
                </View>
                <Button
                  title="Use this size"
                  disabled={!name || !Number(length) || !Number(ring)}
                  onPress={() => {
                    onChange({ name, lengthIn: Number(length), ringGauge: Number(ring) });
                    close();
                  }}
                />
              </View>
            ) : (
              <FlatList
                data={vitolas}
                keyExtractor={(v) => `${v.name}-${v.lengthIn}-${v.ringGauge}`}
                style={{ maxHeight: 420 }}
                ListEmptyComponent={<Text style={type.caption}>No sizes on file for this line.</Text>}
                renderItem={({ item }) => {
                  const selected = value?.name === item.name && value?.lengthIn === item.lengthIn;
                  return (
                    <Pressable
                      style={styles.option}
                      onPress={() => {
                        onChange(item);
                        close();
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={type.body}>{item.name}</Text>
                        <Text style={type.caption}>
                          {item.lengthIn}&quot; × {item.ringGauge}
                          {item.shape ? ` · ${item.shape}` : ''}
                        </Text>
                      </View>
                      {selected ? <Ionicons name="checkmark" size={20} color={colors.brass} /> : null}
                    </Pressable>
                  );
                }}
              />
            )}
            <View style={{ marginTop: space.md, gap: space.sm }}>
              {!custom ? <Button variant="secondary" title="Size not listed…" onPress={() => setCustom(true)} /> : null}
              <Button variant="ghost" title="Cancel" onPress={close} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 50,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
