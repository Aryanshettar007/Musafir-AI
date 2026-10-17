import React from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, useColorScheme, View, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/constants/theme';

const ACCENT_BLUE = '#007AFF';

export default function AppTabs() {
  return (
    <Tabs style={styles.screenWrapper}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <AndroidTabList>
          <TabTrigger name="index" href="/(tabs)" asChild>
            <AndroidTabButton icon="home" iconOutline="home-outline">
              Home
            </AndroidTabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/(tabs)/explore" asChild>
            <AndroidTabButton icon="compass" iconOutline="compass-outline">
              Explore
            </AndroidTabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/(tabs)/profile" asChild>
            <AndroidTabButton icon="person" iconOutline="person-outline">
              Profile
            </AndroidTabButton>
          </TabTrigger>
        </AndroidTabList>
      </TabList>
    </Tabs>
  );
}

interface TabButtonProps extends TabTriggerSlotProps {
  children?: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
}

function AndroidTabButton({
  children,
  isFocused,
  icon,
  iconOutline,
  ...props
}: TabButtonProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const color = isFocused ? ACCENT_BLUE : colors.textSecondary;

  return (
    <Pressable
      {...props}
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onPress?.(e);
      }}
      android_ripple={{
        color: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        borderless: true,
        radius: 36,
      }}
      style={({ pressed }) => [
        styles.tabButton,
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={isFocused ? icon : iconOutline}
        size={22}
        color={color}
      />
      <Text
        style={[
          styles.tabLabel,
          {
            color,
            fontWeight: isFocused ? '600' : '500',
          },
        ]}>
        {children}
      </Text>
    </Pressable>
  );
}

function AndroidTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const bottomInset = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        {
          backgroundColor: colors.background,
          borderTopColor: isDark ? '#27272a' : '#e4e4e7',
          paddingBottom: bottomInset,
          height: 52 + bottomInset,
        },
      ]}>
      <View style={styles.innerContainer}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    height: '100%',
    position: 'relative',
  },
  slot: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    height: 52,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  pressed: {
    opacity: 0.75,
  },
});
