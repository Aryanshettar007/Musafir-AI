import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Card({ style, children, ...props }: ViewProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#09090b' : '#ffffff',
          borderColor: isDark ? '#27272a' : '#e4e4e7',
        },
        style,
      ]}
      {...props}>
      {children}
    </View>
  );
}

export function CardHeader({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.header, style]} {...props}>
      {children}
    </View>
  );
}

export function CardTitle({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <ThemedText type="subtitle" style={[styles.title, style]}>
      {children}
    </ThemedText>
  );
}

export function CardDescription({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <ThemedText themeColor="textSecondary" type="small" style={[styles.description, style]}>
      {children}
    </ThemedText>
  );
}

export function CardContent({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.content, style]} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.footer, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    gap: 20,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    gap: 6,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  content: {
    gap: 16,
  },
  footer: {
    gap: 12,
    alignItems: 'center',
  },
});
