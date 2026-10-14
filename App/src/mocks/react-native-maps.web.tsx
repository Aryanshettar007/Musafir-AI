import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, Text, ActivityIndicator, useColorScheme } from 'react-native';
import { darkMapStyle } from '@/constants/map-theme';
// @ts-ignore
import ReactDOM from 'react-dom';

declare global {
  interface Window {
    google?: any;
    initGoogleMapsWeb?: () => void;
    gm_authFailure?: () => void;
  }
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export const PROVIDER_DEFAULT = 'default';
export const PROVIDER_GOOGLE = 'google';

const MapContext = React.createContext<{
  map: any | null;
  mapsApi: any | null;
}>({ map: null, mapsApi: null });

function deltaToZoom(latitudeDelta: number, longitudeDelta: number): number {
  const delta = Math.max(longitudeDelta || 0.05, 0.0001);
  const zoom = Math.round(Math.log2(360 / delta));
  return Math.min(Math.max(zoom, 1), 20);
}

function zoomToDelta(zoom: number): { latitudeDelta: number; longitudeDelta: number } {
  const delta = 360 / Math.pow(2, zoom);
  return {
    latitudeDelta: delta * 0.7,
    longitudeDelta: delta,
  };
}

let scriptLoadingPromise: Promise<any> | null = null;

async function ensureGoogleMapsLoaded(mapsApi: any): Promise<any> {
  const api = mapsApi || (typeof window !== 'undefined' ? window.google?.maps : null);
  if (!api) return null;
  if (api.Map) {
    return api;
  }
  if (typeof api.importLibrary === 'function') {
    try {
      const { Map } = await api.importLibrary('maps');
      if (Map) {
        api.Map = Map;
      }
    } catch (e) {
      console.warn('Failed to import maps library:', e);
    }
  }
  return api;
}

function loadGoogleMapsScript(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const callbackName = '__musafirGoogleMapsLoaded';

    const finishLoading = async () => {
      try {
        const maps = await ensureGoogleMapsLoaded(window.google?.maps);
        if (maps?.Map) {
          resolve(maps);
        } else {
          scriptLoadingPromise = null;
          reject(new Error('Google Maps script loaded, but google.maps.Map is not available.'));
        }
      } catch (err) {
        scriptLoadingPromise = null;
        reject(err);
      } finally {
        try {
          delete (window as any)[callbackName];
        } catch {}
      }
    };

    (window as any)[callbackName] = finishLoading;

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
      } else {
        existingScript.addEventListener('load', finishLoading);
        existingScript.addEventListener('error', (err) => {
          scriptLoadingPromise = null;
          reject(err);
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = (err) => {
      scriptLoadingPromise = null;
      console.warn('Failed to load Google Maps script on web:', err);
      reject(err);
    };
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

export interface MapViewProps {
  children?: React.ReactNode;
  style?: any;
  initialRegion?: Region;
  region?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: (event: { nativeEvent: { coordinate: LatLng } }) => void;
  customMapStyle?: any[];
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  showsCompass?: boolean;
  [key: string]: any;
}

export const MapView = forwardRef<any, MapViewProps>((props, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapInstance, setMapInstance] = useState<any | null>(null);
  const [mapsApi, setMapsApi] = useState<any | null>(null);
  const [authError, setAuthError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const effectiveStyles =
    props.customMapStyle !== undefined
      ? props.customMapStyle
      : (isDark ? darkMapStyle : []);

  const apiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : '') ||
    '';

  // Handle Google Maps Auth Failure hook
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.gm_authFailure = () => {
        console.warn('Google Maps Web Authentication Failure (Billing/Key configuration needed)');
        setAuthError(true);
      };
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    let isMounted = true;

    loadGoogleMapsScript(apiKey)
      .then((googleMaps) => {
        if (!isMounted || !containerRef.current || !googleMaps) return;

        setMapsApi(googleMaps);

        const initialLat = props.region?.latitude ?? props.initialRegion?.latitude ?? 28.6139;
        const initialLng = props.region?.longitude ?? props.initialRegion?.longitude ?? 77.209;
        const initialZoom = deltaToZoom(
          props.region?.latitudeDelta ?? props.initialRegion?.latitudeDelta ?? 0.05,
          props.region?.longitudeDelta ?? props.initialRegion?.longitudeDelta ?? 0.05
        );

        const map = new googleMaps.Map(containerRef.current, {
          center: { lat: initialLat, lng: initialLng },
          zoom: initialZoom,
          styles: effectiveStyles,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        // Click listener
        map.addListener('click', (e: any) => {
          if (props.onPress && e?.latLng) {
            props.onPress({
              nativeEvent: {
                coordinate: {
                  latitude: e.latLng.lat(),
                  longitude: e.latLng.lng(),
                },
              },
            });
          }
        });

        // Idle / Region change listener
        map.addListener('idle', () => {
          if (props.onRegionChangeComplete) {
            const center = map.getCenter();
            const zoom = map.getZoom() || 14;
            const deltas = zoomToDelta(zoom);
            if (center) {
              props.onRegionChangeComplete({
                latitude: center.lat(),
                longitude: center.lng(),
                ...deltas,
              });
            }
          }
        });

        setMapInstance(map);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Google Maps script error:', err);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Update styles dynamically when theme or customMapStyle changes
  useEffect(() => {
    if (mapInstance) {
      mapInstance.setOptions({ styles: effectiveStyles });
    }
  }, [mapInstance, effectiveStyles]);

  // Imperative Ref API (animateToRegion, fitToCoordinates, etc.)
  useImperativeHandle(
    ref,
    () => ({
      animateToRegion: (region: Region, _duration?: number) => {
        if (!mapInstance || !region) return;
        const zoom = deltaToZoom(region.latitudeDelta, region.longitudeDelta);
        mapInstance.panTo({ lat: region.latitude, lng: region.longitude });
        mapInstance.setZoom(zoom);
      },
      fitToCoordinates: (
        coordinates: LatLng[],
        options?: { edgePadding?: { top?: number; right?: number; bottom?: number; left?: number }; animated?: boolean }
      ) => {
        if (!mapInstance || !mapsApi || !coordinates || coordinates.length === 0) return;
        const bounds = new mapsApi.LatLngBounds();
        coordinates.forEach((coord) => {
          if (coord && typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
            bounds.extend({ lat: coord.latitude, lng: coord.longitude });
          }
        });
        const padding = options?.edgePadding
          ? {
              top: options.edgePadding.top || 40,
              right: options.edgePadding.right || 40,
              bottom: options.edgePadding.bottom || 40,
              left: options.edgePadding.left || 40,
            }
          : 40;
        mapInstance.fitBounds(bounds, padding);
      },
      animateCamera: (camera: any) => {
        if (!mapInstance || !camera?.center) return;
        mapInstance.panTo({ lat: camera.center.latitude, lng: camera.center.longitude });
      },
    }),
    [mapInstance, mapsApi]
  );

  return (
    <View style={[styles.container, props.style]}>
      {/* Real Google Maps Web Canvas */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />

      {/* Loading overlay */}
      {loading && (
        <View style={styles.centerOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.overlayText}>Loading Google Maps...</Text>
        </View>
      )}

      {/* Auth / Billing Notice Banner */}
      {authError && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Google Maps Configuration Notice</Text>
          <Text style={styles.bannerText}>
            Billing or Maps SDK for this API key is pending in Google Cloud Console. Enable billing on your Google Cloud project to display tiles without restrictions.
          </Text>
        </View>
      )}

      {/* Render Markers & Polylines via Context */}
      <MapContext.Provider value={{ map: mapInstance, mapsApi }}>
        {props.children}
      </MapContext.Provider>
    </View>
  );
});

// MARKER COMPONENT
export interface MarkerProps {
  coordinate: LatLng;
  title?: string;
  children?: React.ReactNode;
  anchor?: { x: number; y: number };
  onPress?: () => void;
  style?: any;
}

export const Marker: React.FC<MarkerProps> = ({
  coordinate,
  title,
  children,
  onPress,
}) => {
  const { map, mapsApi } = useContext(MapContext);
  const [overlayDiv, setOverlayDiv] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map || !mapsApi || !coordinate) return;

    if (children) {
      // Use Custom HTML Overlay for React Native children (Pins, Callouts, Icons)
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.cursor = 'pointer';
      div.style.transform = 'translate(-50%, -100%)';
      div.style.zIndex = '10';

      const OverlayViewClass = mapsApi.OverlayView;
      const overlay = new OverlayViewClass();

      overlay.onAdd = function () {
        const panes = this.getPanes();
        panes?.overlayMouseTarget?.appendChild(div);
      };

      overlay.draw = function () {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(
          new mapsApi.LatLng(coordinate.latitude, coordinate.longitude)
        );
        if (point) {
          div.style.left = `${point.x}px`;
          div.style.top = `${point.y}px`;
        }
      };

      overlay.onRemove = function () {
        div.remove();
      };

      overlay.setMap(map);
      setOverlayDiv(div);

      if (onPress) {
        div.onclick = (e) => {
          e.stopPropagation();
          (onPress as any)({
            nativeEvent: e,
            stopPropagation: () => e.stopPropagation(),
          });
        };
      }

      return () => {
        overlay.setMap(null);
        div.remove();
      };
    } else {
      // Standard Google Maps Marker
      const marker = new mapsApi.Marker({
        position: { lat: coordinate.latitude, lng: coordinate.longitude },
        map,
        title: title || '',
      });

      if (onPress) {
        marker.addListener('click', (e: any) => {
          (onPress as any)({
            nativeEvent: e,
            stopPropagation: () => {},
          });
        });
      }

      return () => {
        marker.setMap(null);
      };
    }
  }, [map, mapsApi, coordinate?.latitude, coordinate?.longitude, Boolean(children)]);

  if (children && overlayDiv) {
    return ReactDOM.createPortal(children, overlayDiv);
  }

  return null;
};

// POLYLINE COMPONENT
export interface PolylineProps {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export const Polyline: React.FC<PolylineProps> = ({
  coordinates,
  strokeColor = '#007AFF',
  strokeWidth = 4,
  strokeOpacity = 0.8,
}) => {
  const { map, mapsApi } = useContext(MapContext);

  useEffect(() => {
    if (!map || !mapsApi || !coordinates || coordinates.length === 0) return;

    const path = coordinates.map((c) => ({
      lat: c.latitude,
      lng: c.longitude,
    }));

    const polyline = new mapsApi.Polyline({
      path,
      strokeColor,
      strokeWeight: strokeWidth,
      strokeOpacity,
      map,
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, mapsApi, coordinates, strokeColor, strokeWidth, strokeOpacity]);

  return null;
};

export const Polygon: React.FC<any> = () => null;
export const Circle: React.FC<any> = () => null;
export const Callout: React.FC<any> = ({ children }) => <>{children}</>;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    position: 'relative',
    overflow: 'hidden',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    gap: 8,
  },
  overlayText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  banner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    borderRadius: 12,
    padding: 12,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerText: {
    color: '#fee2e2',
    fontSize: 11,
    lineHeight: 15,
  },
});

export default MapView;
