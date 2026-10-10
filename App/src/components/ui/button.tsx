import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive';
export type ButtonSize = 'default' | 'sm' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  variant = 'default',
  size = 'default',
  isLoading = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const isDisabled = disabled || isLoading;

  // Background and border colors based on variant and color scheme
  let backgroundColor = 'transparent';
  let borderColor = 'transparent';
  let textColor = isDark ? '#fafafa' : '#09090b';

  switch (variant) {
    case 'default':
      backgroundColor = isDark ? '#fafafa' : '#18181b';
      textColor = isDark ? '#18181b' : '#fafafa';
      break;
    case 'secondary':
      backgroundColor = isDark ? '#27272a' : '#f4f4f5';
      textColor = isDark ? '#fafafa' : '#18181b';
      break;
    case 'outline':
      backgroundColor = 'transparent';
      borderColor = isDark ? '#27272a' : '#e4e4e7';
      textColor = isDark ? '#fafafa' : '#09090b';
      break;
    case 'ghost':
      backgroundColor = 'transparent';
      textColor = isDark ? '#fafafa' : '#09090b';
      break;
    case 'destructive':
      backgroundColor = '#ef4444';
      textColor = '#ffffff';
      break;
    case 'link':
      backgroundColor = 'transparent';
      textColor = '#3b82f6';
      break;
  }

  // Sizing
  let height = 44;
  let paddingHorizontal = 16;
  let fontSize = 14;

  if (size === 'sm') {
    height = 36;
    paddingHorizontal = 12;
    fontSize = 13;
  } else if (size === 'lg') {
    height = 50;
    paddingHorizontal = 24;
    fontSize = 16;
  }

  const renderContent = () => {
    const isTextLike =
      typeof children === 'string' ||
      typeof children === 'number' ||
      (Array.isArray(children) &&
        children.every(
          (c) => typeof c === 'string' || typeof c === 'number' || c === null || c === undefined
        ));

    if (isTextLike) {
      return (
        <Text
          style={[
            styles.text,
            {
              color: textColor,
              fontSize,
              textDecorationLine: variant === 'link' ? 'underline' : 'none',
            },
          ]}>
          {children}
        </Text>
      );
    }

    return children;
  };

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal,
          backgroundColor,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
      {...props}>
      {isLoading && <ActivityIndicator size="small" color={textColor} />}
      {renderContent()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
