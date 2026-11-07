import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import { FlavorChip } from '../../components/FlavorChip';
import { Segmented } from '../../components/Segmented';
import { Button, Card, Field, Screen, SectionLabel } from '../../components/ui';
import { COMPONENTS, CUTS } from '../../data/pipe';
import { addLot } from '../../db/inventory';
import { getTobacco, upsertTobacco } from '../../db/pipe';
import { usePipeDraft } from '../../lib/pipeDraft';
import { readBandText } from '../../services/ocr';
import { persistPhoto } from '../../services/photos';
import { colors, radius, space, type } from '../../theme';

type Mode = 'smoke' | 'stock';

export default function NewBlend() {
  const params = useLocalSearchParams<{ mode?: Mode; id?: string }>();
  const { start } = usePipeDraft();
  const [mode, setMode] = useState<Mode>(params.mode === 'stock' ? 'stock' : 'smoke');
  const [imageUri, setImageUri] = useState<string>();
  const [tinText, setTinText] = useState('');
  const [brand, setBrand] = useState('');
  const [blend, setBlend] = useState('');
  const [cut, setCut] = useState<string>();
  const [components, setComponents] = useState<string[]>([]);
  const [aromatic, setAromatic] = useState(false);
  const [description, setDescription] = useState('');
  const [oz, setOz] = useState('1.75');
  const [price, setPrice] = useState('');
  const [vendor, setVendor] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    void getTobacco(Number(params.id)).then((t) => {
      if (!t) return;
      setBrand(t.brand);
      setBlend(t.blend);
      setCut(t.cut);
      setComponents(t.components);
      setAromatic(t.aromatic);
      setDescription(t.description ?? '');
      setImageUri(t.imageUri);
    });
  }, [params.id]);

  const photo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const uri = await persistPhoto(res.assets[0].uri);
    setImageUri(uri);
    const lines = await readBandText(uri);
    if (lines.length) {
      setTinText(lines.join(' · '));
      if (!brand) setBrand(lines[0]);
      if (!blend && lines[1]) setBlend(lines[1]);
    }
  };

  const save = async () => {
    setBusy(true);
    const id = await upsertTobacco({
      brand: brand.trim(),
      blend: blend.trim(),
      cut,
      components,
      aromatic,
      description: description.trim() || undefined,
      imageUri,
    });
    if (mode === 'stock') {
      await addLot({ kind: 'pipe', itemId: id, quantity: Number(oz) || 1, unitPrice: Number(price) || undefined, vendor: vendor.trim() || undefined });
      router.dismissAll();
      router.replace(`/pipe/${id}`);
    } else {
      start(id, `${brand.trim()} ${blend.trim()}`);
      router.push('/pipe/rate');
    }
  };

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Screen
      footer={
        <Button
          title={mode === 'stock' ? 'Add to inventory' : 'Next: Ratings'}
          loading={busy}
          disabled={!brand.trim() || !blend.trim()}
          onPress={() => void save()}
        />
      }
    >
      <Text style={type.title}>The blend</Text>
      <Text style={[type.caption, { marginTop: space.sm, marginBottom: space.lg }]}>
        A photo of the tin label fills in what it can read; confirm the rest.
      </Text>
      <Segmented
        options={[
          { value: 'smoke', label: 'I smoked it' },
          { value: 'stock', label: 'I bought some' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {imageUri ? <Image source={{ uri: imageUri }} style={{ width: '100%', aspectRatio: 1.6, borderRadius: radius.lg, marginBottom: space.md }} /> : null}
      <View style={{ marginBottom: space.lg }}>
        <Button title={imageUri ? 'Change photo' : 'Add tin photo'} icon="camera-outline" variant="secondary" onPress={() => void photo()} />
        {tinText ? <Text style={[type.caption, { marginTop: space.sm }]}>Label reads: “{tinText}”</Text> : null}
      </View>

      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Samuel Gawith" autoCapitalize="words" />
      <Field label="Blend" value={blend} onChangeText={setBlend} placeholder="e.g. Full Virginia Flake" autoCapitalize="words" />

      <SectionLabel>Cut</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.xl }}>
        {CUTS.map((c) => (
          <FlavorChip key={c} label={c} selected={cut === c} onPress={() => setCut(cut === c ? undefined : c)} />
        ))}
      </View>

      <SectionLabel>Leaf components</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.xl }}>
        {COMPONENTS.map((c) => (
          <FlavorChip key={c} label={c} selected={components.includes(c)} onPress={() => setComponents(toggle(components, c))} />
        ))}
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={type.heading}>Aromatic</Text>
            <Text style={type.caption}>Cased or topped with added flavoring</Text>
          </View>
          <Switch
            value={aromatic}
            onValueChange={setAromatic}
            trackColor={{ true: colors.brassDim, false: colors.border }}
            thumbColor={aromatic ? colors.brass : colors.textMuted}
          />
        </View>
      </Card>

      <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline placeholder="Tin description, maker's notes…" />

      {mode === 'stock' ? (
        <Card>
          <SectionLabel>Purchase</SectionLabel>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Ounces" value={oz} onChangeText={setOz} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Price per oz ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </View>
          </View>
          <Field label="Bought from" value={vendor} onChangeText={setVendor} placeholder="e.g. Pipes and Cigars" />
        </Card>
      ) : null}
    </Screen>
  );
}
