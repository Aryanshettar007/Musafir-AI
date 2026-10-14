import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { darkMapStyle } from '@/constants/map-theme';
import { Trip, TripItem } from '@/services/trip-service';
import { formatDist, formatDuration } from './trip-utils';
import { TripSimulator } from './trip-simulator';

export interface LiveTranscriptData {
  question?: string;
  answerText: string;
}

export interface TripMapProps {
  mapRef: React.RefObject<MapView | null>;
  trip: Trip;
  traveledCoords: { latitude: number; longitude: number }[];
  remainingCoords: { latitude: number; longitude: number }[];
  userLocation: { latitude: number; longitude: number } | null;
  sheetHeight: Animated.Value;
  colors: {
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    accent: string;
    traveledRoute: string;
    green: string;
    orange: string;
    [key: string]: string;
  };
  isDark: boolean;
  onBack?: () => void;
  onRecenter: () => void;
  isSimulating?: boolean;
  onToggleSimulate?: () => void;
  items: TripItem[];
  playingItem?: TripItem | null;
  isPlaying: boolean;
  isPaused?: boolean;
  played?: Record<string, boolean>;
  playingItemTitle?: string;
  onSimLocationUpdate?: (loc: { latitude: number; longitude: number }) => void;
  onResetToGPS?: () => void;
  polylineCoords: { latitude: number; longitude: number }[];
  audioMultiplier?: number;
  onAudioMultiplierChange?: (mult: number) => void;
  liveTranscript?: LiveTranscriptData | null;
  isLivePlaying?: boolean;
  onDismissLiveTranscript?: () => void;
}

export function TripMap({
  mapRef,
  trip,
  traveledCoords,
  remainingCoords,
  userLocation,
  sheetHeight,
  colors,
  isDark,
  onBack,
  onRecenter,
  isSimulating = false,
  onToggleSimulate,
  items,
  playingItem,
  isPlaying,
  isPaused = false,
  played = {},
  playingItemTitle,
  onSimLocationUpdate,
  onResetToGPS,
  polylineCoords,
  audioMultiplier = 1,
  onAudioMultiplierChange,
  liveTranscript,
  isLivePlaying,
  onDismissLiveTranscript,
}: TripMapProps) {
  const [selectedPlace, setSelectedPlace] = React.useState<TripItem | null>(null);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        customMapStyle={isDark ? darkMapStyle : []}
        zoomControlEnabled={true}
        zoomEnabled={true}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        onPress={() => setSelectedPlace(null)}>
        {/* TRAVELED (PREVIOUS) ROUTE PATH - GREYED OUT */}
        {traveledCoords.length > 1 && (
          <Polyline
            coordinates={traveledCoords}
            strokeColor={colors.traveledRoute}
            strokeWidth={5}
            zIndex={1}
          />
        )}

        {/* UPCOMING (REMAINING) ROUTE PATH - BLUE */}
        {remainingCoords.length > 1 && (
          <Polyline
            coordinates={remainingCoords}
            strokeColor="#007AFF"
            strokeWidth={5}
            zIndex={2}
          />
        )}

        {/* Origin Marker */}
        {trip.origin.lat != null && trip.origin.lng != null && (
          <Marker
            coordinate={{ latitude: trip.origin.lat!, longitude: trip.origin.lng! }}
            title={trip.origin.label}
            pinColor="#007AFF"
          />
        )}

        {/* Destination Marker */}
        {trip.destination.lat != null && trip.destination.lng != null && (
          <Marker
            coordinate={{ latitude: trip.destination.lat!, longitude: trip.destination.lng! }}
            title={trip.destination.label}
            pinColor="#EA4335"
          />
        )}

        {/* STORY MARKERS ON MAP */}
        {items.map((item) => {
          if (!item.trigger?.lat || !item.trigger?.lng) return null;
          const isPlayingThis = playingItem?.id === item.id && isPlaying && !isPaused;
          const isPausedThis = playingItem?.id === item.id && isPaused;
          const isActiveThis = playingItem?.id === item.id;
          const isPlayedThis = played[item.id];
          const isSponsored = item.type === 'sponsored';

          let iconName: keyof typeof Ionicons.glyphMap = 'headset';
          if (isPlayingThis) {
            iconName = 'pause';
          } else if (isPausedThis) {
            iconName = 'play';
          } else if (isSponsored) {
            iconName = 'megaphone';
          } else if (item.type === 'food') {
            iconName = 'restaurant';
          } else if (item.type === 'town-welcome') {
            iconName = 'flag';
          } else if (item.type === 'trip-intro') {
            iconName = 'sparkles';
          } else if (isPlayedThis) {
            iconName = 'checkmark';
          }

          const badgeBg = isActiveThis
            ? (isSponsored ? '#FF9500' : '#007AFF')
            : isSponsored
            ? '#FF9500'
            : isPlayedThis
            ? (isDark ? '#2C2C2E' : '#E5E5EA')
            : (isDark ? '#1C1C1E' : '#FFFFFF');

          const iconColor = isActiveThis
            ? '#FFFFFF'
            : isSponsored
            ? '#FFFFFF'
            : isPlayedThis
            ? (isDark ? '#8E8E93' : '#6C6C70')
            : (isDark ? '#FFFFFF' : '#007AFF');

          const borderColor = isActiveThis
            ? '#FFFFFF'
            : isSponsored
            ? '#FF9500'
            : isPlayedThis
            ? (isDark ? '#3A3A3C' : '#D1D1D6')
            : '#007AFF';

            return (
              <Marker
                key={item.id}
                coordinate={{ latitude: item.trigger.lat, longitude: item.trigger.lng }}
                title={item.title}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  setSelectedPlace(item);
                }}
                zIndex={isActiveThis ? 45 : 20}
                tracksViewChanges={false}>
                <View style={[styles.storyMarkerWrapper, isActiveThis && styles.storyMarkerActiveWrapper]}>
                  {isActiveThis && (
                    <View
                      style={[
                        styles.storyMarkerPulse,
                        { borderColor: isSponsored ? '#FF9500' : '#007AFF' },
                      ]}
                    />
                  )}
                  <View style={[styles.storyMarkerBadge, { backgroundColor: badgeBg, borderColor }]}>
                    <Ionicons name={iconName} size={15} color={iconColor} />
                  </View>
                </View>
              </Marker>
            );
          })}

        {/* CURRENT USER LOCATION INDICATOR */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            title="Current Location"
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={50}>
            <View style={styles.userLocationHalo}>
              <View style={styles.userLocationDot} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Destination header pill & live transcript overlay */}
      <SafeAreaView edges={['top']} style={styles.topContainer} pointerEvents="box-none">
        <View style={styles.topBarRow} pointerEvents="box-none">
          {onBack && (
            <Pressable
              style={({ pressed }) => [
                styles.topBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: isDark ? 1 : 0,
                  opacity: pressed ? 0.75 : 1,
                  cursor: Platform.OS === 'web' ? 'pointer' : undefined,
                } as any,
              ]}
              onPress={onBack}
              accessibilityLabel="Exit trip session"
              accessibilityRole="button">
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </Pressable>
          )}
          <View
            style={[
              styles.tripHeaderPill,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: isDark ? 1 : 0,
              },
            ]}>
            <Text style={[styles.tripHeaderDest, { color: colors.text }]} numberOfLines={1}>
              {trip.destination.label}
            </Text>
            {trip.route && (
              <Text style={[styles.tripHeaderMeta, { color: colors.textSecondary }]}>
                {formatDist(trip.route.distanceM)} · {formatDuration(trip.route.durationS)}
              </Text>
            )}
          </View>
          {/* Temporary developer simulation flash button - commented out
          <Pressable
            style={[
              styles.topBtn,
              {
                backgroundColor: isSimulating ? colors.accent : colors.surface,
                borderColor: colors.border,
                borderWidth: isDark ? 1 : 0,
              },
            ]}
            onPress={onToggleSimulate}>
            <Ionicons
              name={isSimulating ? 'flash' : 'flash-outline'}
              size={18}
              color={isSimulating ? '#FFF' : colors.text}
            />
          </Pressable>
          */}
        </View>

        {/* Live Mode Spoken Answer Transcript Overlay */}
        {liveTranscript && (
          <LiveTranscriptOverlay
            transcript={liveTranscript}
            isLivePlaying={isLivePlaying}
            colors={colors}
            isDark={isDark}
            onDismiss={onDismissLiveTranscript}
          />
        )}
      </SafeAreaView>

      {/* Simulation controller card - commented out
      <TripSimulator
        isActive={isSimulating}
        onToggleActive={onToggleSimulate}
        polylineCoords={polylineCoords}
        items={items}
        isPlaying={isPlaying}
        playingItemTitle={playingItemTitle}
        onLocationUpdate={onSimLocationUpdate}
        onResetToGPS={onResetToGPS}
        mapRef={mapRef}
        colors={colors as any}
        isDark={isDark}
        audioMultiplier={audioMultiplier}
        onAudioMultiplierChange={onAudioMultiplierChange}
      />
      */}

      {/* FLOATING SPOT NAME CALLOUT BANNER (Only shows spot name) */}
      {selectedPlace && (
        <Animated.View
          style={[
            styles.floatingPlaceBanner,
            {
              bottom: Animated.add(sheetHeight, 14),
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <View style={styles.floatingPlaceContent}>
            <View style={[styles.floatingPlaceIconBadge, { backgroundColor: colors.surface2 }]}>
              <Ionicons
                name={
                  selectedPlace.type === 'food'
                    ? 'restaurant'
                    : selectedPlace.type === 'sponsored'
                    ? 'megaphone'
                    : selectedPlace.type === 'town-welcome'
                    ? 'flag'
                    : 'location'
                }
                size={14}
                color={selectedPlace.type === 'sponsored' ? colors.orange : colors.accent}
              />
            </View>

            <Text style={[styles.floatingPlaceTitle, { color: colors.text }]} numberOfLines={1}>
              {selectedPlace.title}
            </Text>

            {/* Dismiss X */}
            <Pressable
              style={styles.floatingCloseBtn}
              onPress={() => setSelectedPlace(null)}
              hitSlop={10}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* RE-CENTER MAP BUTTON */}
      <Animated.View
        style={[
          styles.recenterButtonWrapper,
          { bottom: Animated.add(sheetHeight, 14) },
        ]}>
        <Pressable
          style={({ pressed }) => [
            styles.recenterButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: isDark ? 1 : 0,
            },
            pressed && { opacity: 0.8 },
          ]}
          onPress={onRecenter}>
          <Ionicons name="locate" size={20} color={colors.accent} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function LiveTranscriptOverlay({
  transcript,
  isLivePlaying,
  colors,
  isDark,
  onDismiss,
}: {
  transcript: LiveTranscriptData;
  isLivePlaying?: boolean;
  colors: any;
  isDark: boolean;
  onDismiss?: () => void;
}) {
  const slideAnim = React.useRef(new Animated.Value(-12)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  // Sound equalizer animation while playing
  const eq1 = React.useRef(new Animated.Value(0.3)).current;
  const eq2 = React.useRef(new Animated.Value(0.8)).current;
  const eq3 = React.useRef(new Animated.Value(0.5)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  React.useEffect(() => {
    if (!isLivePlaying) return;
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(eq1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(eq1, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(eq2, { toValue: 0.2, duration: 240, useNativeDriver: true }),
        Animated.timing(eq2, { toValue: 1, duration: 240, useNativeDriver: true }),
      ])
    );
    const loop3 = Animated.loop(
      Animated.sequence([
        Animated.timing(eq3, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(eq3, { toValue: 0.3, duration: 360, useNativeDriver: true }),
      ])
    );
    loop1.start();
    loop2.start();
    loop3.start();

    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
    };
  }, [isLivePlaying, eq1, eq2, eq3]);

  return (
    <Animated.View
      style={[
        styles.transcriptCard,
        {
          backgroundColor: isDark ? 'rgba(24, 24, 27, 0.96)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)',
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}>
      {/* Header bar of transcript card */}
      <View style={styles.transcriptCardHeader}>
        <View style={styles.transcriptBadgeRow}>
          <View
            style={[
              styles.transcriptBadge,
              { backgroundColor: isDark ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 122, 255, 0.12)' },
            ]}>
            <Ionicons name="sparkles" size={12} color="#007AFF" />
            <Text style={styles.transcriptBadgeText}>MUSAFIR LIVE</Text>
          </View>

          {isLivePlaying && (
            <View style={styles.transcriptSpeakingBadge}>
              <View style={styles.miniEqContainer}>
                <Animated.View style={[styles.miniEqBar, { transform: [{ scaleY: eq1 }] }]} />
                <Animated.View style={[styles.miniEqBar, { transform: [{ scaleY: eq2 }] }]} />
                <Animated.View style={[styles.miniEqBar, { transform: [{ scaleY: eq3 }] }]} />
              </View>
              <Text style={styles.speakingText}>Speaking…</Text>
            </View>
          )}
        </View>

        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={({ pressed }) => [styles.transcriptCloseBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* User question (if recognized from STT) */}
      {Boolean(transcript.question) && (
        <Text style={[styles.transcriptQuestionText, { color: colors.textSecondary }]} numberOfLines={1}>
          "{transcript.question}"
        </Text>
      )}

      {/* Spoken answer transcript */}
      <Text style={[styles.transcriptAnswerText, { color: colors.text }]} numberOfLines={4}>
        {transcript.answerText}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Top bar container
  topContainer: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    zIndex: 30,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBar: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  tripHeaderPill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  tripHeaderDest: {
    fontSize: 14,
    fontWeight: '700',
  },
  tripHeaderMeta: {
    fontSize: 12,
    marginTop: 1,
  },

  // Re-center button
  recenterButtonWrapper: {
    position: 'absolute',
    right: 16,
    zIndex: 25,
  },
  recenterButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },

  // User location marker
  userLocationHalo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  // Story markers
  storyMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  storyMarkerActiveWrapper: {
    transform: [{ scale: 1.15 }],
  },
  storyMarkerPulse: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2.5,
    opacity: 0.45,
  },
  storyMarkerBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },

  // Floating place banner on map (Sleek name pill)
  floatingPlaceBanner: {
    position: 'absolute',
    left: 14,
    right: 74, // leaves room for recenter button
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 26,
  },
  floatingPlaceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  floatingPlaceIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPlaceTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  floatingCloseBtn: {
    padding: 4,
    marginLeft: 2,
  },

  // Live Mode Transcript Overlay Card
  transcriptCard: {
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  transcriptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  transcriptBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transcriptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  transcriptBadgeText: {
    color: '#007AFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  transcriptSpeakingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniEqContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 12,
  },
  miniEqBar: {
    width: 2.5,
    height: 10,
    borderRadius: 1.25,
    backgroundColor: '#34C759',
  },
  speakingText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '600',
  },
  transcriptCloseBtn: {
    padding: 3,
  },
  transcriptQuestionText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  transcriptAnswerText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '500',
  },
});
