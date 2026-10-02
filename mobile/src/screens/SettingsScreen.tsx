import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type {
  UserSettings,
  WhatsAppConnectionStatus,
} from '../types';

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from '../services/whatsappService';

import {
  beginWhatsAppConnection,
  disconnectWhatsAppConnection,
  getWhatsAppConnectionState,
} from '../services/whatsappConnectionService';

function statusPresentation(status: WhatsAppConnectionStatus) {
  switch (status) {
    case 'CONNECTED':
      return {
        label: 'Connected',
        icon: 'check-circle' as const,
        color: '#15803D',
        background: '#ECFDF3',
      };

    case 'PENDING_VERIFICATION':
      return {
        label: 'Verification required',
        icon: 'schedule' as const,
        color: '#B45309',
        background: '#FFF7ED',
      };

    case 'CONNECTING':
      return {
        label: 'Connecting',
        icon: 'sync' as const,
        color: '#1D4ED8',
        background: '#EFF6FF',
      };

    case 'ERROR':
      return {
        label: 'Connection problem',
        icon: 'error-outline' as const,
        color: '#B91C1C',
        background: '#FEF2F2',
      };

    default:
      return {
        label: 'Not connected',
        icon: 'radio-button-unchecked' as const,
        color: '#6B7280',
        background: '#F3F4F6',
      };
  }
}

export default function SettingsScreen() {
  const [settings, setSettings] =
    useState<UserSettings>(DEFAULT_SETTINGS);

  const [connectionBusy, setConnectionBusy] =
    useState(false);

  const [pairingCode, setPairingCode] =
    useState<string | null>(null);

  const pollingRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const stopConnectionPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    let active = true;

    const initializeSettings = async () => {
      try {
        const storedSettings =
          await loadSettings();

        if (!active) {
          return;
        }

        setSettings(storedSettings);

        try {
          const serverState =
            await getWhatsAppConnectionState(
              storedSettings.serverBaseUrl,
            );

          if (!active) {
            return;
          }

          const synchronizedSettings = {
            ...storedSettings,
            whatsappConnection:
              serverState.connection,
          };

          setSettings(synchronizedSettings);

          await saveSettings(
            synchronizedSettings,
          );
        } catch (error) {
          console.warn(
            '[Drishti] Unable to synchronize WhatsApp connection:',
            error,
          );
        }
      } catch (error) {
        console.warn(
          '[Drishti] Unable to load settings:',
          error,
        );
      }
    };

    void initializeSettings();

    return () => {
      active = false;
      stopConnectionPolling();
    };
  }, []);

  const update = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const automationEnabled =
    settings.preferredMode === 'AUTOMATED_ENGINE';

  const connection = settings.whatsappConnection;
  const status = statusPresentation(connection.status);


  const toggleAutomation = (enabled: boolean) => {
    update(
      'preferredMode',
      enabled ? 'AUTOMATED_ENGINE' : 'DIRECT_LINK',
    );
  };

  const updateSenderNumber = (phoneNumber: string) => {
    stopConnectionPolling();
    setPairingCode(null);

    update('whatsappConnection', {
      ...connection,
      phoneNumber,
      connectionId: '',
      status: 'DISCONNECTED',
      displayName: undefined,
      verifiedAt: undefined,
      errorMessage: undefined,
    });
  };

  const connectWhatsApp = async () => {
    const phone = connection.phoneNumber.trim();

    if (!phone) {
      Alert.alert(
        'Enter WhatsApp number',
        'Enter the WhatsApp number you want to connect first.',
      );
      return;
    }

    if (connectionBusy) {
      return;
    }

    stopConnectionPolling();
    setPairingCode(null);
    setConnectionBusy(true);

    update('whatsappConnection', {
      ...connection,
      status: 'CONNECTING',
      errorMessage: undefined,
    });

    try {
      const startedConnection =
        await beginWhatsAppConnection(
          settings.serverBaseUrl,
          phone,
        );

      update(
        'whatsappConnection',
        startedConnection,
      );

      await saveSettings({
        ...settings,
        whatsappConnection:
          startedConnection,
      });

      pollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const state =
              await getWhatsAppConnectionState(
                settings.serverBaseUrl,
              );

            update(
              'whatsappConnection',
              state.connection,
            );

            if (state.session.pairingCode) {
              setPairingCode(
                state.session.pairingCode,
              );
            }

            if (
              state.connection.status === 'CONNECTED'
            ) {
              stopConnectionPolling();
              setPairingCode(null);

              await saveSettings({
                ...settings,
                whatsappConnection:
                  state.connection,
              });
            } else if (
              state.connection.status === 'ERROR' ||
              state.connection.status ===
                'DISCONNECTED'
            ) {
              stopConnectionPolling();

              if (
                state.connection.status ===
                'DISCONNECTED'
              ) {
                setPairingCode(null);
              }
            }
          } catch (error) {
            console.warn(
              '[Drishti] WhatsApp status polling failed:',
              error,
            );
          }
        })();
      }, 2500);
    } catch (error) {
      stopConnectionPolling();

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect WhatsApp.';

      update('whatsappConnection', {
        ...connection,
        status: 'ERROR',
        errorMessage: message,
      });

      Alert.alert(
        'Connection failed',
        message,
      );
    } finally {
      setConnectionBusy(false);
    }
  };
  const performDisconnect = async () => {
    if (connectionBusy) {
      return;
    }

    stopConnectionPolling();
    setPairingCode(null);
    setConnectionBusy(true);

    try {
      const serverConnection =
        await disconnectWhatsAppConnection(
          settings.serverBaseUrl,
        );

      update(
        'whatsappConnection',
        serverConnection,
      );

      await saveSettings({
        ...settings,
        whatsappConnection: serverConnection,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to disconnect WhatsApp.';

      update('whatsappConnection', {
        ...connection,
        status: 'ERROR',
        errorMessage: message,
      });

      Alert.alert(
        'Disconnect failed',
        message,
      );
    } finally {
      setConnectionBusy(false);
    }
  };

  const disconnectWhatsApp = () => {
    Alert.alert(
      'Disconnect WhatsApp?',
      'Automated greetings will stop using this WhatsApp connection.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void performDisconnect();
          },
        },
      ],
    );
  };

  const persist = async () => {
    if (!settings.greetingTemplate.trim()) {
      Alert.alert(
        'Invalid settings',
        'Greeting message cannot be empty.',
      );
      return;
    }

    await saveSettings(settings);

    Alert.alert(
      'Settings saved',
      automationEnabled
        ? 'Your Drishti automation preferences have been saved.'
        : 'Direct WhatsApp mode is ready.',
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialIcons
            name="settings"
            size={24}
            color="#111827"
          />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Personalize Drishti and WhatsApp greetings
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        Greeting
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>
          Greeting message
        </Text>

        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={settings.greetingTemplate}
          onChangeText={(value) =>
            update('greetingTemplate', value)
          }
          placeholder={"Hi {name}, it was great connecting with you today!\n\nRegards,\n{sender}"}
          placeholderTextColor="#9CA3AF"
        />

        <View style={styles.infoRow}>
          <MaterialIcons
            name="info-outline"
            size={17}
            color="#6B7280"
          />

          <Text style={styles.helpInline}>
            Use {'{name}'} for the scanned contact and {'{sender}'}
            for your greeting signature.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        Greeting signature
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>
          From / signature
        </Text>

        <TextInput
          style={styles.input}
          value={settings.greetingSignature}
          onChangeText={(value) =>
            update('greetingSignature', value)
          }
          placeholder="Spineverse Private Limited"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.help}>
          Use {'{sender}'} in the greeting message to insert this signature.
          This changes only the greeting text, not the connected WhatsApp account.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Digital Business Card
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>
          Card URL
        </Text>

        <TextInput
          style={styles.input}
          value={settings.digitalCardUri}
          onChangeText={(value) =>
            update('digitalCardUri', value)
          }
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://example.com/my-card"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.help}>
          Optional. Add a secure web URL for your
          digital business card.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Phone & Region
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>
          Default phone country
        </Text>

        <TextInput
          style={styles.countryInput}
          value={settings.defaultCountry}
          onChangeText={(value) =>
            update(
              'defaultCountry',
              value.toUpperCase(),
            )
          }
          autoCapitalize="characters"
          maxLength={2}
          placeholder="IN"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.help}>
          Used when a scanned phone number does not
          include an international country code.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        WhatsApp Automation
      </Text>

      <View style={styles.automationCard}>
        <View style={styles.automationHeader}>
          <View style={styles.automationIcon}>
            <MaterialIcons
              name="bolt"
              size={24}
              color="#111827"
            />
          </View>

          <View style={styles.automationHeaderText}>
            <Text style={styles.automationTitle}>
              Automated greetings
            </Text>

            <Text style={styles.automationDescription}>
              {automationEnabled
                ? 'Send the greeting automatically without opening WhatsApp.'
                : 'Off opens WhatsApp on this phone with your prefilled greeting.'}
            </Text>
          </View>

          <Switch
            value={automationEnabled}
            onValueChange={toggleAutomation}
          />
        </View>

        {automationEnabled ? (
          <View style={styles.connectionArea}>
            <Text style={styles.senderSectionLabel}>
              My WhatsApp
            </Text>

            <Text style={styles.senderSectionHelp}>
              Automated greetings are sent from your connected WhatsApp account.
            </Text>

              <View style={styles.personalConnectionArea}>
                <View
                  style={[
                    styles.statusBadge,
                {
                  backgroundColor:
                    status.background,
                },
              ]}
            >
              <MaterialIcons
                name={status.icon}
                size={17}
                color={status.color}
              />

              <Text
                style={[
                  styles.statusText,
                  { color: status.color },
                ]}
              >
                {status.label}
              </Text>
            </View>

            <Text style={styles.label}>
              WhatsApp sender number
            </Text>

            <View style={styles.phoneInputContainer}>
              <MaterialIcons
                name="phone"
                size={21}
                color="#6B7280"
              />

              <TextInput
                style={styles.phoneInput}
                value={connection.phoneNumber}
                onChangeText={updateSenderNumber}
                keyboardType="phone-pad"
                editable={!connectionBusy}
                placeholder="+91 98765 43210"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <Text style={styles.help}>
              This number must be verified before
              Drishti can send automated greetings
              from it.
            </Text>

            {pairingCode ? (
              <View style={styles.pairingCard}>
                <View style={styles.pairingHeader}>
                  <MaterialIcons
                    name="phonelink-lock"
                    size={22}
                    color="#1D4ED8"
                  />

                  <Text style={styles.pairingTitle}>
                    WhatsApp Pairing Code
                  </Text>
                </View>

                <Text style={styles.pairingCode}>
                  {pairingCode}
                </Text>

                <Text style={styles.pairingInstructions}>
                  Open WhatsApp {'>'} Linked devices {'>'} Link a
                  device {'>'} Link with phone number, then enter
                  this code.
                </Text>

                <Text style={styles.pairingWaiting}>
                  Waiting for WhatsApp verification...
                </Text>
              </View>
            ) : null}

            {connection.status === 'CONNECTED' ? (
              <>
                <View style={styles.connectedDetails}>
                  <MaterialIcons
                    name="verified"
                    size={20}
                    color="#15803D"
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectedLabel}>
                      Connected WhatsApp
                    </Text>

                    <Text style={styles.connectedNumber}>
                      {connection.phoneNumber}
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={styles.disconnectButton}
                  onPress={disconnectWhatsApp}
                >
                  <Text style={styles.disconnectText}>
                    Disconnect WhatsApp
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[
                  styles.connectButton,
                  connectionBusy && {
                    opacity: 0.6,
                  },
                ]}
                onPress={connectWhatsApp}
                disabled={connectionBusy}
              >
                <MaterialIcons
                  name="link"
                  size={20}
                  color="#FFFFFF"
                />

                <Text style={styles.connectButtonText}>
                  {connectionBusy
                    ? 'Connecting...'
                    : 'Connect WhatsApp'}
                </Text>
              </Pressable>
            )}

                {connection.errorMessage ? (
                  <Text style={styles.errorText}>
                    {connection.errorMessage}
                  </Text>
                ) : null}
              </View>
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.saveButton}
        onPress={persist}
      >
        <MaterialIcons
          name="check"
          size={21}
          color="#FFFFFF"
        />

        <Text style={styles.saveButtonText}>
          Save Settings
        </Text>
      </Pressable>

      <Text style={styles.footerText}>
        Drishti by SpineVerse
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 42,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#111827',
  },

  subtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
  },

  sectionTitle: {
    marginLeft: 2,
    marginBottom: 9,
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 22,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },

  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },

  countryInput: {
    width: 100,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },

  help: {
    marginTop: 9,
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
  },

  infoRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  helpInline: {
    flex: 1,
    marginLeft: 7,
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
  },

  automationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 24,
  },

  automationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  automationIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  automationHeaderText: {
    flex: 1,
    paddingRight: 8,
  },

  automationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  automationDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
  },

  senderSectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  senderSectionHelp: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
  },

  senderOption: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  senderOptionSelected: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },

  senderOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },

  senderOptionIconSelected: {
    backgroundColor: '#15803D',
  },

  senderOptionContent: {
    flex: 1,
    paddingHorizontal: 12,
  },

  senderOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  senderOptionSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#6B7280',
  },

  companySenderInfo: {
    marginTop: 6,
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#F0FDF4',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  companySenderText: {
    flex: 1,
    marginLeft: 10,
  },

  companySenderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },

  companySenderDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#166534',
  },

  personalConnectionArea: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },

  connectionArea: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F3',
  },

  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },

  statusText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
  },

  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 13,
  },

  phoneInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 13,
    fontSize: 16,
    color: '#111827',
  },

  pairingCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
  },

  pairingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  pairingTitle: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
  },

  pairingCode: {
    marginTop: 16,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 4,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },

  pairingInstructions: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
  },

  pairingWaiting: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  connectButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  connectButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  connectedDetails: {
    marginTop: 16,
    padding: 13,
    borderRadius: 12,
    backgroundColor: '#ECFDF3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  connectedLabel: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
  },

  connectedNumber: {
    marginTop: 2,
    fontSize: 15,
    color: '#14532D',
    fontWeight: '800',
  },

  disconnectButton: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  disconnectText: {
    color: '#B91C1C',
    fontWeight: '800',
  },

  errorText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: '#B91C1C',
  },

  saveButton: {
    minHeight: 56,
    borderRadius: 15,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  footerText: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
  },
});
