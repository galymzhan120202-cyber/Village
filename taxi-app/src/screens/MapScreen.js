import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform,
} from 'react-native';
import MapView, { Marker, UrlTile, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { driverAPI } from '../services/api';

const INITIAL_REGION = {
  latitude:  48.0196,
  longitude: 66.9237,
  latitudeDelta:  8.0,
  longitudeDelta: 8.0,
};

export default function MapScreen() {
  const mapRef = useRef(null);
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [userLoc, setUserLoc]   = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    requestLocation();
    loadDrivers();
    const interval = setInterval(loadDrivers, 30000);
    return () => clearInterval(interval);
  }, []);

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setUserLoc(loc.coords);
    mapRef.current?.animateToRegion(
      {
        latitude:      loc.coords.latitude,
        longitude:     loc.coords.longitude,
        latitudeDelta:  0.1,
        longitudeDelta: 0.1,
      },
      800,
    );
  }

  async function loadDrivers() {
    try {
      const res = await driverAPI.onlineDrivers();
      const withCoords = res.data.filter((d) => d.lat !== 0 && d.lon !== 0);
      setDrivers(withCoords);
      setLastUpdate(new Date().toLocaleTimeString('kk-KZ'));
    } catch (e) {
      console.error('Drivers load error:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        showsMyLocationButton={Platform.OS === 'android'}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
          shouldReplaceMapContent
        />

        {/* Жұмыстағы жүргізушілер */}
        {drivers.map((d) => (
          <Marker
            key={d.user_id}
            coordinate={{ latitude: d.lat, longitude: d.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.carMarker}>
              <Text style={styles.carEmoji}>🚗</Text>
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{d.name}</Text>
                {d.car_info ? (
                  <Text style={styles.calloutCar}>🚘 {d.car_info}</Text>
                ) : null}
                <Text style={styles.calloutSeats}>💺 {d.current_seats} орын</Text>
                {d.village ? (
                  <Text style={styles.calloutVillage}>📍 {d.village}</Text>
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Жоғарғы ақпарат панелі */}
      <View style={styles.topPanel}>
        <View style={styles.topLeft}>
          <Text style={styles.topTitle}>Онлайн жүргізушілер</Text>
          {lastUpdate && (
            <Text style={styles.topSub}>🕐 {lastUpdate}</Text>
          )}
        </View>
        <View style={styles.topBadge}>
          <Text style={styles.topBadgeTxt}>
            🚗 {loading ? '...' : drivers.length}
          </Text>
        </View>
      </View>

      {/* Жаңарту батырмасы */}
      <TouchableOpacity
        style={styles.refreshBtn}
        onPress={() => { setLoading(true); loadDrivers(); }}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.refreshText}>🔄</Text>}
      </TouchableOpacity>

      {/* Менің орным батырмасы */}
      {Platform.OS === 'ios' && userLoc && (
        <TouchableOpacity
          style={styles.myLocBtn}
          onPress={() =>
            mapRef.current?.animateToRegion(
              {
                latitude:      userLoc.latitude,
                longitude:     userLoc.longitude,
                latitudeDelta:  0.05,
                longitudeDelta: 0.05,
              },
              600,
            )
          }
        >
          <Text style={styles.myLocText}>📍</Text>
        </TouchableOpacity>
      )}

      {drivers.length === 0 && !loading && (
        <View style={styles.noDrivers}>
          <Text style={{ fontSize: 18 }}>😔</Text>
          <Text style={styles.noDriversText}>Қазір онлайн жүргізуші жоқ</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  map:            { flex: 1 },

  topPanel: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(26,26,46,0.92)',
    paddingTop: Platform.OS === 'ios' ? 14 : 10,
    paddingBottom: 12, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topLeft:        {},
  topTitle:       { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  topSub:         { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 },
  topBadge:       {
    backgroundColor: 'rgba(255,107,53,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)',
  },
  topBadgeTxt:    { color: '#FF6B35', fontWeight: '800', fontSize: 13 },

  refreshBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 76 : 66,
    right: 14, width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 8,
  },
  refreshText: { fontSize: 18 },

  myLocBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 132 : 122, right: 14,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
  },
  myLocText: { fontSize: 20 },

  carMarker: {
    backgroundColor: '#1a1a2e', borderRadius: 22,
    padding: 6, borderWidth: 2, borderColor: '#FF6B35',
    elevation: 4,
    shadowColor: '#FF6B35', shadowOpacity: 0.3, shadowRadius: 4,
  },
  carEmoji: { fontSize: 20 },

  callout: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 14, minWidth: 160,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
  },
  calloutName:    { fontWeight: '800', fontSize: 15, color: '#1a1a2e', marginBottom: 4 },
  calloutCar:     { color: '#6B7280', fontSize: 12, marginTop: 2 },
  calloutSeats:   { color: '#FF6B35', fontSize: 13, marginTop: 4, fontWeight: '700' },
  calloutVillage: { color: '#3B82F6', fontSize: 12, marginTop: 2 },

  noDrivers: {
    position: 'absolute', bottom: 32, left: 24, right: 24,
    backgroundColor: '#1a1a2e', borderRadius: 18,
    padding: 16, alignItems: 'center', elevation: 6,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  noDriversText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
});
