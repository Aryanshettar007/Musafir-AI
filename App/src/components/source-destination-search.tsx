import React, {
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPlaceAutocomplete, PlaceSuggestion } from '@/services/trip-service';
import { AudioPreferenceBadge } from '@/components/audio-preference-badge';

export interface LocationPoint {
  text: string;
  coords: { latitude: number; longitude: number } | null;
  isGps: boolean;
  placeId?: string;
}

export interface SourceDestinationSearchRef {
  dismissSuggestions: () => void;
}

export interface SourceDestinationSearchProps {
  sourcePoint: LocationPoint;
  destinationPoint: LocationPoint;
  deviceGpsCoords: { latitude: number; longitude: number } | null;
  preferredAudio?: string;
  voice?: string;
  onPressAudioPreference?: () => void;
  onSourceTextChange: (text: string) => void;
  onDestinationTextChange: (text: string) => void;
  onSelectSourceSuggestion: (suggestion: PlaceSuggestion) => void;
  onSelectDestinationSuggestion: (suggestion: PlaceSuggestion) => void;
  onSetSourceToGps: () => void;
  onSetDestinationToGps: () => void;
  onClearSource: () => void;
  onClearDestination: () => void;
  onSwapLocations: () => void;
  onFocusField?: (field: 'source' | 'destination') => void;
  style?: StyleProp<ViewStyle>;
}

export const SourceDestinationSearch = forwardRef<
  SourceDestinationSearchRef,
  SourceDestinationSearchProps
>(function SourceDestinationSearch(
  {
    sourcePoint,
    destinationPoint,
    deviceGpsCoords,
    preferredAudio = 'English',
    voice = 'Nalini',
    onPressAudioPreference,
    onSourceTextChange,
    onDestinationTextChange,
    onSelectSourceSuggestion,
    onSelectDestinationSuggestion,
    onSetSourceToGps,
    onSetDestinationToGps,
    onClearSource,
    onClearDestination,
    onSwapLocations,
    onFocusField,
    style,
  },
  ref
) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = {
    surfaceAlt: isDark ? '#1C1D22' : '#F4F4F6',
    sheetBg: isDark ? '#16171B' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#9BA1A6' : '#687076',
    placeholder: isDark ? '#6E7681' : '#8E8E93',
    divider: isDark ? '#2C2D35' : '#E5E5EA',
    cardBorder: isDark ? '#2A2B33' : '#E5E5EA',
    originDot: '#007AFF',
    destSquare: '#EA4335',
    accent: '#007AFF',
  };

  const [activeField, setActiveField] = useState<'source' | 'destination' | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [cardHeight, setCardHeight] = useState<number>(104);

  const autocompleteSessionToken = useRef<string>(Crypto.randomUUID());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSessionToken = useCallback(() => {
    autocompleteSessionToken.current = Crypto.randomUUID();
  }, []);

  const dismissSuggestions = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setActiveField(null);
    setAutocompleteResults([]);
    setIsSearching(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      dismissSuggestions,
    }),
    [dismissSuggestions]
  );

  // Search places for the active field
  const triggerSearch = useCallback(
    (text: string, field: 'source' | 'destination') => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      if (text.length < 2) {
        setAutocompleteResults([]);
        return;
      }

      debounceTimer.current = setTimeout(async () => {
        try {
          setIsSearching(true);
          const suggestions = await getPlaceAutocomplete({
            q: text,
            lat: deviceGpsCoords?.latitude,
            lng: deviceGpsCoords?.longitude,
            sessionToken: autocompleteSessionToken.current,
          });
          setActiveField(field);
          setAutocompleteResults(suggestions);
        } catch {
          setAutocompleteResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [deviceGpsCoords]
  );

  const handleSourceChange = useCallback(
    (text: string) => {
      onSourceTextChange(text);
      setActiveField('source');
      triggerSearch(text, 'source');
    },
    [onSourceTextChange, triggerSearch]
  );

  const handleDestinationChange = useCallback(
    (text: string) => {
      onDestinationTextChange(text);
      setActiveField('destination');
      triggerSearch(text, 'destination');
    },
    [onDestinationTextChange, triggerSearch]
  );

  const handleSourceFocus = useCallback(() => {
    refreshSessionToken();
    setActiveField('source');
    onFocusField?.('source');
    if (sourcePoint.text && sourcePoint.text.length >= 2 && !sourcePoint.isGps) {
      triggerSearch(sourcePoint.text, 'source');
    }
  }, [refreshSessionToken, onFocusField, sourcePoint.text, sourcePoint.isGps, triggerSearch]);

  const handleDestinationFocus = useCallback(() => {
    refreshSessionToken();
    setActiveField('destination');
    onFocusField?.('destination');
    if (destinationPoint.text && destinationPoint.text.length >= 2 && !destinationPoint.isGps) {
      triggerSearch(destinationPoint.text, 'destination');
    }
  }, [refreshSessionToken, onFocusField, destinationPoint.text, destinationPoint.isGps, triggerSearch]);

  const handleSelectSuggestion = useCallback(
    (suggestion: PlaceSuggestion) => {
      Haptics.selectionAsync();
      if (activeField === 'source') {
        onSelectSourceSuggestion(suggestion);
      } else {
        onSelectDestinationSuggestion(suggestion);
      }
      dismissSuggestions();
      refreshSessionToken();
    },
    [
      activeField,
      onSelectSourceSuggestion,
      onSelectDestinationSuggestion,
      dismissSuggestions,
      refreshSessionToken,
    ]
  );

  const handleClearSourceInternal = useCallback(() => {
    dismissSuggestions();
    onClearSource();
  }, [dismissSuggestions, onClearSource]);

  const handleClearDestinationInternal = useCallback(() => {
    dismissSuggestions();
    onClearDestination();
  }, [dismissSuggestions, onClearDestination]);

  const handleSwapInternal = useCallback(() => {
    dismissSuggestions();
    onSwapLocations();
  }, [dismissSuggestions, onSwapLocations]);

  const showSuggestions = activeField !== null && autocompleteResults.length > 0;

  return (
    <View style={[styles.wrapper, style]}>
      {/* SOURCE-DESTINATION CARD */}
      <View
        style={[styles.searchCard, { backgroundColor: colors.surfaceAlt }]}
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
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
              onChangeText={handleSourceChange}
              onFocus={handleSourceFocus}
              placeholder="Choose starting point"
              placeholderTextColor={colors.placeholder}
              returnKeyType="next"
              autoCapitalize="words"
            />
            {isSearching && activeField === 'source' && (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 6 }} />
            )}
            {!sourcePoint.isGps && (!isSearching || activeField !== 'source') && (
              <Pressable
                hitSlop={8}
                style={[
                  styles.inputActionBtn,
                  { backgroundColor: isDark ? '#2E3036' : '#EAEAEA' },
                ]}
                onPress={onSetSourceToGps}>
                <Ionicons name="navigate-circle-outline" size={17} color={colors.accent} />
                <Text style={[styles.resetGpsText, { color: colors.accent }]}>GPS</Text>
              </Pressable>
            )}
            {sourcePoint.text.length > 0 && (
              <Pressable
                hitSlop={8}
                style={[styles.inputActionBtn, { marginLeft: 4 }]}
                onPress={handleClearSourceInternal}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          <View style={[styles.inputDivider, { backgroundColor: colors.divider }]} />

          {/* DESTINATION / WHERE TO ROW */}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.textInput, styles.destinationInputText, { color: colors.text }]}
              value={destinationPoint.text}
              onChangeText={handleDestinationChange}
              onFocus={handleDestinationFocus}
              placeholder="Where to?"
              placeholderTextColor={colors.placeholder}
              returnKeyType="search"
              autoCapitalize="words"
            />
            {isSearching && activeField === 'destination' && (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 6 }} />
            )}
            {!destinationPoint.isGps && (!isSearching || activeField !== 'destination') && (
              <Pressable
                hitSlop={8}
                style={[
                  styles.inputActionBtn,
                  { backgroundColor: isDark ? '#2E3036' : '#EAEAEA' },
                ]}
                onPress={onSetDestinationToGps}>
                <Ionicons name="navigate-circle-outline" size={17} color={colors.accent} />
                <Text style={[styles.resetGpsText, { color: colors.accent }]}>GPS</Text>
              </Pressable>
            )}
            {destinationPoint.text.length > 0 && (
              <Pressable
                hitSlop={8}
                style={[styles.inputActionBtn, { marginLeft: 4 }]}
                onPress={handleClearDestinationInternal}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* PREFERRED AUDIO BADGE (BELOW DESTINATION) */}
          <AudioPreferenceBadge
            preferredAudio={preferredAudio}
            voice={voice}
            onPress={onPressAudioPreference}
          />
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
          onPress={handleSwapInternal}>
          <Ionicons name="swap-vertical" size={18} color={colors.text} />
        </Pressable>
      </View>

      {/* FLOATING OPTIONS OVERLAY (APPEARS ON TOP OF THE BELOW COMPONENT) */}
      {showSuggestions && (
        <View
          style={[
            styles.suggestionsOverlay,
            {
              top: cardHeight + 6,
              backgroundColor: colors.sheetBg,
              borderColor: colors.cardBorder,
            },
          ]}>
          {/* OVERLAY HEADER BADGE */}
          <View style={[styles.overlayHeader, { borderBottomColor: colors.divider }]}>
            <View
              style={[
                styles.overlayHeaderIndicator,
                { backgroundColor: activeField === 'source' ? colors.originDot : colors.destSquare },
              ]}
            />
            <Text style={[styles.overlayHeaderText, { color: colors.textSecondary }]}>
              {activeField === 'source' ? 'Starting Point Options' : 'Destination Options'}
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            style={styles.suggestionsScroll}
            showsVerticalScrollIndicator={false}>
            {autocompleteResults.map((s, index) => (
              <Pressable
                key={s.placeId}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  {
                    borderBottomColor: colors.divider,
                    borderBottomWidth:
                      index === autocompleteResults.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleSelectSuggestion(s)}>
                <View style={[styles.suggestionIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
                </View>
                <View style={styles.suggestionText}>
                  <Text style={[styles.suggestionPrimary, { color: colors.text }]} numberOfLines={1}>
                    {s.primaryText}
                  </Text>
                  <Text
                    style={[styles.suggestionSecondary, { color: colors.textSecondary }]}
                    numberOfLines={1}>
                    {s.secondaryText}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 100,
    marginTop: 4,
  },
  searchCard: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    alignItems: 'center',
  },
  connectorContainer: {
    alignItems: 'center',
    width: 20,
    marginRight: 10,
    paddingTop: 13,
    alignSelf: 'flex-start',
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
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginLeft: 8,
    alignSelf: 'flex-start',
    marginTop: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  buttonPressed: {
    opacity: 0.7,
  },

  // Floating autocomplete suggestions overlay
  suggestionsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 25,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  overlayHeaderIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overlayHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  suggestionsScroll: {
    maxHeight: 230,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  suggestionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionPrimary: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  suggestionSecondary: {
    fontSize: 12,
  },
});
