import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Platform, Text, View } from 'react-native';
import { Button, Card, Screen } from '../components/ui';
import { getQueueItem } from '../db';
import { identifier } from '../services/identify';
import { isOnline, onQueueChange, submitPhoto } from '../services/queue';
import { colors, radius, space, type } from '../theme';

type Phase = 'choose' | 'searching' | 'queued';

export default function Capture() {
  const [phase, setPhase] = useState<Phase>('choose');
  const [preview, setPreview] = useState<string>();
  const [queueId, setQueueId] = useState<number>();

  // Once the queued photo is identified, jump straight to verification.
  useEffect(() => {
    if (queueId == null) return;
    const check = async () => {
      const item = await getQueueItem(queueId);
      if (item?.status === 'ready') router.replace(`/review/verify?queueId=${queueId}`);
      else if (item?.status === 'failed') {
        setPhase('queued');
      }
    };
    void check();
    return onQueueChange(() => void check());
  }, [queueId]);

  const pick = async (source: 'camera' | 'library') => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true };
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Enable camera access in Settings to photograph cigar bands.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setPreview(uri);
    const online = !identifier.needsNetwork || (await isOnline());
    setPhase(online ? 'searching' : 'queued');
    setQueueId(await submitPhoto(uri));
  };

  return (
    <Screen>
      <Text style={type.title}>Photograph the band</Text>
      <Text style={[type.caption, { marginTop: space.sm, marginBottom: space.xl }]}>
        Fill the frame with the band and any secondary band or foot band. Good light helps. You will confirm the brand,
        line and size before anything is saved.
      </Text>

      {preview ? (
        <Image source={{ uri: preview }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.lg, marginBottom: space.lg }} />
      ) : (
        <View
          style={{
            width: '100%',
            aspectRatio: 1.4,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
            marginBottom: space.lg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={type.caption}>No photo yet</Text>
        </View>
      )}

      {phase === 'choose' ? (
        <View style={{ gap: space.sm }}>
          <Button title="Type it in instead" icon="create-outline" variant="ghost" onPress={() => router.replace('/review/verify')} />
          {Platform.OS !== 'web' ? <Button title="Take photo" icon="camera" onPress={() => void pick('camera')} /> : null}
          <Button
            title="Choose from library"
            icon="images"
            variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
            onPress={() => void pick('library')}
          />
        </View>
      ) : phase === 'searching' ? (
        <Card>
          <Text style={type.heading}>Searching…</Text>
          <Text style={[type.caption, { marginTop: space.sm }]}>
            Reading the band and looking up sizes, tasting notes and reviews.
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={type.heading}>Saved to your queue</Text>
          <Text style={[type.caption, { marginTop: space.sm }]}>
            No connection right now. The photo is safe on your phone and will be identified automatically when you are
            back online — you will find it at the top of your Journal, ready to verify.
          </Text>
          <View style={{ marginTop: space.lg }}>
            <Button title="Done" onPress={() => router.back()} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
