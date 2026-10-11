import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Trip, TripItem } from '@/services/trip-service';
import { formatDist, formatDuration } from './trip-utils';
import { TripSimulator } from './trip-simulator';

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
    [key: string]: string;
  };
  isDark: boolean;
  onBack: () => void;
  onRecenter: () => void;
  isSimulating: boolean;
  onToggleSimulate: () => void;
  items: TripItem[];
  isPlaying: boolean;
  playingItemTitle?: string;
  onSimLocationUpdate: (loc: { latitude: number; longitude: number }) => void;
  onResetToGPS: () => void;
  polylineCoords: { latitude: number; longitude: number }[];
  audioMultiplier: number;
  onAudioMultiplierChange: (mult: number) => void;
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
  isSimulating,
  onToggleSimulate,
  items,
  isPlaying,
  playingItemTitle,
  onSimLocationUpdate,
  onResetToGPS,
  polylineCoords,
  audioMultiplier,
  onAudioMultiplierChange,
}: TripMapProps) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}>
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

      {/* Back button & destination header pill & simulation toggle */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable
          style={[
            styles.topBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: isDark ? 1 : 0,
            },
          ]}
          onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
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
      </SafeAreaView>

      {/* Simulation controller card */}
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

      {/* RE-CENTER MAP BUTTON (Floating above sheet) */}
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

const styles = StyleSheet.create({
  // Top bar overlay
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
});
