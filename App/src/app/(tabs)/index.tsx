import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { useColorScheme } from '@/hooks/use-color-scheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive snap points for bottom sheet
const MIN_SHEET_HEIGHT = 280;
const COLLAPSED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.52, 440);
const EXPANDED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.85, 720);

// Default fallback coordinates (Bengaluru central location)
const DEFAULT_COORDS = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

interface RecentPlace {
  id: string;
  title: string;
  address: string;
  distance: string;
  icon: 'time-outline' | 'airplane-outline' | 'briefcase-outline' | 'business-outline' | 'cafe-outline';
  latitude: number;
  longitude: number;
}

interface CreatorPack {
  id: string;
  title: string;
  creatorName: string;
  imageUrl: string;
  storiesCount: number;
  duration: string;
  category: string;
}

interface LocationPoint {
  text: string;
  coords: { latitude: number; longitude: number } | null;
  isGps: boolean;
}

const CREATOR_PACKS: CreatorPack[] = [
  {
    id: 'pack_1',
    title: 'Old Bengaluru Heritage Walk',
    creatorName: 'Aarav Sharma',
    imageUrl: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80',
    storiesCount: 8,
    duration: '42m',
    category: 'Heritage',
  },
  {
    id: 'pack_2',
    title: 'Secret Street Food Trail',
    creatorName: 'Chef Tanya Roy',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
    storiesCount: 14,
    duration: '1h 10m',
    category: 'Food Trail',
  },
  {
    id: 'pack_3',
    title: 'Western Ghats Monsoon Drive',
    creatorName: 'Rohit Shenoy',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    storiesCount: 6,
    duration: '28m',
    category: 'Road Trip',
  },
  {
    id: 'pack_4',
    title: 'Midnight Ghost Lore & Myths',
    creatorName: 'Urban Mythologist',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    storiesCount: 5,
    duration: '35m',
    category: 'Mystery',
  },
  {
    id: 'pack_5',
    title: 'Ancient Hoysala Temple Tales',
    creatorName: 'Dr. K. Sastri',
    imageUrl: 'https://images.unsplash.com/photo-1609766857041-ed402ea8069a?auto=format&fit=crop&w=800&q=80',
    storiesCount: 11,
    duration: '50m',
    category: 'Architecture',
  },
];

const RECENT_DESTINATIONS: RecentPlace[] = [
  {
    id: '1',
    title: "Kempegowda Int'l Airport (BLR)",
    address: 'KIAL Rd, Devanahalli, Bengaluru',
    distance: '34 km',
    icon: 'airplane-outline',
    latitude: 13.1986,
    longitude: 77.7066,
  },
  {
    id: '2',
    title: 'Indiranagar 100ft Road',
    address: '12th Main Rd, HAL 2nd Stage',
    distance: '4.8 km',
    icon: 'time-outline',
    latitude: 12.9784,
    longitude: 77.6408,
  },
  {
    id: '3',
    title: 'UB City',
    address: '24, Vittal Mallya Rd, KG Halli',
    distance: '2.1 km',
    icon: 'business-outline',
    latitude: 12.9719,
    longitude: 77.5956,
  },
  {
    id: '4',
    title: 'Koramangala 4th Block',
    address: '80 Feet Rd, ST Bed, Koramangala',
    distance: '6.5 km',
    icon: 'cafe-outline',
    latitude: 12.9345,
    longitude: 77.6264,
  },
  {
    id: '5',
    title: 'Work (Tech Park)',
    address: 'Outer Ring Rd, Bellandur',
    distance: '11.2 km',
    icon: 'briefcase-outline',
    latitude: 12.926,
    longitude: 77.6762,
  },
  {
    id: '6',
    title: 'Bangalore Palace',
    address: 'Vasanth Nagar, Bengaluru',
    distance: '3.9 km',
    icon: 'business-outline',
    latitude: 12.9988,
    longitude: 77.5921,
  },
  {
    id: '7',
    title: 'Lalbagh Botanical Garden',
    address: 'Mavalli, Bengaluru',
    distance: '4.5 km',
    icon: 'time-outline',
    latitude: 12.9507,
    longitude: 77.5848,
  },
];

export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const mapRef = useRef<MapView>(null);

  // Theme-tailored Color Palette
  const colors = {
    background: isDark ? '#000000' : '#FFFFFF',
    sheetBg: isDark ? '#161719' : '#FFFFFF',
    surfaceAlt: isDark ? '#232428' : '#F6F6F6',
    cardBorder: isDark ? '#2D2E33' : '#E5E5EA',
    divider: isDark ? '#28292E' : '#E5E5EA',
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#9A9CA3' : '#767676',
    placeholder: isDark ? '#6B6E76' : '#8E8E93',
    handle: isDark ? '#3D3F45' : '#D1D1D6',
    accent: '#007AFF',
    originDot: '#007AFF',
    destSquare: isDark ? '#FFFFFF' : '#000000',
    rowBorder: isDark ? '#202124' : '#F0F0F0',
    rowSelected: isDark ? '#26282E' : '#F2F2F7',
    floatingPill: isDark ? '#1C1D20' : '#FFFFFF',
    floatingPillBorder: isDark ? '#2D2E33' : 'transparent',
    recenterBtn: isDark ? '#222327' : '#FFFFFF',
    recenterIcon: isDark ? '#FFFFFF' : '#000000',
  };

  // Hardware Device GPS States
  const [deviceGpsCoords, setDeviceGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [deviceGpsAddress, setDeviceGpsAddress] = useState<string>('Current Location');
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(true);

  // Symmetrical Location Points
  const [sourcePoint, setSourcePoint] = useState<LocationPoint>({
    text: 'Current Location',
    coords: null,
    isGps: true,
  });

  const [destinationPoint, setDestinationPoint] = useState<LocationPoint>({
    text: '',
    coords: null,
    isGps: false,
  });

  // Toggle view all recent destinations
  const [showAllDestinations, setShowAllDestinations] = useState<boolean>(false);

  // DRAGGABLE SHEET ANIMATION & PAN RESPONDER
  const sheetHeight = useRef(new Animated.Value(COLLAPSED_SHEET_HEIGHT)).current;
  const currentHeightRef = useRef<number>(COLLAPSED_SHEET_HEIGHT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((val) => {
          currentHeightRef.current = val;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = currentHeightRef.current - gestureState.dy;
        if (newHeight >= MIN_SHEET_HEIGHT - 30 && newHeight <= EXPANDED_SHEET_HEIGHT + 30) {
          sheetHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const finalHeight = currentHeightRef.current - gestureState.dy;
        let targetHeight = COLLAPSED_SHEET_HEIGHT;

        if (gestureState.vy < -0.5) {
          targetHeight = EXPANDED_SHEET_HEIGHT;
        } else if (gestureState.vy > 0.5) {
          targetHeight = finalHeight < COLLAPSED_SHEET_HEIGHT ? MIN_SHEET_HEIGHT : COLLAPSED_SHEET_HEIGHT;
        } else {
          if (finalHeight > (COLLAPSED_SHEET_HEIGHT + EXPANDED_SHEET_HEIGHT) / 2) {
            targetHeight = EXPANDED_SHEET_HEIGHT;
          } else if (finalHeight < (MIN_SHEET_HEIGHT + COLLAPSED_SHEET_HEIGHT) / 2) {
            targetHeight = MIN_SHEET_HEIGHT;
          } else {
            targetHeight = COLLAPSED_SHEET_HEIGHT;
          }
        }

        Haptics.selectionAsync();
        currentHeightRef.current = targetHeight;
        Animated.spring(sheetHeight, {
          toValue: targetHeight,
          useNativeDriver: false,
          friction: 8,
          tension: 48,
        }).start();
      },
    })
  ).current;

  const toggleSheetExpansion = () => {
    Haptics.selectionAsync();
    const target =
      currentHeightRef.current >= EXPANDED_SHEET_HEIGHT - 30
        ? COLLAPSED_SHEET_HEIGHT
        : EXPANDED_SHEET_HEIGHT;
    currentHeightRef.current = target;
    Animated.spring(sheetHeight, {
      toValue: target,
      useNativeDriver: false,
      friction: 8,
      tension: 48,
    }).start();
  };

  // Fetch initial GPS location on mount
  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  const fetchCurrentLocation = async () => {
    try {
      setIsLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setIsLoadingLocation(false);
        const fallback = { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude };
        setDeviceGpsCoords(fallback);
        setDeviceGpsAddress('Bengaluru, Karnataka');
        setSourcePoint({ text: 'Bengaluru, Karnataka', coords: fallback, isGps: true });
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const current = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setDeviceGpsCoords(current);

      let formatted = 'Current Location';
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync(current);
        if (reverseGeocode && reverseGeocode.length > 0) {
          const item = reverseGeocode[0];
          const parts = [
            item.name || item.street,
            item.district || item.subregion || item.city,
          ].filter(Boolean);
          if (parts.length > 0) {
            formatted = parts.join(', ');
          }
        }
      } catch {
        formatted = 'Current Location';
      }

      setDeviceGpsAddress(formatted);

      // Initialize source location to user GPS if it was set to GPS mode
      setSourcePoint((prev) => (prev.isGps ? { text: formatted, coords: current, isGps: true } : prev));

      mapRef.current?.animateToRegion(
        {
          latitude: current.latitude,
          longitude: current.longitude,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        1000
      );
    } catch {
      const fallback = { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude };
      setDeviceGpsCoords(fallback);
      setSourcePoint({ text: 'Current Location', coords: fallback, isGps: true });
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Re-center map to user GPS coordinates
  const handleRecenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (deviceGpsCoords) {
      mapRef.current?.animateToRegion(
        {
          latitude: deviceGpsCoords.latitude,
          longitude: deviceGpsCoords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        700
      );
    } else {
      fetchCurrentLocation();
    }
  };

  // SET SOURCE TO CURRENT LOCATION (GPS)
  const handleSetSourceToGps = () => {
    Haptics.selectionAsync();

    // Prevent identical source and destination
    if (destinationPoint.isGps) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Same Location',
        'Destination is already set to your Current Location. Source and Destination cannot be the same.'
      );
      return;
    }

    const nextSource: LocationPoint = {
      text: deviceGpsAddress,
      coords: deviceGpsCoords,
      isGps: true,
    };
    setSourcePoint(nextSource);

    if (deviceGpsCoords && destinationPoint.coords) {
      mapRef.current?.fitToCoordinates([deviceGpsCoords, destinationPoint.coords], {
        edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
        animated: true,
      });
    } else if (deviceGpsCoords) {
      mapRef.current?.animateToRegion(
        {
          ...deviceGpsCoords,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        700
      );
    }
  };

  // SET DESTINATION TO CURRENT LOCATION (GPS)
  const handleSetDestinationToGps = () => {
    Haptics.selectionAsync();

    // Prevent identical source and destination
    if (sourcePoint.isGps) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Same Location',
        'Starting point is already set to your Current Location. Source and Destination cannot be the same.'
      );
      return;
    }

    const nextDest: LocationPoint = {
      text: deviceGpsAddress,
      coords: deviceGpsCoords,
      isGps: true,
    };
    setDestinationPoint(nextDest);

    if (sourcePoint.coords && deviceGpsCoords) {
      mapRef.current?.fitToCoordinates([sourcePoint.coords, deviceGpsCoords], {
        edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
        animated: true,
      });
    } else if (deviceGpsCoords) {
      mapRef.current?.animateToRegion(
        {
          ...deviceGpsCoords,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        700
      );
    }
  };

  // SWAP SOURCE & DESTINATION BUTTON HANDLER
  const handleSwapLocations = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If both are empty, nothing to swap
    if (!sourcePoint.text && !destinationPoint.text) {
      return;
    }

    // Direct clean swap of both states
    const newSource = { ...destinationPoint };
    const newDestination = { ...sourcePoint };

    setSourcePoint(newSource);
    setDestinationPoint(newDestination);

    // Reframe map camera to the new route
    if (newSource.coords && newDestination.coords) {
      mapRef.current?.fitToCoordinates([newSource.coords, newDestination.coords], {
        edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
        animated: true,
      });
    } else if (newSource.coords) {
      mapRef.current?.animateToRegion(
        {
          ...newSource.coords,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        700
      );
    } else if (newDestination.coords) {
      mapRef.current?.animateToRegion(
        {
          ...newDestination.coords,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        700
      );
    }
  };

  // Select a destination from recent places
  const handleSelectDestination = (place: RecentPlace) => {
    Haptics.selectionAsync();
    Keyboard.dismiss();

    // Prevent selecting the same place as source
    const placeCoords = { latitude: place.latitude, longitude: place.longitude };
    if (
      sourcePoint.coords &&
      Math.abs(sourcePoint.coords.latitude - place.latitude) < 0.0001 &&
      Math.abs(sourcePoint.coords.longitude - place.longitude) < 0.0001
    ) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Same Location',
        `"${place.title}" is already selected as your starting point.`
      );
      return;
    }

    const nextDestination: LocationPoint = {
      text: place.title,
      coords: placeCoords,
      isGps: false,
    };
    setDestinationPoint(nextDestination);

    if (sourcePoint.coords) {
      mapRef.current?.fitToCoordinates([sourcePoint.coords, placeCoords], {
        edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
        animated: true,
      });
    } else {
      mapRef.current?.animateToRegion(
        {
          ...placeCoords,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        700
      );
    }
  };

  // Clear destination input
  const handleClearDestination = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDestinationPoint({
      text: '',
      coords: null,
      isGps: false,
    });
    if (sourcePoint.coords) {
      mapRef.current?.animateToRegion(
        {
          ...sourcePoint.coords,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        700
      );
    }
  };

  // Toggle View All recent destinations
  const toggleViewAllDestinations = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextState = !showAllDestinations;
    setShowAllDestinations(nextState);

    if (nextState && currentHeightRef.current < EXPANDED_SHEET_HEIGHT - 30) {
      currentHeightRef.current = EXPANDED_SHEET_HEIGHT;
      Animated.spring(sheetHeight, {
        toValue: EXPANDED_SHEET_HEIGHT,
        useNativeDriver: false,
        friction: 8,
        tension: 48,
      }).start();
    }
  };

  // Handle Creator Pack preview tap
  const handleCreatorPackPress = (pack: CreatorPack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      pack.title,
      `Curated by ${pack.creatorName}\n${pack.storiesCount} geo-tagged audio stories • ${pack.duration}\n\nAudio stories will automatically trigger as you navigate along this route!`
    );
  };

  const currentRegion = {
    latitude: sourcePoint.coords?.latitude ?? deviceGpsCoords?.latitude ?? DEFAULT_COORDS.latitude,
    longitude: sourcePoint.coords?.longitude ?? deviceGpsCoords?.longitude ?? DEFAULT_COORDS.longitude,
    latitudeDelta: DEFAULT_COORDS.latitudeDelta,
    longitudeDelta: DEFAULT_COORDS.longitudeDelta,
  };

  const displayedDestinations = showAllDestinations
    ? RECENT_DESTINATIONS
    : RECENT_DESTINATIONS.slice(0, 3);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* MAP SECTION */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={currentRegion}
          showsUserLocation={false}
          showsCompass={false}
          showsMyLocationButton={false}>
          {/* SOURCE MARKER */}
          {sourcePoint.coords && (
            <Marker
              coordinate={sourcePoint.coords}
              title={sourcePoint.text || 'Starting point'}
              anchor={{ x: 0.5, y: sourcePoint.isGps ? 0.5 : 1 }}
              centerOffset={{ x: 0, y: sourcePoint.isGps ? 0 : -19 }}>
              {sourcePoint.isGps ? (
                <View style={styles.pickupMarkerOuter}>
                  <View style={styles.pickupMarkerInner} />
                </View>
              ) : (
                <View style={styles.pinContainer}>
                  <View style={[styles.pinHead, { backgroundColor: '#007AFF' }]}>
                    <View style={styles.pinInnerDot} />
                  </View>
                  <View style={[styles.pinTip, { borderTopColor: '#007AFF' }]} />
                </View>
              )}
            </Marker>
          )}

          {/* DESTINATION (DROP LOCATION) MARKER */}
          {destinationPoint.coords && (
            <Marker
              coordinate={destinationPoint.coords}
              title={destinationPoint.text || 'Destination'}
              anchor={{ x: 0.5, y: destinationPoint.isGps ? 0.5 : 1 }}
              centerOffset={{ x: 0, y: destinationPoint.isGps ? 0 : -19 }}>
              {destinationPoint.isGps ? (
                <View style={styles.pickupMarkerOuter}>
                  <View style={styles.pickupMarkerInner} />
                </View>
              ) : (
                <View style={styles.pinContainer}>
                  <View style={[styles.pinHead, { backgroundColor: '#EA4335' }]}>
                    <View style={styles.pinInnerDot} />
                  </View>
                  <View style={[styles.pinTip, { borderTopColor: '#EA4335' }]} />
                </View>
              )}
            </Marker>
          )}

          {/* ROUTE POLYLINE */}
          {sourcePoint.coords && destinationPoint.coords && (
            <Polyline
              coordinates={[sourcePoint.coords, destinationPoint.coords]}
              strokeColor="#1A73E8"
              strokeWidth={5}
            />
          )}
        </MapView>

        {/* TOP FLOATING BRAND BAR */}
        <SafeAreaView edges={['top']} style={styles.floatingTopBar}>
          <View
            style={[
              styles.brandPill,
              {
                backgroundColor: colors.floatingPill,
                borderColor: colors.floatingPillBorder,
                borderWidth: isDark ? 1 : 0,
              },
            ]}>
            <View
              style={[
                styles.brandLogoCircle,
                { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
              ]}>
              <Ionicons name="navigate" size={13} color={isDark ? '#000000' : '#FFFFFF'} />
            </View>
            <Text style={[styles.brandText, { color: colors.text }]}>Musafir</Text>
            <View style={styles.statusDot} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>Ready</Text>
          </View>
        </SafeAreaView>

        {/* FLOATING RE-CENTER BUTTON */}
        <Pressable
          style={({ pressed }) => [
            styles.recenterButton,
            {
              backgroundColor: colors.recenterBtn,
              borderColor: colors.cardBorder,
              borderWidth: isDark ? 1 : 0,
            },
            pressed && styles.buttonPressed,
          ]}
          onPress={handleRecenter}>
          {isLoadingLocation ? (
            <ActivityIndicator size="small" color={colors.recenterIcon} />
          ) : (
            <Ionicons name="locate" size={20} color={colors.recenterIcon} />
          )}
        </Pressable>
      </View>

      {/* DRAGGABLE THEMED BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: sheetHeight,
            backgroundColor: colors.sheetBg,
            borderColor: colors.cardBorder,
          },
        ]}>
        {/* DRAG HANDLE ZONE */}
        <View {...panResponder.panHandlers} style={styles.dragHandleZone}>
          <Pressable onPress={toggleSheetExpansion} hitSlop={12} style={styles.handleBarTouch}>
            <View style={[styles.handleBar, { backgroundColor: colors.handle }]} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}>
          {/* SEARCH INPUT CARD WITH SWAP BUTTON */}
          <View style={[styles.searchCard, { backgroundColor: colors.surfaceAlt }]}>
            {/* ROUTE CONNECTOR ICONS */}
            <View style={styles.connectorContainer}>
              <View style={[styles.originDot, { backgroundColor: colors.originDot }]} />
              <View style={[styles.connectorLine, { backgroundColor: colors.divider }]} />
              <View style={[styles.destinationSquare, { backgroundColor: colors.destSquare }]} />
            </View>

            {/* INPUT FIELDS */}
            <View style={styles.inputsColumn}>
              {/* SOURCE / STARTING LOCATION ROW */}
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  value={sourcePoint.text}
                  onChangeText={(text) => {
                    setSourcePoint({
                      text,
                      coords: null,
                      isGps: false,
                    });
                  }}
                  placeholder="Choose starting point"
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="done"
                />
                {!sourcePoint.isGps && (
                  <Pressable
                    hitSlop={8}
                    style={[
                      styles.inputActionBtn,
                      { backgroundColor: isDark ? '#2E3036' : '#EAEAEA' },
                    ]}
                    onPress={handleSetSourceToGps}>
                    <Ionicons name="navigate-circle-outline" size={17} color={colors.accent} />
                    <Text style={[styles.resetGpsText, { color: colors.accent }]}>GPS</Text>
                  </Pressable>
                )}
              </View>

              <View style={[styles.inputDivider, { backgroundColor: colors.divider }]} />

              {/* DESTINATION / WHERE TO ROW */}
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, styles.destinationInputText, { color: colors.text }]}
                  value={destinationPoint.text}
                  onChangeText={(text) => {
                    setDestinationPoint({
                      text,
                      coords: null,
                      isGps: false,
                    });
                  }}
                  placeholder="Where to?"
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="search"
                />
                {!destinationPoint.isGps && (
                  <Pressable
                    hitSlop={8}
                    style={[
                      styles.inputActionBtn,
                      { backgroundColor: isDark ? '#2E3036' : '#EAEAEA' },
                    ]}
                    onPress={handleSetDestinationToGps}>
                    <Ionicons name="navigate-circle-outline" size={17} color={colors.accent} />
                    <Text style={[styles.resetGpsText, { color: colors.accent }]}>GPS</Text>
                  </Pressable>
                )}
                {destinationPoint.text.length > 0 && (
                  <Pressable
                    hitSlop={8}
                    style={[styles.inputActionBtn, { marginLeft: 4 }]}
                    onPress={handleClearDestination}>
                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* SWAP SOURCE & DESTINATION BUTTON */}
            <Pressable
              style={({ pressed }) => [
                styles.swapButton,
                {
                  backgroundColor: isDark ? '#2B2D33' : '#FFFFFF',
                  borderColor: colors.divider,
                },
                pressed && styles.buttonPressed,
              ]}
              hitSlop={8}
              onPress={handleSwapLocations}>
              <Ionicons name="swap-vertical" size={18} color={colors.text} />
            </Pressable>
          </View>

          {/* RECENT DESTINATIONS SECTION */}
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Recent Destinations
              </Text>
              <Pressable
                hitSlop={8}
                style={({ pressed }) => [styles.viewAllButton, pressed && styles.buttonPressed]}
                onPress={toggleViewAllDestinations}>
                <Text style={[styles.viewAllText, { color: colors.accent }]}>
                  {showAllDestinations ? 'Show Less' : 'View All'}
                </Text>
                <Ionicons
                  name={showAllDestinations ? 'chevron-up' : 'chevron-forward'}
                  size={14}
                  color={colors.accent}
                />
              </Pressable>
            </View>

            {displayedDestinations.map((item) => {
              const isSelected =
                destinationPoint.coords &&
                Math.abs(destinationPoint.coords.latitude - item.latitude) < 0.0001 &&
                Math.abs(destinationPoint.coords.longitude - item.longitude) < 0.0001;

              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.recentRow,
                    { borderBottomColor: colors.rowBorder },
                    isSelected && [
                      styles.recentRowSelected,
                      { backgroundColor: colors.rowSelected },
                    ],
                    pressed && styles.recentRowPressed,
                  ]}
                  onPress={() => handleSelectDestination(item)}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name={item.icon} size={18} color={colors.text} />
                  </View>
                  <View style={styles.placeDetails}>
                    <Text style={[styles.placeTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.placeAddress, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                  <View style={styles.distanceBadge}>
                    <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                      {item.distance}
                    </Text>
                    <MaterialIcons name="chevron-right" size={20} color={colors.placeholder} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* CREATOR PACKS SECTION */}
          <View style={styles.creatorSection}>
            <View style={styles.creatorSectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Creator Packs
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.creatorCardsScroll}>
              {CREATOR_PACKS.map((pack) => (
                <Pressable
                  key={pack.id}
                  style={({ pressed }) => [
                    styles.creatorCard,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => handleCreatorPackPress(pack)}>
                  <View style={styles.imageContainer}>
                    <ExpoImage
                      source={{ uri: pack.imageUrl }}
                      style={styles.creatorImage}
                      contentFit="cover"
                      transition={300}
                    />
                  </View>
                  <View style={styles.creatorInfoBlock}>
                    <Text
                      style={[styles.creatorPackTitle, { color: colors.text }]}
                      numberOfLines={1}>
                      {pack.title}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },

  // Floating Top Musafir Brand Bar
  floatingTopBar: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    zIndex: 10,
    alignItems: 'flex-start',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    gap: 7,
  },
  brandLogoCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
    marginLeft: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Re-center button
  recenterButton: {
    position: 'absolute',
    bottom: 24,
    right: 16,
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
    zIndex: 10,
  },

  // Markers
  pickupMarkerOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 122, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  // Custom Map Pins (Drop Location & Custom Source)
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 32,
    height: 38,
  },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 2,
  },
  pinInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  pinTip: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
    zIndex: 1,
  },

  // Bottom Sheet Container
  sheetContainer: {
    width: '100%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  dragHandleZone: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handleBarTouch: {
    paddingVertical: 4,
    paddingHorizontal: 20,
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 90 : 70,
  },

  // Uber Style Search Card with Swap Button
  searchCard: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  connectorContainer: {
    alignItems: 'center',
    width: 20,
    marginRight: 10,
    paddingVertical: 10,
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectorLine: {
    width: 1.5,
    height: 28,
    marginVertical: 4,
  },
  destinationSquare: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  inputsColumn: {
    flex: 1,
    gap: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 2,
  },
  destinationInputText: {
    fontWeight: '600',
  },
  inputActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
  },
  resetGpsText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inputDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },

  // Swap Button
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginLeft: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  // Recent Destinations Section
  recentSection: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentRowSelected: {
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  recentRowPressed: {
    opacity: 0.6,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  placeDetails: {
    flex: 1,
    marginRight: 8,
  },
  placeTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  placeAddress: {
    fontSize: 13,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '500',
  },

  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },

  // Creator Packs Section
  creatorSection: {
    marginTop: 22,
    marginBottom: 16,
  },
  creatorSectionHeader: {
    paddingVertical: 10,
  },
  creatorCardsScroll: {
    paddingRight: 16,
    gap: 14,
  },
  creatorCard: {
    width: 200,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E3DF',
  },
  creatorImage: {
    width: '100%',
    height: '100%',
  },
  creatorInfoBlock: {
    marginTop: 8,
  },
  creatorPackTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
