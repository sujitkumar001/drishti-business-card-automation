import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type { CardContact } from '../types';
import { recognizeAndParseBusinessCard } from '../services/parserService';
import { saveContact } from '../services/contactService';
import { loadSettings, sendGreeting } from '../services/whatsappService';

const EMPTY: CardContact = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  company: ''
};

export default function ScannerScreen() {
  const [contact, setContact] = useState<CardContact>(EMPTY);
  const [imageUri, setImageUri] = useState('');
  const [busy, setBusy] = useState(false);

  const preprocess = async (uri: string): Promise<string> => {
    // expo-image-manipulator does not expose a contrast adjustment primitive.
    // We perform deterministic resize + JPEG recompression here.
    const context = ImageManipulator.ImageManipulator.manipulate(uri);
    context.resize({ width: 1200, height: null });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG
    });
    return saved.uri;
  };

  const processAsset = async (uri: string) => {
    setBusy(true);
    try {
      const normalizedUri = await preprocess(uri);
      setImageUri(normalizedUri);

      const settings = await loadSettings();
      const parsed = await recognizeAndParseBusinessCard(
        normalizedUri,
        settings.defaultCountry as any
      );

      setContact({
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        phone: parsed.phone,
        email: parsed.email,
        company: parsed.company,
        rawText: parsed.rawText,
        imageUri: normalizedUri
      });
    } catch (error) {
      Alert.alert('Scan failed', error instanceof Error ? error.message : 'Unable to scan card.');
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Camera permission is required to scan a card.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false
    });

    if (!result.canceled && result.assets[0]?.uri) {
      await processAsset(result.assets[0].uri);
    }
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false
    });

    if (!result.canceled && result.assets[0]?.uri) {
      await processAsset(result.assets[0].uri);
    }
  };

  const update = (key: keyof CardContact, value: string) => {
    setContact((current) => ({ ...current, [key]: value }));
  };

  const saveAndSend = async () => {
    if (!contact.firstName.trim() && !contact.lastName.trim()) {
      Alert.alert('Check contact', 'Enter a contact name before saving.');
      return;
    }
    if (!contact.phone.trim()) {
      Alert.alert('Check contact', 'Enter a phone number before sending a WhatsApp greeting.');
      return;
    }

    setBusy(true);
    try {
      await saveContact(contact);
      await sendGreeting(contact);
      Alert.alert(
        'Contact saved',
        'The contact was saved. Complete the send in WhatsApp if Direct Link mode is selected.'
      );
    } catch (error) {
      Alert.alert('Save & Send failed', error instanceof Error ? error.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Business Card Scanner</Text>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && !busy && styles.secondaryButtonPressed,
            ]}
            onPress={capture}
            disabled={busy}
          >
            <MaterialIcons
              name="photo-camera"
              size={24}
              color="#25282D"
            />
            <Text style={styles.secondaryText}>Camera</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && !busy && styles.secondaryButtonPressed,
            ]}
            onPress={pick}
            disabled={busy}
          >
            <MaterialIcons
              name="photo-library"
              size={24}
              color="#25282D"
            />
            <Text style={styles.secondaryText}>Gallery</Text>
          </Pressable>
        </View>

        {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" /> : null}
        {busy ? <ActivityIndicator size="large" style={styles.loader} /> : null}

        <Field label="First Name" value={contact.firstName} onChangeText={(v) => update('firstName', v)} />
        <Field label="Last Name" value={contact.lastName} onChangeText={(v) => update('lastName', v)} />
        <Field label="Phone Number" value={contact.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
        <Field label="Email" value={contact.email} onChangeText={(v) => update('email', v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Company" value={contact.company} onChangeText={(v) => update('company', v)} />

        <Pressable style={styles.primaryButton} onPress={saveAndSend} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? 'Working...' : 'Save & Send'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...inputProps} style={styles.input} placeholderTextColor="#8A8F98" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '800', color: '#15171A', marginTop: 10 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    marginBottom: 16,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE1E7',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },

  secondaryButtonPressed: {
    opacity: 0.7,
  },

  secondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#25282D',
  },
  preview: { width: '100%', height: 210, backgroundColor: '#ECEFF3', borderRadius: 14, marginBottom: 16 },
  loader: { marginVertical: 10 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#4B5058', marginBottom: 7 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE1E7',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#15171A'
  },
  primaryButton: {
    marginTop: 10, backgroundColor: '#111827', borderRadius: 13,
    paddingVertical: 16, alignItems: 'center'
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }
});
