import React from 'react';
import { StyleSheet, View, Text, type ViewProps } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export interface AlertProps extends ViewProps {
  variant?: 'default' | 'destructive';
  title?: string;
  description?: string;
}

export function Alert({ variant = 'default', title, description, style, children, ...props }: AlertProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const isDestructive = variant === 'destructive';

  const backgroundColor = isDestructive
    ? isDark
      ? '#450a0a'
      : '#fef2f2'
    : isDark
    ? '#18181b'
    : '#f4f4f5';

  const borderColor = isDestructive
    ? isDark
      ? '#7f1d1d'
      : '#fecaca'
    : isDark
    ? '#27272a'
    : '#e4e4e7';

  const titleColor = isDestructive
    ? isDark
      ? '#fca5a5'
      : '#991b1b'
    : isDark
    ? '#fafafa'
    : '#09090b';

  const descriptionColor = isDestructive
    ? isDark
      ? '#f87171'
      : '#b91c1c'
    : isDark
    ? '#a1a1aa'
    : '#71717a';

  return (
    <View
      style={[
        styles.alert,
        {
          backgroundColor,
          borderColor,
        },
        style,
      ]}
      {...props}>
      {title ? (
        <Text style={[styles.title, { color: titleColor }]}>
          {title}
        </Text>
      ) : null}

      {description ? (
        <Text style={[styles.description, { color: descriptionColor }]}>
          {description}
        </Text>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
    width: '100%',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
});
