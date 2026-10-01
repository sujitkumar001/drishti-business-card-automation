import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import type { UserSettings } from '../types';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings
} from '../services/whatsappService';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => undefined);
  }, []);

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const persist = async () => {
    if (!settings.greetingTemplate.trim()) {
      Alert.alert('Invalid settings', 'Greeting template cannot be empty.');
      return;
    }

    if (
      settings.preferredMode === 'AUTOMATED_ENGINE' &&
      !/^https?:\/\/.+/i.test(settings.serverBaseUrl)
    ) {
      Alert.alert('Invalid server', 'Enter a valid http:// or https:// server URL.');
      return;
    }

    await saveSettings(settings);
    Alert.alert('Saved', 'Settings have been saved.');
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Greeting template</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        multiline
        value={settings.greetingTemplate}
        onChangeText={(v) => update('greetingTemplate', v)}
        placeholder="Hi {name}, it was great connecting with you today!"
      />
      <Text style={styles.help}>Use {'{name}'} where the scanned contact name should appear.</Text>

      <Text style={styles.label}>Digital business card URL</Text>
      <TextInput
        style={styles.input}
        value={settings.digitalCardUri}
        onChangeText={(v) => update('digitalCardUri', v)}
        autoCapitalize="none"
        placeholder="https://example.com/card.jpg"
      />
      <Text style={styles.help}>
        Automated mode requires an HTTP(S) URL reachable by the server. A phone-local file URI is not reachable by a separate server.
      </Text>

      <Text style={styles.label}>Default phone country</Text>
      <TextInput
        style={styles.input}
        value={settings.defaultCountry}
        onChangeText={(v) => update('defaultCountry', v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={2}
        placeholder="IN"
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Automated Engine</Text>
          <Text style={styles.help}>Off = Direct WhatsApp link</Text>
        </View>
        <Switch
          value={settings.preferredMode === 'AUTOMATED_ENGINE'}
          onValueChange={(enabled) =>
            update('preferredMode', enabled ? 'AUTOMATED_ENGINE' : 'DIRECT_LINK')
          }
        />
      </View>

      {settings.preferredMode === 'AUTOMATED_ENGINE' ? (
        <>
          <Text style={styles.label}>Server base URL</Text>
          <TextInput
            style={styles.input}
            value={settings.serverBaseUrl}
            onChangeText={(v) => update('serverBaseUrl', v)}
            autoCapitalize="none"
            placeholder="http://192.168.1.10:3000"
          />
        </>
      ) : null}

      <Pressable style={styles.button} onPress={persist}>
        <Text style={styles.buttonText}>Save Settings</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 50, backgroundColor: '#F6F7F9', flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 24, color: '#15171A' },
  label: { fontSize: 14, fontWeight: '700', color: '#3F444C', marginBottom: 7 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE1E7',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: '#15171A', marginBottom: 7
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  help: { fontSize: 12, color: '#747A84', marginBottom: 20, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  button: { backgroundColor: '#111827', borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }
});
