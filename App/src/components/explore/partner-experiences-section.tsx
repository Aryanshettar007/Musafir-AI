import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { darkMapStyle } from '@/constants/map-theme';
import {
  fetchSponsors,
  SponsorPartner,
  SponsorOutlet,
} from '@/services/sponsor-service';

const PARTNER_LOCAL_IMAGES: Record<string, any> = {
  'corner-house': require('@/assets/images/partners/corner-house.jpg'),
  'royal-enfield': require('@/assets/images/partners/royal-enfield.jpg'),
  'karnataka-tourism': require('@/assets/images/partners/karnataka-tourism.jpg'),
};

function getOutletShortName(outlet?: SponsorOutlet, idx: number = 0): string {
  if (!outlet?.label) return `Outlet ${idx + 1}`;
  const parts = outlet.label.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    return parts[1];
  }
  return `Outlet ${idx + 1}`;
}

export function PartnerExperiencesSection() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];

  const [partners, setPartners] = useState<SponsorPartner[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPartner, setSelectedPartner] = useState<SponsorPartner | null>(null);
  const [activeOutletIndex, setActiveOutletIndex] = useState<number>(0);

  const mapRef = useRef<MapView | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;
    fetchSponsors()
      .then((data) => {
        if (isMounted) {
          setPartners(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const openPartnerMap = (partner: SponsorPartner) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPartner(partner);
    setActiveOutletIndex(0);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const closePartnerMap = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setSelectedPartner(null);
    });
  };

  const handlePartnerInfoPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const title = 'Partner Monetization Model';
    const message =
      'How Musafir charges companies to advertise on our platform:\n\n' +
      'Sponsored Audio Waypoints: Brands pay per trip impression / targeted route play when drivers approach their outlet.\n\n' +
      'Curated Branded Trails: Automakers, tourism boards, and hospitality chains sponsor exclusive thematic driving routes.';

    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Center map on outlet
  const handleSelectOutlet = (outlet: SponsorOutlet, index: number) => {
    setActiveOutletIndex(index);
    if (mapRef.current && outlet.latitude && outlet.longitude) {
      mapRef.current.animateToRegion({
        latitude: outlet.latitude,
        longitude: outlet.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }, 350);
    }
  };

  const openNavigation = (outlet: SponsorOutlet) => {
    const lat = outlet.latitude;
    const lng = outlet.longitude;
    const label = encodeURIComponent(outlet.label);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      web: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    if (url) {
      Linking.openURL(url).catch((err) =>
        console.warn('Could not open map url:', err)
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={isDark ? '#A1A1AA' : '#71717A'} />
      </View>
    );
  }

  if (partners.length === 0) return null;

  // Selected outlet for modal
  const activeOutlet = selectedPartner?.outlets?.[activeOutletIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          style={({ pressed }) => [styles.titleGroup, pressed && { opacity: 0.7 }]}
          onPress={handlePartnerInfoPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="About Partner Trails">
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Partner Trails
          </Text>
          <Ionicons name="information-circle-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Horizontal Cards Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsScroll}>
        {partners.map((partner) => {
          const outletCount = partner.outlets?.length || 0;
          const imageSource =
            PARTNER_LOCAL_IMAGES[partner.slug] ||
            (partner.imageUrl ? { uri: partner.imageUrl } : undefined);

          return (
            <Pressable
              key={partner.slug}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: isDark ? '#27272A' : '#E4E4E7',
                },
                pressed && styles.cardPressed,
              ]}
              onPress={() => openPartnerMap(partner)}>
              {/* Image banner */}
              <View style={styles.imageWrap}>
                <ExpoImage
                  source={imageSource}
                  style={styles.cardImage}
                  contentFit="cover"
                  transition={200}
                />
              </View>

              {/* Card Body */}
              <View style={styles.cardContent}>
                <Text
                  style={[styles.partnerName, { color: colors.text }]}
                  numberOfLines={1}>
                  {partner.name}
                </Text>
                <Text
                  style={[
                    styles.tagline,
                    { color: isDark ? '#A1A1AA' : '#71717A' },
                  ]}
                  numberOfLines={1}>
                  {partner.brief?.tagline || partner.brief?.callToAction}
                </Text>

                {/* Footer with Location Info */}
                <View style={styles.cardFooter}>
                  <View style={styles.outletMeta}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={isDark ? '#A1A1AA' : '#71717A'}
                    />
                    <Text
                      style={[
                        styles.outletCountText,
                        { color: isDark ? '#A1A1AA' : '#71717A' },
                      ]}>
                      {outletCount} {outletCount === 1 ? 'Outlet' : 'Outlets'}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* SHADCN-STYLE MAP MODAL DIALOG */}
      <Modal
        visible={!!selectedPartner}
        transparent
        animationType="fade"
        onRequestClose={closePartnerMap}>
        <Pressable style={styles.modalBackdrop} onPress={closePartnerMap}>
          <Pressable
            style={styles.dialogBoxWrapper}
            onPress={(e) => {
              if (Platform.OS === 'web') {
                e.stopPropagation?.();
              }
            }}>
            <Animated.View
              style={[
                styles.dialogBox,
                {
                  opacity: fadeAnim,
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: isDark ? '#27272A' : '#E4E4E7',
                },
              ]}>
            {/* Dialog Header */}
            <View
              style={[
                styles.dialogHeader,
                { borderBottomColor: isDark ? '#27272A' : '#E4E4E7' },
              ]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={styles.dialogTaglineWrap}>
                  <Text style={[styles.dialogCategory, { color: isDark ? '#A1A1AA' : '#71717A' }]}>
                    {selectedPartner?.category}
                  </Text>
                </View>
                <Text
                  style={[styles.dialogTitle, { color: colors.text }]}
                  numberOfLines={1}>
                  {selectedPartner?.name}
                </Text>
              </View>

              <Pressable
                onPress={closePartnerMap}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.closeBtn,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                    borderColor: isDark ? '#3F3F46' : '#E4E4E7',
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons
                  name="close"
                  size={16}
                  color={isDark ? '#FAFAFA' : '#18181B'}
                />
              </Pressable>
            </View>

            {/* Map Area */}
            {selectedPartner && (
              <View style={styles.mapContainer}>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  customMapStyle={isDark ? darkMapStyle : []}
                  initialRegion={{
                    latitude:
                      selectedPartner.outlets[0]?.latitude || 12.9716,
                    longitude:
                      selectedPartner.outlets[0]?.longitude || 77.5946,
                    latitudeDelta: 0.08,
                    longitudeDelta: 0.08,
                  }}>
                  {selectedPartner.outlets.map((outlet, idx) => (
                    <Marker
                      key={outlet.label + idx}
                      coordinate={{
                        latitude: outlet.latitude,
                        longitude: outlet.longitude,
                      }}
                      title={outlet.label}
                      onPress={() => handleSelectOutlet(outlet, idx)}>
                      <View
                        style={[
                          styles.customMarkerPin,
                          activeOutletIndex === idx && styles.customMarkerPinActive,
                        ]}>
                        <Ionicons
                          name="location"
                          size={18}
                          color={activeOutletIndex === idx ? '#FFFFFF' : '#000000'}
                        />
                      </View>
                    </Marker>
                  ))}
                </MapView>
              </View>
            )}

            {/* Outlets Selector & Directions */}
            {activeOutlet && (
              <View
                style={[
                  styles.outletBottomCard,
                  {
                    borderTopColor: isDark ? '#27272A' : '#E4E4E7',
                    backgroundColor: isDark ? '#18181B' : '#FAFAFA',
                  },
                ]}>
                {/* Outlets pill row if multiple */}
                {(selectedPartner?.outlets?.length || 0) > 1 && (
                  <View style={styles.pillsWrapper}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.outletPillsScroll}>
                      {selectedPartner?.outlets.map((out, idx) => {
                        const isActive = activeOutletIndex === idx;
                        const shortName = getOutletShortName(out, idx);
                        return (
                          <Pressable
                            key={out.label + idx}
                            onPress={() => handleSelectOutlet(out, idx)}
                            style={[
                              styles.outletTabPill,
                              {
                                backgroundColor: isActive
                                  ? (isDark ? '#FAFAFA' : '#18181B')
                                  : (isDark ? '#27272A' : '#F4F4F5'),
                                borderColor: isActive
                                  ? (isDark ? '#FAFAFA' : '#18181B')
                                  : (isDark ? '#3F3F46' : '#E4E4E7'),
                              },
                            ]}>
                            <Ionicons
                              name="location-sharp"
                              size={11}
                              color={
                                isActive
                                  ? (isDark ? '#18181B' : '#FFFFFF')
                                  : (isDark ? '#A1A1AA' : '#71717A')
                              }
                            />
                            <Text
                              style={[
                                styles.outletTabPillText,
                                {
                                  color: isActive
                                    ? (isDark ? '#18181B' : '#FFFFFF')
                                    : (isDark ? '#A1A1AA' : '#71717A'),
                                },
                              ]}>
                              {shortName}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Outlet Details */}
                <View style={styles.outletDetailRow}>
                  <View style={styles.outletInfoTextGroup}>
                    <Text
                      style={[styles.outletTitle, { color: colors.text }]}
                      numberOfLines={1}>
                      {activeOutlet.label}
                    </Text>
                    {activeOutlet.address ? (
                      <Text
                        style={[
                          styles.outletAddress,
                          { color: isDark ? '#A1A1AA' : '#71717A' },
                        ]}
                        numberOfLines={1}>
                        {activeOutlet.address}
                      </Text>
                    ) : (
                      <Text
                        style={[
                          styles.outletAddress,
                          { color: isDark ? '#A1A1AA' : '#71717A' },
                        ]}>
                        {activeOutlet.latitude.toFixed(4)}, {activeOutlet.longitude.toFixed(4)}
                      </Text>
                    )}
                  </View>

                  {/* Directions CTA */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.directionsBtn,
                      {
                        backgroundColor: isDark ? '#FAFAFA' : '#18181B',
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => openNavigation(activeOutlet)}>
                    <Ionicons
                      name="navigate"
                      size={13}
                      color={isDark ? '#18181B' : '#FFFFFF'}
                    />
                    <Text
                      style={[
                        styles.directionsBtnText,
                        { color: isDark ? '#18181B' : '#FFFFFF' },
                      ]}>
                      Directions
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    marginBottom: 6,
  },
  loadingContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    paddingVertical: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardsScroll: {
    gap: 12,
    paddingRight: 16,
    paddingVertical: 6,
  },
  card: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  imageWrap: {
    width: '100%',
    height: 110,
    backgroundColor: '#E5E3DF',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardContent: {
    padding: 10,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tagline: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  cardFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  outletMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  outletCountText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Modal Dialog Styles (Shadcn style dialog)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialogBoxWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBox: {
    width: Math.min(SCREEN_WIDTH - 24, 420),
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dialogTaglineWrap: {
    marginBottom: 2,
  },
  dialogCategory: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#1E293B',
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  customMarkerPin: {
    backgroundColor: '#FFFFFF',
    padding: 5,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#18181B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  customMarkerPinActive: {
    backgroundColor: '#18181B',
    borderColor: '#FFFFFF',
  },
  outletBottomCard: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  pillsWrapper: {
    marginBottom: 10,
  },
  outletPillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  outletTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
  },
  outletTabPillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  outletDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  outletInfoTextGroup: {
    flex: 1,
    paddingRight: 4,
  },
  outletTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  outletAddress: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  directionsBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
