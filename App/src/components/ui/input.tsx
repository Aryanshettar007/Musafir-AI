import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Pressable,
  Text,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  isPassword?: boolean;
}

export function Input({
  label,
  error,
  containerStyle,
  isPassword = false,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSecured = isPassword ? !showPassword : secureTextEntry;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <ThemedText type="small" style={styles.label}>
          {label}
        </ThemedText>
      )}

      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: isDark ? '#09090b' : '#ffffff',
            borderColor: error
              ? '#ef4444'
              : isFocused
              ? isDark
                ? '#fafafa'
                : '#09090b'
              : isDark
              ? '#27272a'
              : '#e4e4e7',
          },
        ]}>
        <TextInput
          placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
          style={[
            styles.input,
            {
              color: isDark ? '#fafafa' : '#09090b',
            },
            style,
          ]}
          secureTextEntry={isSecured}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          autoCapitalize="none"
          {...props}
        />

        {isPassword && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={8}
            style={styles.toggleButton}>
            <Text style={[styles.toggleText, { color: isDark ? '#a1a1aa' : '#71717a' }]}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <ThemedText type="small" style={styles.errorText}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    width: '100%',
  },
  label: {
    fontWeight: '500',
    fontSize: 14,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    paddingVertical: 0,
  },
  toggleButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
  },
});
