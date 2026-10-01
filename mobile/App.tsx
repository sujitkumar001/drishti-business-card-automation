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

export default function App() {
  const [screen, setScreen] = useState<'scanner' | 'settings'>('scanner');
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1800);

    return () => clearTimeout(timer);
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
          edges={['top', 'left', 'right', 'bottom']}
        >
          <View style={styles.splashContent}>
            <Image
              source={require('./assets/drishti-icon.png')}
              style={styles.splashLogo}
              resizeMode="contain"
            />

            <Text style={styles.splashTitle}>Drishti</Text>

            <Text style={styles.splashTagline}>
              Smart Business Card Scanner
            </Text>
          </View>

          <View style={styles.splashFooter}>
            <Text style={styles.poweredBy}>Powered by</Text>
            <Text style={styles.spineverse}>SpineVerse</Text>
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView
          style={styles.root}
          edges={['top', 'left', 'right', 'bottom']}
        >
          <View style={styles.body}>
            {screen === 'scanner' ? <ScannerScreen /> : <SettingsScreen />}
          </View>

          <View style={styles.nav}>
            <Tab
              label="Scanner"
              active={screen === 'scanner'}
              onPress={() => setScreen('scanner')}
            />

            <Tab
              label="Settings"
              active={screen === 'settings'}
              onPress={() => setScreen('settings')}
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
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.active]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  body: {
    flex: 1,
  },

  nav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE1E7',
  },

  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#F6F7F9',
  },

  splashContent: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    paddingBottom: 28,
  },

  poweredBy: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
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

