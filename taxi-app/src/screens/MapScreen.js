import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform,
} from 'react-native';
import MapView, { Marker, UrlTile, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { driverAPI } from '../services/api';

// Жаңабазар — Қазығұрт ауданы, Түркістан облысы
// Бейнеткеш, Көкібел, Қарабау, Жеңіс ауылдарын қамтитын аймақ
// latitudeDelta 0.05 = zoom ~14, үйлер анық көрінеді
const INITIAL_REGION = {
  latitude:  41.847,
  longitude: 69.694,
  latitudeDelta:  0.05,
  longitudeDelta: 0.05,
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
        <Text style={styles.topTitle}>
          🚗 Онлайн жүргізушілер: {loading ? '...' : drivers.length}
        </Text>
        {lastUpdate && (
          <Text style={styles.topSub}>Жаңартылды: {lastUpdate}</Text>
        )}
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
          <Text style={styles.noDriversText}>
            Қазір онлайн жүргізуші жоқ
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  map:            { flex: 1 },

  topPanel:       {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(244,162,97,0.95)',
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 10, paddingHorizontal: 16,
  },
  topTitle:       { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  topSub:         { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },

  refreshBtn:     {
    position: 'absolute', top: Platform.OS === 'ios' ? 70 : 60,
    right: 12, width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#f4a261', alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
  },
  refreshText:    { fontSize: 18 },

  myLocBtn:       {
    position: 'absolute', top: 122, right: 12,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
  },
  myLocText:      { fontSize: 20 },

  carMarker:      {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 4, borderWidth: 2, borderColor: '#f4a261',
    elevation: 3,
  },
  carEmoji:       { fontSize: 22 },

  callout:        {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 10, minWidth: 150,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  calloutName:    { fontWeight: 'bold', fontSize: 14, color: '#1a1a2e' },
  calloutCar:     { color: '#555', fontSize: 12, marginTop: 3 },
  calloutSeats:   { color: '#f4a261', fontSize: 12, marginTop: 3, fontWeight: '600' },
  calloutVillage: { color: '#3498db', fontSize: 11, marginTop: 3 },

  noDrivers:      {
    position: 'absolute', bottom: 30, left: 20, right: 20,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14,
    padding: 14, alignItems: 'center', elevation: 4,
  },
  noDriversText:  { color: '#555', fontSize: 14, fontWeight: '500' },
});
