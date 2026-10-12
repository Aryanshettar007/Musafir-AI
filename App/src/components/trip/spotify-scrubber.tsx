import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface SpotifyScrubberProps {
  currentTime: number; // in seconds
  duration: number; // in seconds
  onSeek: (seconds: number) => void;
  colors: {
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
    [key: string]: string;
  };
  isDark: boolean;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const TOUCH_TARGET_HEIGHT = 36;

export function SpotifyScrubber({
  currentTime,
  duration,
  onSeek,
  colors,
  isDark,
}: SpotifyScrubberProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragRatio, setDragRatio] = useState(0);

  const trackWidthRef = useRef(0);
  const trackPageXRef = useRef(0);
  const trackViewRef = useRef<View>(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const currentRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const activeRatio = isDragging ? dragRatio : currentRatio;
  const activeSeconds = activeRatio * (duration > 0 ? duration : 0);

  const thumbSize = isDragging ? 14 : 10;
  const thumbTop = (TOUCH_TARGET_HEIGHT - thumbSize) / 2;
  const thumbMarginLeft = -thumbSize / 2;

  const computeRatio = (pageX: number) => {
    if (trackWidthRef.current <= 0) return 0;
    const localX = pageX - trackPageXRef.current;
    return Math.min(1, Math.max(0, localX / trackWidthRef.current));
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim responder immediately to PREVENT parent ScrollView or sheet from stealing touch!
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        // Measure global layout for pixel-perfect drag tracking
        trackViewRef.current?.measure((_x, _y, width, _height, pageX) => {
          trackWidthRef.current = width;
          trackPageXRef.current = pageX;
          const ratio = Math.min(1, Math.max(0, (evt.nativeEvent.pageX - pageX) / (width || 1)));
          setDragRatio(ratio);
        });

        setIsDragging(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },

      onPanResponderMove: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
        const ratio = computeRatio(evt.nativeEvent.pageX);
        setDragRatio(ratio);
      },

      onPanResponderRelease: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
        const finalRatio = computeRatio(evt.nativeEvent.pageX);
        const finalSeconds = finalRatio * durationRef.current;
        setIsDragging(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSeek(finalSeconds);
      },

      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Generous touch target wrapper */}
      <View
        ref={trackViewRef}
        {...panResponder.panHandlers}
        style={styles.touchTarget}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setTrackWidth(w);
          trackWidthRef.current = w;
          trackViewRef.current?.measure((_x, _y, width, _height, pageX) => {
            trackWidthRef.current = width;
            trackPageXRef.current = pageX;
          });
        }}>
        {/* Unplayed Background Track */}
        <View
          style={[
            styles.trackBg,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
              height: isDragging ? 5 : 4,
            },
          ]}>
          {/* Played Portion (Spotify style solid fill) */}
          <View
            style={[
              styles.trackFill,
              {
                width: `${activeRatio * 100}%`,
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
              },
            ]}
          />
        </View>

        {/* Circular Scrub Thumb / Handle - Guaranteed vertically centered */}
        <View
          style={[
            styles.thumb,
            {
              left: `${activeRatio * 100}%`,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              top: thumbTop,
              marginLeft: thumbMarginLeft,
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
            },
          ]}
        />
      </View>

      {/* Timestamp labels */}
      <View style={styles.timeRow}>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
          {formatTime(activeSeconds)}
        </Text>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
          {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 6,
    marginBottom: 4,
  },
  touchTarget: {
    height: TOUCH_TARGET_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    paddingHorizontal: 1,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.1,
  },
});
