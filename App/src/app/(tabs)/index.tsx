import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { api, BACKEND_URL } from '@/services/api';
import {
  getRecentTrips,
  startTrip,
  previewRoutes,
  decodePolyline,
  PlaceSuggestion,
  TripSummary,
  RouteOption,
  loadCachedRecentTrips,
  saveCachedRecentTrips,
} from '@/services/trip-service';
import {
  SourceDestinationSearch,
  SourceDestinationSearchRef,
  LocationPoint,
} from '@/components/source-destination-search';
import { AudioLanguageSheetModal } from '@/components/ui/audio-language-sheet';
import { MoodSelectSheetModal } from '@/components/ui/mood-select-sheet';
import { DEFAULT_INTERESTS } from '@/constants/onboarding';
import { mapLanguage, mapLanguageToLabel, updateProfileOnBackend } from '@/services/user-service';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive snap points for bottom sheet
const MIN_SHEET_HEIGHT = 280;
const COLLAPSED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.52, 440);
const EXPANDED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.85, 720);

// Calculates map center latitude offset so the location marker sits in the visual center
// of the visible map area above the collapsed bottom sheet.
function getVisibleCenterLatitude(
  latitude: number,
  latitudeDelta: number,
  sheetHeightPx: number = COLLAPSED_SHEET_HEIGHT
): number {
  const offsetRatio = sheetHeightPx / (2 * SCREEN_HEIGHT);
  return latitude - latitudeDelta * offsetRatio;
}

// Calculates representative coordinate along route to display floating badge
function getRouteBadgeCoord(
  points: { latitude: number; longitude: number }[],
  routeIndex: number,
  totalRoutes: number
): { latitude: number; longitude: number } | null {
  if (!points || points.length === 0) return null;
  if (totalRoutes <= 1) {
    return points[Math.floor(points.length * 0.5)];
  }
  // Offset badge placement along route paths so multiple routes don't overlap badges
  const fractions = [0.46, 0.56, 0.38, 0.64];
  const fraction = fractions[routeIndex % fractions.length];
  const idx = Math.min(Math.max(Math.floor(points.length * fraction), 0), points.length - 1);
  return points[idx];
}

// Default fallback coordinates (Bengaluru central location)
const DEFAULT_COORDS = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

interface CreatorPack {
  id: string;
  title: string;
  creatorName: string;
  imageUrl: string;
  storiesCount: number;
  duration: string;
  category: string;
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



export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const router = useRouter();

  const mapRef = useRef<MapView>(null);

  // Selected place suggestions (destination & source)
  const [selectedSuggestion, setSelectedSuggestion] = useState<PlaceSuggestion | null>(null);
  const [selectedSourceSuggestion, setSelectedSourceSuggestion] = useState<PlaceSuggestion | null>(null);
  const searchRef = useRef<SourceDestinationSearchRef>(null);

  // Alternative Route Options state
  const [availableRoutes, setAvailableRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);

  // Synchronized refs to guarantee access to the newest values across closures
  const availableRoutesRef = useRef<RouteOption[]>([]);
  availableRoutesRef.current = availableRoutes;
  const selectedRouteIndexRef = useRef<number>(0);
  selectedRouteIndexRef.current = selectedRouteIndex;

  // Decoded coordinates cache for all available route polylines
  const decodedPointsMap = React.useMemo(() => {
    const map: Record<string, { latitude: number; longitude: number }[]> = {};
    for (const r of availableRoutes) {
      map[r.id] = decodePolyline(r.polyline);
    }
    return map;
  }, [availableRoutes]);

  // Recent trips from server
  const [recentTrips, setRecentTrips] = useState<TripSummary[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Trip start loading
  const [isStartingTrip, setIsStartingTrip] = useState(false);

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

  // User Audio Preferences & Mood
  const [preferredAudio, setPreferredAudio] = useState<string>('English');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [voice, setVoice] = useState<string>('Nalini');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([...DEFAULT_INTERESTS]);
  const [isAudioModalVisible, setIsAudioModalVisible] = useState<boolean>(false);
  const [isMoodModalVisible, setIsMoodModalVisible] = useState<boolean>(false);

  // DRAGGABLE SHEET ANIMATION & PAN RESPONDER
  const sheetHeight = useRef(new Animated.Value(COLLAPSED_SHEET_HEIGHT)).current;
  const currentHeightRef = useRef<number>(COLLAPSED_SHEET_HEIGHT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        searchRef.current?.dismissSuggestions();
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

  // Server Health State
  const [serverHealth, setServerHealth] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkServerHealth = async (showFeedback = false) => {
    try {
      if (showFeedback) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const res = await api.checkHealth();
      if (res && res.status === 'UP') {
        setServerHealth('online');
        if (showFeedback) {
          Alert.alert(
            'Server Connected',
            `Musafir AI Backend is UP.\nUptime: ${Math.round(res.uptime || 0)}s`
          );
        }
      } else {
        setServerHealth('offline');
        if (showFeedback) {
          Alert.alert('Server Status', 'Backend responded with an unexpected status.');
        }
      }
    } catch {
      setServerHealth('offline');
      if (showFeedback) {
        Alert.alert(
          'Server Offline',
          `Could not connect to the backend at ${BACKEND_URL}.\n\nMake sure your backend server is running.`
        );
      }
    }
  };

  // Poll server health on mount and every 20 seconds
  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(() => {
      checkServerHealth();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Load recent trips from server or offline cache
  const loadRecentTrips = useCallback(async () => {
    try {
      setIsLoadingRecent(true);
      const trips = await getRecentTrips(10);
      setRecentTrips(trips);
      await saveCachedRecentTrips(trips);
    } catch {
      // Offline fallback: load cached recent trips from disk/storage
      const cached = await loadCachedRecentTrips();
      if (cached && cached.length > 0) {
        setRecentTrips(cached);
      }
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  // Pre-load cached trips immediately on mount for instant zero-network display
  useEffect(() => {
    (async () => {
      const cached = await loadCachedRecentTrips();
      if (cached && cached.length > 0) {
        setRecentTrips((curr) => (curr.length > 0 ? curr : cached));
      }
    })();
  }, []);

  useEffect(() => {
    loadRecentTrips();
  }, [loadRecentTrips]);

  // Load user audio preferences from local storage on mount
  useEffect(() => {
    async function loadAudioPreferences() {
      try {
        const raw = await AsyncStorage.getItem('@musafir_user_profile');
        if (raw) {
          const data = JSON.parse(raw);
          if (data.preferredAudio) setPreferredAudio(mapLanguageToLabel(data.preferredAudio));
          if (data.voiceGender) setVoiceGender(data.voiceGender);
          if (data.voice) setVoice(data.voice);
          if (data.interests && Array.isArray(data.interests) && data.interests.length > 0) {
            setSelectedMoods(data.interests);
          }
        }
      } catch {
        // Non-critical background read
      }
    }
    loadAudioPreferences();
  }, []);

  // Expand bottom sheet when user focuses on either source or destination input
  const handleFocusField = useCallback(() => {
    if (currentHeightRef.current < EXPANDED_SHEET_HEIGHT - 30) {
      currentHeightRef.current = EXPANDED_SHEET_HEIGHT;
      Animated.spring(sheetHeight, {
        toValue: EXPANDED_SHEET_HEIGHT,
        useNativeDriver: false,
        friction: 8,
        tension: 48,
      }).start();
    }
  }, [sheetHeight]);

  // Select a source autocomplete suggestion
  const handleSelectSourceSuggestion = useCallback((suggestion: PlaceSuggestion) => {
    setSelectedSourceSuggestion(suggestion);
    setSourcePoint({ text: suggestion.primaryText, coords: null, isGps: false });
  }, []);

  // Select a destination autocomplete suggestion
  const handleSelectDestinationSuggestion = useCallback((suggestion: PlaceSuggestion) => {
    setSelectedSuggestion(suggestion);
    setDestinationPoint({ text: suggestion.primaryText, coords: null, isGps: false });
  }, []);

  // Handle route selection (via card or map polyline tap)
  const handleSelectRoute = useCallback(
    (index: number) => {
      Haptics.selectionAsync();
      setSelectedRouteIndex(index);
      selectedRouteIndexRef.current = index;
      const routes = availableRoutesRef.current.length > 0 ? availableRoutesRef.current : availableRoutes;
      const route = routes[index];
      if (route) {
        const points = decodedPointsMap[route.id] || decodePolyline(route.polyline);
        if (points.length > 0) {
          const destCoord = points[points.length - 1];
          setDestinationPoint((prev) => ({ ...prev, coords: destCoord }));
          mapRef.current?.fitToCoordinates(points, {
            edgePadding: { top: 90, right: 60, bottom: 260, left: 60 },
            animated: true,
          });
        }
      }
    },
    [availableRoutes, decodedPointsMap]
  );

  // Start trip via POST /trips
  const handleStartTrip = useCallback(async () => {
    if (!selectedSuggestion) {
      Alert.alert('Choose a destination', 'Pick a destination from the suggestions first.');
      return;
    }
    const origin = selectedSourceSuggestion
      ? { placeId: selectedSourceSuggestion.placeId, label: selectedSourceSuggestion.primaryText }
      : sourcePoint.isGps && deviceGpsCoords
      ? { lat: deviceGpsCoords.latitude, lng: deviceGpsCoords.longitude, label: 'Current location' }
      : sourcePoint.coords
      ? { lat: sourcePoint.coords.latitude, lng: sourcePoint.coords.longitude, label: sourcePoint.text }
      : null;

    if (!origin) {
      Alert.alert('No starting point', 'Enable GPS or choose a starting location.');
      return;
    }

    try {
      setIsStartingTrip(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const currentIndex = selectedRouteIndexRef.current;
      const currentRoutes = availableRoutesRef.current.length > 0 ? availableRoutesRef.current : availableRoutes;
      const chosenRoute = currentRoutes[currentIndex];
      console.log(`[handleStartTrip] Starting trip with route #${currentIndex}:`, chosenRoute?.description, chosenRoute?.distanceM);
      const { tripId } = await startTrip({
        origin,
        destination: { placeId: selectedSuggestion.placeId, label: selectedSuggestion.primaryText },
        selectedRoute: chosenRoute
          ? {
              polyline: chosenRoute.polyline,
              distanceM: chosenRoute.distanceM,
              durationS: chosenRoute.durationS,
              description: chosenRoute.description,
            }
          : undefined,
        prefs: {
          language: mapLanguage(preferredAudio),
          voiceGender,
          voice,
          interests: selectedMoods,
        },
      });
      router.push(`/trip/${tripId}`);
    } catch (err: any) {
      const code = err?.response?.data?.error?.code ?? '';
      const details = err?.response?.data?.error?.details;
      if (code === 'TRIP_IN_PROGRESS' && details?.tripId) {
        Alert.alert(
          'Trip In Progress',
          'You have a trip already being built. Opening it now.',
          [{ text: 'Open', onPress: () => router.push(`/trip/${details.tripId}`) }]
        );
      } else if (code === 'TRIP_LIMIT_REACHED') {
        Alert.alert('Limit Reached', 'You have started too many trips today. Try again later.');
      } else if (code === 'ROUTE_NOT_FOUND') {
        Alert.alert('No Route', 'Could not find a drivable route to that destination.');
      } else if (code === 'ROUTE_TOO_LONG') {
        Alert.alert('Route Too Long', 'That destination is more than 1,200 km away.');
      } else if (code === 'PROFILE_NOT_FOUND') {
        router.replace('/(onboarding)');
      } else if (code === 'UPSTREAM_UNAVAILABLE') {
        Alert.alert('Service Unavailable', 'Our routing service is temporarily down. Please try again.');
      } else {
        Alert.alert('Could not start trip', err?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setIsStartingTrip(false);
    }
  }, [
    selectedSuggestion,
    selectedSourceSuggestion,
    sourcePoint,
    deviceGpsCoords,
    availableRoutes,
    selectedRouteIndex,
    preferredAudio,
    voiceGender,
    voice,
    selectedMoods,
    router,
  ]);

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
          latitude: getVisibleCenterLatitude(current.latitude, 0.018),
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
          latitude: getVisibleCenterLatitude(deviceGpsCoords.latitude, 0.015, currentHeightRef.current),
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

    setSelectedSourceSuggestion(null);
    const nextSource: LocationPoint = {
      text: deviceGpsAddress,
      coords: deviceGpsCoords,
      isGps: true,
    };
    setSourcePoint(nextSource);

    if (deviceGpsCoords && destinationPoint.coords) {
      mapRef.current?.fitToCoordinates([deviceGpsCoords, destinationPoint.coords], {
        edgePadding: { top: 90, right: 60, bottom: 280, left: 60 },
        animated: true,
      });
    } else if (deviceGpsCoords) {
      mapRef.current?.animateToRegion(
        {
          latitude: getVisibleCenterLatitude(deviceGpsCoords.latitude, 0.015, currentHeightRef.current),
          longitude: deviceGpsCoords.longitude,
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

    setSelectedSuggestion(null);
    const nextDest: LocationPoint = {
      text: deviceGpsAddress,
      coords: deviceGpsCoords,
      isGps: true,
    };
    setDestinationPoint(nextDest);

    if (sourcePoint.coords && deviceGpsCoords) {
      mapRef.current?.fitToCoordinates([sourcePoint.coords, deviceGpsCoords], {
        edgePadding: { top: 90, right: 60, bottom: 280, left: 60 },
        animated: true,
      });
    } else if (deviceGpsCoords) {
      mapRef.current?.animateToRegion(
        {
          latitude: getVisibleCenterLatitude(deviceGpsCoords.latitude, 0.015, currentHeightRef.current),
          longitude: deviceGpsCoords.longitude,
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
    const prevSourceSug = selectedSourceSuggestion;
    const prevDestSug = selectedSuggestion;

    setSourcePoint(newSource);
    setDestinationPoint(newDestination);
    setSelectedSourceSuggestion(prevDestSug);
    setSelectedSuggestion(prevSourceSug);
    setAvailableRoutes([]);

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

  // Clear source input
  const handleClearSource = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSourcePoint({
      text: '',
      coords: null,
      isGps: false,
    });
    setSelectedSourceSuggestion(null);
    setAvailableRoutes([]);
    if (destinationPoint.coords) {
      mapRef.current?.animateToRegion(
        {
          ...destinationPoint.coords,
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
    setSelectedSuggestion(null);
    setAvailableRoutes([]);
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

  // Automatically fetch route alternatives when both source and destination are set
  useEffect(() => {
    let isCancelled = false;

    if (!selectedSuggestion) {
      setAvailableRoutes([]);
      return;
    }

    const origin = selectedSourceSuggestion
      ? { placeId: selectedSourceSuggestion.placeId }
      : sourcePoint.coords
      ? { lat: sourcePoint.coords.latitude, lng: sourcePoint.coords.longitude }
      : sourcePoint.isGps && deviceGpsCoords
      ? { lat: deviceGpsCoords.latitude, lng: deviceGpsCoords.longitude }
      : null;

    if (!origin) return;

    async function loadRoutes() {
      try {
        setIsLoadingRoutes(true);
        const routes = await previewRoutes({
          origin: origin!,
          destination: { placeId: selectedSuggestion!.placeId },
        });
        if (isCancelled) return;
        setAvailableRoutes(routes);
        setSelectedRouteIndex(0);

        if (routes.length > 0 && routes[0].polyline) {
          const points = decodePolyline(routes[0].polyline);
          if (points.length > 0) {
            setDestinationPoint((prev) => ({ ...prev, coords: points[points.length - 1] }));
            setSourcePoint((prev) => (prev.isGps ? prev : { ...prev, coords: points[0] }));
            mapRef.current?.fitToCoordinates(points, {
              edgePadding: { top: 90, right: 60, bottom: 260, left: 60 },
              animated: true,
            });
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('Could not preview routes:', err);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRoutes(false);
        }
      }
    }

    loadRoutes();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedSuggestion,
    selectedSourceSuggestion,
    sourcePoint.coords,
    sourcePoint.isGps,
    deviceGpsCoords,
  ]);

  // Handle Creator Pack preview tap
  const handleCreatorPackPress = (pack: CreatorPack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      pack.title,
      `Curated by ${pack.creatorName}\n${pack.storiesCount} geo-tagged audio stories • ${pack.duration}\n\nAudio stories will automatically trigger as you navigate along this route!`
    );
  };

  const currentRegion = {
    latitude: getVisibleCenterLatitude(
      sourcePoint.coords?.latitude ?? deviceGpsCoords?.latitude ?? DEFAULT_COORDS.latitude,
      DEFAULT_COORDS.latitudeDelta
    ),
    longitude: sourcePoint.coords?.longitude ?? deviceGpsCoords?.longitude ?? DEFAULT_COORDS.longitude,
    latitudeDelta: DEFAULT_COORDS.latitudeDelta,
    longitudeDelta: DEFAULT_COORDS.longitudeDelta,
  };

  const displayedTrips = showAllDestinations
    ? recentTrips
    : recentTrips.slice(0, 3);

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
          showsMyLocationButton={false}
          onPress={() => {
            Keyboard.dismiss();
            searchRef.current?.dismissSuggestions();
          }}>
          {/* SOURCE MARKER */}
          {sourcePoint.coords && (
            <Marker
              coordinate={sourcePoint.coords}
              title={sourcePoint.text || 'Starting point'}
              anchor={{ x: 0.5, y: sourcePoint.isGps ? 0.5 : 1 }}
              centerOffset={{ x: 0, y: 0 }}>
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
              centerOffset={{ x: 0, y: 0 }}>
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

          {/* ROUTE ALTERNATIVES POLYLINES (BACKGROUND / UNSELECTED) */}
          {availableRoutes.map((route, index) => {
            if (index === selectedRouteIndex) return null;
            const points = decodedPointsMap[route.id] || [];
            if (points.length === 0) return null;
            return (
              <Polyline
                key={route.id}
                coordinates={points}
                strokeColor={isDark ? '#7BAAF7' : '#8AB4F8'}
                strokeWidth={5}
                zIndex={2}
                tappable={true}
                onPress={() => {
                  handleSelectRoute(index);
                }}
              />
            );
          })}

          {/* SELECTED ACTIVE ROUTE POLYLINE (ON TOP) */}
          {availableRoutes.length > 0 && availableRoutes[selectedRouteIndex] && (
            <Polyline
              key={`selected_${availableRoutes[selectedRouteIndex].id}`}
              coordinates={decodedPointsMap[availableRoutes[selectedRouteIndex].id] || []}
              strokeColor="#1A73E8"
              strokeWidth={6}
              zIndex={10}
            />
          )}

          {/* FALLBACK STRAIGHT LINE IF NO ROUTES LOADED YET */}
          {availableRoutes.length === 0 && sourcePoint.coords && destinationPoint.coords && (
            <Polyline
              coordinates={[sourcePoint.coords, destinationPoint.coords]}
              strokeColor="#1A73E8"
              strokeWidth={4}
            />
          )}

          {/* FLOATING ROUTE DURATION & DISTANCE BADGES ON THE MAP */}
          {availableRoutes.map((route, index) => {
            const points = decodedPointsMap[route.id] || [];
            if (points.length === 0) return null;
            const badgeCoord = getRouteBadgeCoord(points, index, availableRoutes.length);
            if (!badgeCoord) return null;

            const isSelected = index === selectedRouteIndex;
            const durationMin = Math.max(1, Math.round(route.durationS / 60));
            const distanceKm = (route.distanceM / 1000).toFixed(1);

            return (
              <Marker
                key={`badge_${route.id}`}
                coordinate={badgeCoord}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={isSelected ? 50 : 30}
                tracksViewChanges={false}
                onPress={() => handleSelectRoute(index)}>
                <View
                  style={[
                    styles.mapRouteBadge,
                    isSelected
                      ? styles.mapRouteBadgeSelected
                      : [
                          styles.mapRouteBadgeUnselected,
                          {
                            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                            borderColor: isDark ? '#7BAAF7' : '#93C5FD',
                          },
                        ],
                  ]}>
                  <Ionicons
                    name="car"
                    size={12}
                    color={isSelected ? '#FFFFFF' : isDark ? '#93C5FD' : '#1A73E8'}
                  />
                  <Text
                    style={[
                      styles.mapRouteBadgeDuration,
                      { color: isSelected ? '#FFFFFF' : isDark ? '#F1F5F9' : '#1E293B' },
                    ]}>
                    {durationMin} min
                  </Text>
                  <Text
                    style={[
                      styles.mapRouteBadgeDot,
                      { color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
                    ]}>
                    •
                  </Text>
                  <Text
                    style={[
                      styles.mapRouteBadgeDistance,
                      { color: isSelected ? 'rgba(255,255,255,0.9)' : colors.textSecondary },
                    ]}>
                    {distanceKm} km
                  </Text>
                </View>
              </Marker>
            );
          })}
        </MapView>

        {/* TOP FLOATING BRAND BAR */}
        <SafeAreaView edges={['top']} style={styles.floatingTopBar}>
          <Pressable
            onPress={() => checkServerHealth(true)}
            style={({ pressed }) => [
              styles.brandPill,
              {
                backgroundColor: colors.floatingPill,
                borderColor: colors.floatingPillBorder,
                borderWidth: isDark ? 1 : 0,
                opacity: pressed ? 0.8 : 1,
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
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    serverHealth === 'online'
                      ? '#34C759'
                      : serverHealth === 'checking'
                      ? '#FF9500'
                      : '#FF3B30',
                },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    serverHealth === 'online'
                      ? colors.textSecondary
                      : serverHealth === 'checking'
                      ? '#FF9500'
                      : '#FF3B30',
                },
              ]}>
              {serverHealth === 'online'
                ? 'Ready'
                : serverHealth === 'checking'
                ? 'Connecting...'
                : 'Offline'}
            </Text>
          </Pressable>
        </SafeAreaView>

        {/* FLOATING ROUTE SUMMARY BAR ON MAP */}
        {availableRoutes.length > 0 && availableRoutes[selectedRouteIndex] && (
          <Animated.View
            style={[
              styles.floatingRouteBarWrapper,
              { bottom: Animated.add(sheetHeight, 14) },
            ]}>
            <Pressable
              onPress={() => {
                if (availableRoutes.length > 1) {
                  const nextIdx = (selectedRouteIndex + 1) % availableRoutes.length;
                  handleSelectRoute(nextIdx);
                }
              }}
              style={({ pressed }) => [
                styles.floatingRouteBar,
                {
                  backgroundColor: colors.sheetBg,
                  borderColor: colors.cardBorder,
                  borderWidth: isDark ? 1 : 0,
                },
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.floatingRouteBarLeft}>
                <View
                  style={[
                    styles.floatingRouteBarIconCircle,
                    { backgroundColor: isDark ? '#1E293B' : '#EBF3FF' },
                  ]}>
                  <Ionicons name="navigate" size={13} color="#1A73E8" />
                </View>
                <View style={styles.floatingRouteBarTexts}>
                  <View style={styles.floatingRouteBarMainRow}>
                    <Text style={[styles.floatingRouteBarDuration, { color: colors.text }]}>
                      {Math.max(1, Math.round(availableRoutes[selectedRouteIndex].durationS / 60))} min
                    </Text>
                    <Text style={[styles.floatingRouteBarDistance, { color: colors.textSecondary }]}>
                      • {(availableRoutes[selectedRouteIndex].distanceM / 1000).toFixed(1)} km
                    </Text>
                  </View>
                  {availableRoutes[selectedRouteIndex].description ? (
                    <Text
                      style={[styles.floatingRouteBarDesc, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      via {availableRoutes[selectedRouteIndex].description}
                    </Text>
                  ) : null}
                </View>
              </View>
              {availableRoutes.length > 1 && (
                <View
                  style={[
                    styles.floatingRouteCountPill,
                    { backgroundColor: isDark ? '#222328' : '#F2F2F7' },
                  ]}>
                  <Text style={[styles.floatingRouteCountText, { color: colors.accent }]}>
                    Option {selectedRouteIndex + 1}/{availableRoutes.length}
                  </Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}

        {/* FLOATING RE-CENTER BUTTON */}
        <Animated.View
          style={[
            styles.recenterButtonWrapper,
            { bottom: Animated.add(sheetHeight, 14) },
          ]}>
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
        </Animated.View>
      </View>

      {/* DRAGGABLE THEMED BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: sheetHeight,
            backgroundColor: colors.sheetBg,
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
          {/* SOURCE-DESTINATION SEARCH COMPONENT */}
          <SourceDestinationSearch
            ref={searchRef}
            sourcePoint={sourcePoint}
            destinationPoint={destinationPoint}
            deviceGpsCoords={deviceGpsCoords}
            preferredAudio={preferredAudio}
            voice={voice}
            onPressAudioPreference={() => setIsAudioModalVisible(true)}
            selectedMoods={selectedMoods}
            onPressMoodPreference={() => setIsMoodModalVisible(true)}
            onSourceTextChange={(text) => {
              setSelectedSourceSuggestion(null);
              setSourcePoint({ text, coords: null, isGps: false });
            }}
            onDestinationTextChange={(text) => {
              setSelectedSuggestion(null);
              setDestinationPoint({ text, coords: null, isGps: false });
            }}
            onSelectSourceSuggestion={handleSelectSourceSuggestion}
            onSelectDestinationSuggestion={handleSelectDestinationSuggestion}
            onSetSourceToGps={handleSetSourceToGps}
            onSetDestinationToGps={handleSetDestinationToGps}
            onClearSource={handleClearSource}
            onClearDestination={handleClearDestination}
            onSwapLocations={handleSwapLocations}
            onFocusField={handleFocusField}
          />

          {/* ROUTE LOADING STATE */}
          {isLoadingRoutes && (
            <View style={[styles.routeLoadingCard, { backgroundColor: colors.surfaceAlt }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.routeLoadingText, { color: colors.textSecondary }]}>
                Finding best routes...
              </Text>
            </View>
          )}

          {/* START TRIP BUTTON */}
          {selectedSuggestion && (
            <Pressable
              style={({ pressed }) => [
                styles.startTripButton,
                pressed && styles.buttonPressed,
                isStartingTrip && { opacity: 0.7 },
              ]}
              onPress={handleStartTrip}
              disabled={isStartingTrip}>
              {isStartingTrip ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="navigate" size={18} color="#FFFFFF" />
                  <Text style={styles.startTripText}>Start Trip</Text>
                </>
              )}
            </Pressable>
          )}

          {/* RECENT TRIPS SECTION */}
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Recent Trips
              </Text>
              {recentTrips.length > 3 && (
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
              )}
            </View>

            {isLoadingRecent && (
              <View style={styles.emptyState}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
              </View>
            )}

            {!isLoadingRecent && recentTrips.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="map-outline" size={28} color={colors.placeholder} />
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                  No trips yet — start one above!
                </Text>
              </View>
            )}

            {displayedTrips.map((trip) => {
              const km = trip.route?.distanceM
                ? `${(trip.route.distanceM / 1000).toFixed(0)} km`
                : '';
              const mins = trip.route?.durationS
                ? trip.route.durationS < 3600
                  ? `${Math.round(trip.route.durationS / 60)} min`
                  : `${(trip.route.durationS / 3600).toFixed(1)} h`
                : '';
              const statusColor =
                trip.status === 'ready'
                  ? '#34C759'
                  : trip.status === 'building'
                  ? '#FF9500'
                  : '#FF3B30';

              return (
                <Pressable
                  key={trip.id}
                  style={({ pressed }) => [
                    styles.recentRow,
                    { borderBottomColor: colors.rowBorder },
                    pressed && styles.recentRowPressed,
                  ]}
                  onPress={() => router.push(`/trip/${trip.id}`)}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="navigate-outline" size={18} color={colors.text} />
                  </View>
                  <View style={styles.placeDetails}>
                    <Text style={[styles.placeTitle, { color: colors.text }]} numberOfLines={1}>
                      {trip.destination.label}
                    </Text>
                    <Text
                      style={[styles.placeAddress, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {trip.origin.label}
                    </Text>
                  </View>
                  <View style={styles.distanceBadge}>
                    <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
                    <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                      {km}{km && mins ? ' · ' : ''}{mins}
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

      {/* AUDIO LANGUAGE & VOICE SELECTION MODAL */}
      <AudioLanguageSheetModal
        visible={isAudioModalVisible}
        onClose={() => setIsAudioModalVisible(false)}
        initialLanguage={preferredAudio}
        initialGender={voiceGender}
        initialVoice={voice}
        onApply={async (selection) => {
          setPreferredAudio(selection.language);
          setVoiceGender(selection.voiceGender);
          setVoice(selection.voice);
          setIsAudioModalVisible(false);

          try {
            const raw = await AsyncStorage.getItem('@musafir_user_profile');
            const existing = raw ? JSON.parse(raw) : {};
            const updated = {
              ...existing,
              preferredAudio: selection.language,
              voiceGender: selection.voiceGender,
              voice: selection.voice,
            };
            await AsyncStorage.setItem('@musafir_user_profile', JSON.stringify(updated));
            updateProfileOnBackend(updated).catch(() => {});
          } catch (err) {
            console.warn('[HomeScreen] Failed to save updated audio preference:', err);
          }
        }}
      />

      {/* MOOD SELECTION MODAL */}
      <MoodSelectSheetModal
        visible={isMoodModalVisible}
        onClose={() => setIsMoodModalVisible(false)}
        selectedMoods={selectedMoods}
        onApply={async (moods) => {
          setSelectedMoods(moods);
          setIsMoodModalVisible(false);

          try {
            const raw = await AsyncStorage.getItem('@musafir_user_profile');
            const existing = raw ? JSON.parse(raw) : {};
            const updated = {
              ...existing,
              interests: moods,
            };
            await AsyncStorage.setItem('@musafir_user_profile', JSON.stringify(updated));
            updateProfileOnBackend(updated).catch(() => {});
          } catch (err) {
            console.warn('[HomeScreen] Failed to save updated mood preferences:', err);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    ...StyleSheet.absoluteFill,
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
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Re-center button wrapper & button
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 16,
    zIndex: 20,
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


  // Start trip button
  startTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  startTripText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },

  // Recent Trips Section
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

  // Route selection & loading
  routeLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  routeLoadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Floating Route Badges on Map
  mapRouteBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 5,
    elevation: 8,
  },
  mapRouteBadgeSelected: {
    backgroundColor: '#1A73E8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  mapRouteBadgeUnselected: {
    borderWidth: 1.5,
  },
  mapRouteBadgeDuration: {
    fontSize: 12,
    fontWeight: '700',
  },
  mapRouteBadgeDot: {
    fontSize: 10,
  },
  mapRouteBadgeDistance: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Floating Route Info Bar above bottom sheet
  floatingRouteBarWrapper: {
    position: 'absolute',
    left: 16,
    right: 72,
    zIndex: 25,
  },
  floatingRouteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  floatingRouteBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 6,
  },
  floatingRouteBarIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingRouteBarTexts: {
    flex: 1,
  },
  floatingRouteBarMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  floatingRouteBarDuration: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  floatingRouteBarDistance: {
    fontSize: 12,
    fontWeight: '500',
  },
  floatingRouteBarDesc: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  floatingRouteCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  floatingRouteCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
