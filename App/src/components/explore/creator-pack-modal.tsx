import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { darkMapStyle } from '@/constants/map-theme';
import { CreatorPack, PackWaypoint } from '@/constants/creator-packs';

type Props = {
  pack: CreatorPack | null;
  onClose: () => void;
};

export function CreatorPackModal({ pack, onClose }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];
  const [activeIndex, setActiveIndex] = useState(0);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [pack?.id]);

  const muted = isDark ? '#A1A1AA' : '#71717A';
  const border = isDark ? '#27272A' : '#E4E4E7';
  const coords = pack?.waypoints.map((w) => ({ latitude: w.latitude, longitude: w.longitude })) ?? [];
  const active = pack?.waypoints[activeIndex];

  const fitAll = () => {
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: false,
    });
  };

  const selectWaypoint = (w: PackWaypoint, index: number) => {
    setActiveIndex(index);
    mapRef.current?.animateToRegion(
      { latitude: w.latitude, longitude: w.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      350,
    );
  };

  const openDirections = (w: PackWaypoint) => {
    const label = encodeURIComponent(w.name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${w.latitude},${w.longitude}`,
      android: `geo:0,0?q=${w.latitude},${w.longitude}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`,
    });
    Linking.openURL(url).catch((err) => console.warn('Could not open map url:', err));
  };

  return (
    <Modal visible={!!pack} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.dialog,
            { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: border },
          ]}
          onPress={(e) => e.stopPropagation?.()}>
          {pack && (
            <>
              <View style={[styles.header, { borderBottomColor: border }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.category, { color: muted }]}>
                    {pack.category} · {pack.storiesCount} stories · {pack.duration}
                  </Text>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {pack.title}
                  </Text>
                  <Text style={[styles.creator, { color: muted }]} numberOfLines={1}>
                    by {pack.creatorName}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    {
                      backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                      borderColor: isDark ? '#3F3F46' : '#E4E4E7',
                    },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Ionicons name="close" size={16} color={isDark ? '#FAFAFA' : '#18181B'} />
                </Pressable>
              </View>

              <View style={styles.mapContainer}>
                <MapView
                  ref={mapRef}
                  style={StyleSheet.absoluteFill}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  customMapStyle={isDark ? darkMapStyle : []}
                  onMapReady={fitAll}
                  initialRegion={{
                    latitude: coords[0].latitude,
                    longitude: coords[0].longitude,
                    latitudeDelta: 0.3,
                    longitudeDelta: 0.3,
                  }}>
                  <Polyline
                    coordinates={coords}
                    strokeColor={isDark ? '#FAFAFA' : '#18181B'}
                    strokeWidth={3}
                    lineDashPattern={[8, 6]}
                  />
                  {pack.waypoints.map((w, idx) => (
                    <Marker
                      key={w.id}
                      coordinate={{ latitude: w.latitude, longitude: w.longitude }}
                      title={w.name}
                      onPress={() => selectWaypoint(w, idx)}>
                      <View style={[styles.pin, activeIndex === idx && styles.pinActive]}>
                        <Text style={[styles.pinText, activeIndex === idx && { color: '#FFFFFF' }]}>
                          {idx + 1}
                        </Text>
                      </View>
                    </Marker>
                  ))}
                </MapView>
              </View>

              {active && (
                <View
                  style={[
                    styles.bottom,
                    { borderTopColor: border, backgroundColor: isDark ? '#18181B' : '#FAFAFA' },
                  ]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pills}>
                    {pack.waypoints.map((w, idx) => {
                      const isActive = idx === activeIndex;
                      const fg = isActive ? (isDark ? '#18181B' : '#FFFFFF') : muted;
                      return (
                        <Pressable
                          key={w.id}
                          onPress={() => selectWaypoint(w, idx)}
                          style={[
                            styles.pill,
                            {
                              backgroundColor: isActive
                                ? isDark ? '#FAFAFA' : '#18181B'
                                : isDark ? '#27272A' : '#F4F4F5',
                              borderColor: isActive
                                ? isDark ? '#FAFAFA' : '#18181B'
                                : isDark ? '#3F3F46' : '#E4E4E7',
                            },
                          ]}>
                          <Text style={[styles.pillText, { color: fg }]}>
                            {idx + 1}. {w.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.detailRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.placeName, { color: colors.text }]} numberOfLines={1}>
                        {active.name}
                      </Text>
                      <Text style={[styles.placeBlurb, { color: muted }]} numberOfLines={2}>
                        {active.blurb}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.directionsBtn,
                        { backgroundColor: isDark ? '#FAFAFA' : '#18181B' },
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => openDirections(active)}>
                      <Ionicons name="navigate" size={13} color={isDark ? '#18181B' : '#FFFFFF'} />
                      <Text style={[styles.directionsText, { color: isDark ? '#18181B' : '#FFFFFF' }]}>
                        Directions
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    width: Math.min(SCREEN_WIDTH - 24, 420),
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  creator: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: { width: '100%', height: 220, backgroundColor: '#1E293B' },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinActive: { backgroundColor: '#18181B', borderColor: '#FFFFFF' },
  pinText: { fontSize: 12, fontWeight: '700', color: '#18181B' },
  bottom: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1 },
  pills: { gap: 8, paddingRight: 8, marginBottom: 10 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: '600', letterSpacing: -0.1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeName: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  placeBlurb: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  directionsText: { fontSize: 12, fontWeight: '600' },
});
