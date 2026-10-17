import React, { useRef } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Markdown, { RenderRules } from 'react-native-markdown-display';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth-context';
import PRIVACY_POLICY_MD from '@/constants/legal/privacy-policy.md';

function extractNodeText(node: any): string {
  if (!node) return '';
  if (typeof node.content === 'string' && node.content.length > 0) return node.content;
  if (Array.isArray(node.children)) {
    return node.children.map(extractNodeText).join('');
  }
  return '';
}

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<{ [key: string]: number }>({});

  const colors = {
    bg: isDark ? '#000000' : '#FFFFFF',
    textPrimary: isDark ? '#EDEDED' : '#1A1A1A',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    link: isDark ? '#60A5FA' : '#2563EB',
    divider: isDark ? '#27272A' : '#E5E7EB',
    codeBg: isDark ? '#18181B' : '#F3F4F6',
    closeBg: isDark ? '#1C1C1E' : '#F3F4F6',
  };

  const handleClose = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(user ? '/(tabs)' : '/(auth)/login');
    }
  };

  const handleLinkPress = (url: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (url.startsWith('mailto:') || url.startsWith('http://') || url.startsWith('https://')) {
      Linking.openURL(url);
      return false;
    }

    // Anchor link handling (TOC / section navigation)
    if (url.startsWith('#')) {
      const numMatch = url.match(/\d+/);
      const secKey = numMatch ? numMatch[0] : (url.toLowerCase().includes('toc') ? 'toc' : undefined);
      if (secKey && typeof sectionOffsets.current[secKey] === 'number') {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, sectionOffsets.current[secKey] - 16),
          animated: true,
        });
        return false;
      }
    }
    return true;
  };

  const rules: Partial<RenderRules> = {
    heading2: (node, children, parent, styles) => {
      const headingText = extractNodeText(node).trim();
      const numMatch = headingText.match(/^(\d+)\./);
      const secKey = numMatch ? numMatch[1] : (headingText.toLowerCase().includes('table of contents') ? 'toc' : undefined);

      return (
        <View
          key={node.key}
          onLayout={(e) => {
            if (secKey) {
              sectionOffsets.current[secKey] = e.nativeEvent.layout.y;
            }
          }}
          style={styles._VIEW_SAFE_heading2}>
          {children}
        </View>
      );
    },
  };

  const markdownStyles = {
    body: {
      color: colors.textPrimary,
      fontSize: 14.5,
      lineHeight: 23,
    },
    heading1: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
      marginTop: 8,
      marginBottom: 10,
    },
    heading2: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
      marginTop: 24,
      marginBottom: 8,
    },
    heading3: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600' as const,
      marginTop: 14,
      marginBottom: 6,
    },
    paragraph: {
      marginTop: 4,
      marginBottom: 10,
    },
    strong: {
      color: colors.textPrimary,
      fontWeight: '700' as const,
    },
    em: {
      fontStyle: 'italic' as const,
      color: colors.textSecondary,
    },
    link: {
      color: colors.link,
      textDecorationLine: 'underline' as const,
      fontWeight: '600' as const,
    },
    bullet_list: {
      marginTop: 4,
      marginBottom: 10,
    },
    ordered_list: {
      marginTop: 4,
      marginBottom: 10,
    },
    list_item: {
      marginVertical: 3,
    },
    bullet_list_icon: {
      color: colors.textSecondary,
      fontSize: 14,
      marginRight: 8,
    },
    ordered_list_icon: {
      color: colors.textSecondary,
      fontSize: 13,
      marginRight: 6,
    },
    hr: {
      backgroundColor: colors.divider,
      height: StyleSheet.hairlineWidth,
      marginVertical: 18,
    },
    code_inline: {
      backgroundColor: colors.codeBg,
      color: colors.textPrimary,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
      fontSize: 12.5,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Privacy Policy
        </Text>
        <Pressable
          onPress={handleClose}
          hitSlop={10}
          accessibilityLabel="Close"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: colors.closeBg },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Markdown Content */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Markdown rules={rules} style={markdownStyles} onLinkPress={handleLinkPress}>
          {PRIVACY_POLICY_MD}
        </Markdown>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  pressed: {
    opacity: 0.6,
  },
});
