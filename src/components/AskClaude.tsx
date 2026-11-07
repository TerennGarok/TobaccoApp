// Two ways to have Claude identify a band from the verify screen:
//  • Free: hand the photo + a ready-made prompt to the Claude app (it can search
//    the web on your plan), then paste its answer back.
//  • Automatic: if an Anthropic API key is saved, one tap does the lookup.
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { CHAT_PROMPT, parseClaudeAnswer } from '../lib/claudePrompt';
import type { CigarCandidate } from '../lib/types';
import { getApiKey, lookupWithClaude } from '../services/claudeApi';
import { readBase64 } from '../services/photos';
import { colors, space, type } from '../theme';
import { Button, Card, Field, SectionLabel } from './ui';

export function AskClaude({
  imageUri,
  bandText,
  onResult,
}: {
  imageUri?: string;
  bandText?: string;
  onResult: (candidates: CigarCandidate[]) => void;
}) {
  const [hasKey, setHasKey] = useState(false);
  const [step, setStep] = useState<'idle' | 'sent'>('idle');
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getApiKey().then((k) => setHasKey(!!k));
  }, []);

  const prompt = bandText ? `${CHAT_PROMPT}\n\nWhat I can read on the band: ${bandText}` : CHAT_PROMPT;

  const send = async () => {
    setError(undefined);
    await Clipboard.setStringAsync(prompt);
    if (Platform.OS === 'web') {
      await Linking.openURL('https://claude.ai/new');
    } else if (imageUri && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(imageUri, { mimeType: 'image/jpeg', dialogTitle: 'Share the band photo with Claude' });
    } else {
      await Linking.openURL('https://claude.ai/new');
    }
    setStep('sent');
  };

  const accept = (text: string) => {
    try {
      const result = parseClaudeAnswer(text);
      setError(undefined);
      setShowManual(false);
      setManual('');
      setStep('idle');
      onResult(result.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShowManual(true);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) {
        setShowManual(true);
        setError('The clipboard is empty — copy Claude’s reply first, or paste it below.');
        return;
      }
      accept(text);
    } catch {
      setShowManual(true);
    }
  };

  const automatic = async () => {
    if (!imageUri) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await lookupWithClaude(await readBase64(imageUri));
      onResult(result.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionLabel>Ask Claude</SectionLabel>
      <Text style={[type.caption, { marginBottom: space.md }]}>
        Claude can read the band and look up every size, tasting notes and reviews.
      </Text>

      {hasKey && imageUri ? (
        <View style={{ marginBottom: space.md }}>
          <Button title={busy ? 'Claude is researching…' : 'Look up with Claude'} icon="sparkles" loading={busy} onPress={() => void automatic()} />
          {busy ? <Text style={[type.caption, { marginTop: space.sm }]}>This can take up to a minute while Claude searches the web.</Text> : null}
        </View>
      ) : null}

      {step === 'idle' ? (
        <Button
          title={hasKey ? 'Or use the Claude app (free)' : 'Ask the Claude app (free)'}
          icon="chatbubble-ellipses-outline"
          variant={hasKey ? 'ghost' : 'secondary'}
          onPress={() => void send()}
        />
      ) : (
        <View style={{ gap: space.sm }}>
          <Text style={[type.body, { fontSize: 15 }]}>
            1. {imageUri ? 'Pick Claude in the share sheet.' : 'Attach your band photo in Claude.'}
            {'\n'}2. Paste the prompt (it’s on your clipboard) and send.
            {'\n'}3. When Claude answers, tap Copy on its reply and come back.
          </Text>
          <Button title="Paste Claude’s answer" icon="clipboard-outline" onPress={() => void pasteFromClipboard()} />
          <Button title="Send again" variant="ghost" onPress={() => void send()} />
        </View>
      )}

      {showManual ? (
        <View style={{ marginTop: space.md }}>
          <Field label="Claude’s answer" value={manual} onChangeText={setManual} multiline placeholder="Paste the reply here" autoCapitalize="none" />
          <Button title="Use this answer" disabled={!manual.trim()} onPress={() => accept(manual)} />
        </View>
      ) : null}

      {error ? <Text style={[type.caption, { color: colors.danger, marginTop: space.sm }]}>{error}</Text> : null}
    </Card>
  );
}
