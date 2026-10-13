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

import { Colors, MaxContentWidth } from '@/constants/theme';

const ACCENT_BLUE = '#007AFF';

export default function AppTabs() {
  return (
    <Tabs style={styles.screenWrapper}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/(tabs)" asChild>
            <TabButton icon="home" iconOutline="home-outline">
              Home
            </TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/(tabs)/explore" asChild>
            <TabButton icon="compass" iconOutline="compass-outline">
              Explore
            </TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/(tabs)/profile" asChild>
            <TabButton icon="person" iconOutline="person-outline">
              Profile
            </TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

interface TabButtonProps extends TabTriggerSlotProps {
  children?: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
}

export function TabButton({
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

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        {
          backgroundColor: colors.background,
          borderTopColor: scheme === 'dark' ? '#27272a' : '#e4e4e7',
          boxShadow:
            scheme === 'dark'
              ? '0 -2px 10px rgba(0,0,0,0.5)'
              : '0 -2px 10px rgba(0,0,0,0.06)',
        },
      ]}>
      <View style={styles.innerContainer}>
        {props.children}
      </View>
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
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 64,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    maxWidth: MaxContentWidth,
    width: '100%',
    height: '100%',
    paddingHorizontal: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
    gap: 3,
    cursor: 'pointer',
  },
  tabLabel: {
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
