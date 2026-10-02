import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import ScannerScreen from './src/screens/ScannerScreen';
import SettingsScreen from './src/screens/SettingsScreen';

import {
  createInstallationAuthorizationHeaders,
  ensureInstallationRegistered,
} from './src/services/installationIdentityService';

import {
  loadSettings,
} from './src/services/whatsappService';

type Screen =
  | 'scanner'
  | 'settings';

function normalizeBaseUrl(
  value: string,
): string {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

/*
 * ------------------------------------------------------
 * SILENT INSTALLATION BOOTSTRAP
 * ------------------------------------------------------
 *
 * No login UI is required.
 *
 * On the first successful run:
 *
 *   1. Drishti generates a random installation ID.
 *   2. The backend generates a secret credential.
 *   3. SecureStore keeps the credential on the device.
 *   4. /api/installations/me verifies the credential.
 *
 * On later runs the same SecureStore credentials are
 * reused. A new installation must not be created.
 *
 * This bootstrap does NOT change WhatsApp ownership.
 * The existing development WhatsApp session remains
 * untouched until the controlled migration step.
 */

async function bootstrapInstallation():
  Promise<void> {
  const settings =
    await loadSettings();

  const baseUrl =
    normalizeBaseUrl(
      settings.serverBaseUrl,
    );

  if (!baseUrl) {
    throw new Error(
      'Drishti server URL is not configured.',
    );
  }

  await ensureInstallationRegistered(
    baseUrl,
  );

  const authHeaders =
    await createInstallationAuthorizationHeaders(
      baseUrl,
    );

  const response =
    await fetch(
      `${baseUrl}/api/installations/me`,
      {
        method: 'GET',
        headers: authHeaders,
      },
    );

  let body: {
    ok?: boolean;
    installationId?: string;
    error?: string;
  } = {};

  try {
    body =
      await response.json();
  } catch {
    throw new Error(
      `Drishti server returned an invalid installation verification response (${response.status}).`,
    );
  }

  if (
    !response.ok ||
    body.ok !== true
  ) {
    throw new Error(
      body.error ||
        `Unable to verify this Drishti installation (${response.status}).`,
    );
  }

  /*
   * Never log:
   * - installation token
   * - Authorization header
   * - SecureStore credential
   *
   * The installation ID itself is not a secret, but
   * there is no need to expose it in normal logs.
   */
  console.log(
    '[Drishti] Installation identity verified.',
  );
}

export default function App() {
  const [
    screen,
    setScreen,
  ] =
    useState<Screen>(
      'scanner',
    );

  const [
    showSplash,
    setShowSplash,
  ] =
    useState(true);

  useEffect(() => {
    let active = true;

    /*
     * Installation registration and the visual splash
     * timer run independently.
     *
     * A temporarily unavailable backend must not trap
     * the employee on the splash screen.
     */
    void bootstrapInstallation()
      .catch((error) => {
        console.warn(
          '[Drishti] Installation bootstrap unavailable:',
          error instanceof Error
            ? error.message
            : String(error),
        );
      });

    const timer =
      setTimeout(() => {
        if (active) {
          setShowSplash(
            false,
          );
        }
      }, 1800);

    return () => {
      active = false;

      clearTimeout(
        timer,
      );
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F6F7F9"
        translucent={false}
      />

      {showSplash ? (
        <SafeAreaView
          style={styles.splash}
          edges={[
            'top',
            'left',
            'right',
            'bottom',
          ]}
        >
          <View
            style={
              styles.splashContent
            }
          >
            <Image
              source={require('./assets/drishti-icon.png')}
              style={
                styles.splashLogo
              }
              resizeMode="contain"
            />

            <Text
              style={
                styles.splashTitle
              }
            >
              Drishti
            </Text>

            <Text
              style={
                styles.splashTagline
              }
            >
              Smart Business Card Scanner
            </Text>
          </View>

          <View
            style={
              styles.splashFooter
            }
          >
            <Text
              style={
                styles.poweredBy
              }
            >
              Powered by
            </Text>

            <Text
              style={
                styles.spineverse
              }
            >
              SpineVerse
            </Text>
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView
          style={styles.root}
          edges={[
            'top',
            'left',
            'right',
            'bottom',
          ]}
        >
          <View
            style={
              styles.body
            }
          >
            {screen ===
            'scanner' ? (
              <ScannerScreen />
            ) : (
              <SettingsScreen />
            )}
          </View>

          <View
            style={
              styles.nav
            }
          >
            <Tab
              label="Scanner"
              active={
                screen ===
                'scanner'
              }
              onPress={() =>
                setScreen(
                  'scanner',
                )
              }
            />

            <Tab
              label="Settings"
              active={
                screen ===
                'settings'
              }
              onPress={() =>
                setScreen(
                  'settings',
                )
              }
            />
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabText,
          active &&
            styles.active,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor:
        '#F6F7F9',
    },

    body: {
      flex: 1,
    },

    nav: {
      flexDirection: 'row',
      backgroundColor:
        '#FFFFFF',
      borderTopWidth:
        StyleSheet.hairlineWidth,
      borderTopColor:
        '#DDE1E7',
    },

    tab: {
      flex: 1,
      paddingVertical: 15,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    tabText: {
      color: '#777D86',
      fontWeight: '700',
    },

    active: {
      color: '#111827',
    },

    splash: {
      flex: 1,
      backgroundColor:
        '#F6F7F9',
    },

    splashContent: {
      ...StyleSheet.absoluteFill,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 32,
    },

    splashLogo: {
      width: 150,
      height: 150,
      marginBottom: 24,
    },

    splashTitle: {
      fontSize: 38,
      lineHeight: 46,
      fontWeight: '800',
      color: '#111827',
      letterSpacing: 0.3,
    },

    splashTagline: {
      marginTop: 8,
      fontSize: 16,
      color: '#6B7280',
      textAlign: 'center',
    },

    splashFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems:
        'center',
      paddingBottom: 28,
    },

    poweredBy: {
      fontSize: 12,
      color: '#9CA3AF',
      textTransform:
        'uppercase',
      letterSpacing: 1.2,
    },

    spineverse: {
      marginTop: 4,
      fontSize: 17,
      fontWeight: '700',
      color: '#374151',
      letterSpacing: 0.4,
    },
  });