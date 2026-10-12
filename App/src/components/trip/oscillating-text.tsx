import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  Easing,
  TextStyle,
  StyleProp,
} from 'react-native';

interface OscillatingTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
}

export function OscillatingText({ text, style }: OscillatingTextProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const translateX = useRef(new Animated.Value(0)).current;
  const loopAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Reset translation on text change
    translateX.setValue(0);
    if (loopAnimRef.current) {
      loopAnimRef.current.stop();
      loopAnimRef.current = null;
    }

    if (textWidth > containerWidth && containerWidth > 0) {
      const overflow = textWidth - containerWidth + 12;
      // Duration based on text length: ~35ms per pixel for comfortable reading speed
      const scrollDuration = Math.max(1800, Math.round(overflow * 40));

      const animation = Animated.loop(
        Animated.sequence([
          // Hold at origin so user can read beginning
          Animated.delay(1800),
          // Scroll left to reveal end
          Animated.timing(translateX, {
            toValue: -overflow,
            duration: scrollDuration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          // Hold at end
          Animated.delay(1800),
          // Scroll back right to origin
          Animated.timing(translateX, {
            toValue: 0,
            duration: scrollDuration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      loopAnimRef.current = animation;
      animation.start();

      return () => {
        animation.stop();
      };
    }
  }, [text, textWidth, containerWidth, translateX]);

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        setContainerWidth(e.nativeEvent.layout.width);
      }}>
      {/* Hidden text to measure natural unconstrained width */}
      <View style={styles.measureContainer} pointerEvents="none">
        <Animated.Text
          numberOfLines={1}
          style={[style, styles.noWrap]}
          onLayout={(e) => {
            setTextWidth(e.nativeEvent.layout.width);
          }}>
          {text}
        </Animated.Text>
      </View>

      {/* Visible moving text */}
      <Animated.Text
        numberOfLines={1}
        style={[
          style,
          styles.noWrap,
          {
            transform: [{ translateX }],
          },
        ]}>
        {text}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
    justifyContent: 'center',
  },
  measureContainer: {
    position: 'absolute',
    opacity: 0,
    left: -9999,
  },
  noWrap: {
    flexShrink: 0,
  },
});
