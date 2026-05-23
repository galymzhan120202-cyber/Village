import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform, ScrollView, Linking, Vibration, Modal,
} from 'react-native';
import MapView, { Marker, UrlTile, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { ordersAPI, driverAPI } from '../services/api';

const INITIAL_REGION = {
  latitude:  48.0196,
  longitude: 66.9237,
  latitudeDelta:  12,
  longitudeDelta: 16,
};

const SERVICES = [
  { key: 'local',    icon: '🚖', label: 'Такси',      color: '#FF6B35', bg: '#FFF3EF' },
  { key: 'delivery', icon: '📦', label: 'Сәлемдеме',  color: '#8B5CF6', bg: '#F5F3FF' },
];

const STATUS_LABEL = {
  active:   { text: 'Жүргізуші іздеуде...', color: '#F59E0B' },
  accepted: { text: 'Жүргізуші келе жатыр', color: '#10B981' },
  finished: { text: 'Аяқталды',              color: '#6B7280' },
};

export default function HomePassengerScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { isOffline }    = useNetwork();
  const mapRef           = useRef(null);
  const prevOrdersRef    = useRef({});

  const [drivers,        setDrivers]        = useState([]);
  const [activeOrders,   setActiveOrders]   = useState([]);
  const [userLoc,        setUserLoc]        = useState(null);
  const [refreshing,     setRefreshing]     = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [unreadChats,    setUnreadChats]    = useState(new Set());
  const [ratingOrder,    setRatingOrder]    = useState(null); // {id, driver_name}
  const [ratingValue,    setRatingValue]    = useState(0);

  useEffect(() => {
    requestLocation();
    loadAll();
    const driverInterval = setInterval(loadDrivers, 30000);
    const orderInterval  = setInterval(loadOrders,  15000);
    return () => { clearInterval(driverInterval); clearInterval(orderInterval); };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadOrders);
    return unsubscribe;
  }, [navigation]);

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setUserLoc(loc.coords);
    mapRef.current?.animateToRegion({
      latitude:      loc.coords.latitude,
      longitude:     loc.coords.longitude,
      latitudeDelta:  0.04,
      longitudeDelta: 0.04,
    }, 800);
  }

  async function loadAll() {
    await Promise.all([loadDrivers(), loadOrders()]);
  }

  async function loadDrivers() {
    try {
      const res = await driverAPI.onlineDrivers();
      setDrivers(res.data.filter(d => d.lat !== 0 && d.lon !== 0));
    } catch (e) {}
  }

  async function loadOrders() {
    try {
      const res    = await ordersAPI.myActive();
      const orders = res.data;

      orders.forEach(order => {
        const prev = prevOrdersRef.current[order.id];
        if (prev && prev !== 'accepted' && order.status === 'accepted') {
          Vibration.vibrate([0, 300, 100, 300]);
          Alert.alert('🚗 Тапсырыс қабылданды!',
            `${order.driver_name || 'Жүргізуші'} сізді алуға келе жатыр`);
        }
      });
      const next = {};
      orders.forEach(o => { next[o.id] = o.status; });

      // Аяқталған (finished) тапсырыс пайда болса — рейтинг сұрау
      orders.forEach(o => {
        if (o.status === 'finished' && o.rating === 0 && !ratingOrder) {
          setRatingOrder({ id: o.id, driver_name: o.driver_name });
          setRatingValue(0);
        }
      });

      prevOrdersRef.current = next;

      const unread = new Set();
      await Promise.all(orders.map(async (order) => {
        if (!order.msg_count) return;
        const stored = await AsyncStorage.getItem(`chat_read_${order.id}`);
        if (order.msg_count > parseInt(stored || '0', 10)) unread.add(order.id);
      }));
      setUnreadChats(unread);
      setActiveOrders(orders);
    } catch (e) {}
  }

  async function submitRating(stars) {
    if (!ratingOrder) return;
    try {
      await ordersAPI.rate(ratingOrder.id, stars, '');
      setRatingOrder(null);
      setRatingValue(0);
    } catch (_) {
      setRatingOrder(null);
    }
  }

  async function cancelOrder() {
    Alert.alert('Растау', 'Тапсырысты жою керек пе?', [
      { text: 'Жоқ' },
      { text: 'Иә, жою', style: 'destructive', onPress: async () => {
        try {
          await ordersAPI.cancel();
          loadOrders();
        } catch (e) {
          Alert.alert('Қате', e.response?.data?.detail || 'Қате');
        }
      }},
    ]);
  }

  function focusDriver(driver) {
    setSelectedDriver(driver.user_id);
    mapRef.current?.animateToRegion({
      latitude:      driver.lat,
      longitude:     driver.lon,
      latitudeDelta:  0.015,
      longitudeDelta: 0.015,
    }, 600);
  }

  function goToMyLocation() {
    if (!userLoc) return;
    mapRef.current?.animateToRegion({
      latitude:      userLoc.latitude,
      longitude:     userLoc.longitude,
      latitudeDelta:  0.04,
      longitudeDelta: 0.04,
    }, 600);
  }

  return (
    <View style={s.root}>

      {/* ── РЕЙТИНГ МОДАЛЫ ── */}
      <Modal visible={!!ratingOrder} transparent animationType="fade">
        <View style={s.ratingOverlay}>
          <View style={s.ratingBox}>
            <Text style={s.ratingTitle}>Жүргізушіге баға беріңіз</Text>
            <Text style={s.ratingDriverName}>{ratingOrder?.driver_name}</Text>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRatingValue(star)}>
                  <Text style={[s.star, ratingValue >= star && s.starActive]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.ratingBtns}>
              <TouchableOpacity style={s.skipBtn} onPress={() => { setRatingOrder(null); setRatingValue(0); }}>
                <Text style={s.skipTxt}>Өткізу</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.sendBtn, ratingValue === 0 && s.sendBtnOff]}
                disabled={ratingValue === 0}
                onPress={() => submitRating(ratingValue)}>
                <Text style={s.sendTxt}>Жіберу ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── КАРТА ── */}
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelectedDriver(null)}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19} flipY={false} shouldReplaceMapContent
        />
        {drivers.map((d) => (
          <Marker
            key={d.user_id}
            coordinate={{ latitude: d.lat, longitude: d.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => focusDriver(d)}
          >
            <View style={[s.carMarker, selectedDriver === d.user_id && s.carMarkerSel]}>
              <Text style={s.carEmoji}>🚗</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── ЖОҒАРҒЫ BAR ── */}
      <View style={s.topBar}>
        <View style={s.topLeft}>
          <Text style={s.topGreet}>Сәлем, {user?.name}!</Text>
          <Text style={s.topSub}>
            {drivers.length > 0 ? `🚗 ${drivers.length} жүргізуші онлайн` : 'Жақын жерде жүргізуші жоқ'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={s.avatarBtn}>
          <Text style={s.avatarTxt}>{(user?.name || 'U')[0].toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* ── ОФЛАЙН БАННЕР ── */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📵 Интернет жоқ</Text>
        </View>
      )}

      {/* ── GPS БАТЫРМА ── */}
      <TouchableOpacity style={s.myLocBtn} onPress={goToMyLocation}>
        <Text style={s.myLocIcon}>◎</Text>
      </TouchableOpacity>

      {/* ── ЖАҢАРТУ ── */}
      <TouchableOpacity
        style={s.refreshBtn}
        onPress={() => { setRefreshing(true); loadAll().then(() => setRefreshing(false)); }}
      >
        {refreshing
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.refreshIcon}>↻</Text>}
      </TouchableOpacity>

      {/* ── ТӨМЕНГІ ПАНЕЛЬ (Yandex стилі) ── */}
      <View style={s.bottomSheet}>

        {/* Белсенді тапсырыстар */}
        {activeOrders.length > 0 && (
          <ScrollView style={s.ordersScroll} showsVerticalScrollIndicator={false}>
            {activeOrders.map((order) => {
              const sl = STATUS_LABEL[order.status] || { text: order.status, color: '#888' };
              return (
                <View key={order.id} style={s.orderCard}>
                  <View style={s.orderCardHeader}>
                    <View style={[s.orderTypeBadge, { backgroundColor: order.order_type === 'delivery' ? '#F5F3FF' : '#EFF6FF' }]}>
                      <Text style={s.orderTypeEmoji}>
                        {order.order_type === 'delivery' ? '📦' : '🚖'}
                      </Text>
                      <Text style={[s.orderTypeText, { color: order.order_type === 'delivery' ? '#8B5CF6' : '#3B82F6' }]}>
                        {order.order_type === 'delivery' ? 'Сәлемдеме' : 'Такси'}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: sl.color + '20' }]}>
                      <View style={[s.statusDot, { backgroundColor: sl.color }]} />
                      <Text style={[s.statusText, { color: sl.color }]}>{sl.text}</Text>
                    </View>
                  </View>

                  <Text style={s.orderRoute}>
                    📍 {order.village || order.landmark || '—'}
                    {order.to_loc ? ` → ${order.to_loc}` : ''}
                  </Text>
                  <Text style={s.orderPrice}>💰 {order.price} тг</Text>

                  {order.status === 'accepted' && order.driver_name && (
                    <View style={s.driverBox}>
                      <View style={s.driverBoxLeft}>
                        <Text style={s.driverBoxName}>🚗 {order.driver_name}</Text>
                        {order.driver_car ? <Text style={s.driverBoxCar}>{order.driver_car}</Text> : null}
                      </View>
                      <View style={s.driverBoxBtns}>
                        {order.driver_phone ? (
                          <TouchableOpacity
                            style={[s.driverActionBtn, { backgroundColor: '#E8F5E9' }]}
                            onPress={() => Linking.openURL(`tel:${order.driver_phone}`)}
                          >
                            <Text style={s.driverActionEmoji}>📞</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[s.driverActionBtn, { backgroundColor: '#E3F2FD' }]}
                          onPress={() => {
                            setUnreadChats(prev => { const n = new Set(prev); n.delete(order.id); return n; });
                            navigation.navigate('Chat', { orderId: order.id, otherName: order.driver_name });
                          }}
                        >
                          <Text style={s.driverActionEmoji}>💬</Text>
                          {unreadChats.has(order.id) && <View style={s.unreadDot} />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {order.status === 'active' && (
                    <TouchableOpacity style={s.cancelBtn} onPress={cancelOrder}>
                      <Text style={s.cancelTxt}>Бас тарту</Text>
                    </TouchableOpacity>
                  )}
                  {order.status === 'finished' && order.rating === 0 && (
                    <TouchableOpacity style={s.rateBtn}
                      onPress={() => { setRatingOrder({ id: order.id, driver_name: order.driver_name }); setRatingValue(0); }}>
                      <Text style={s.rateBtnTxt}>⭐ Жүргізушіге баға бер</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Бөлгіш */}
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Қайда барасыз?</Text>

        {/* 4 Қызмет батырмасы */}
        <View style={s.servicesGrid}>
          {SERVICES.map((srv) => (
            <TouchableOpacity
              key={srv.key}
              style={[s.serviceBtn, { backgroundColor: srv.bg }]}
              onPress={() => navigation.navigate('CreateOrder', { type: srv.key })}
              activeOpacity={0.75}
            >
              <View style={[s.serviceIconWrap, { backgroundColor: srv.color + '22' }]}>
                <Text style={s.serviceIcon}>{srv.icon}</Text>
              </View>
              <Text style={[s.serviceLabel, { color: srv.color }]}>{srv.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Онлайн жүргізушілер тізімі */}
        {drivers.length > 0 && (
          <View style={s.driversRow}>
            <Text style={s.driversRowTitle}>Онлайн жүргізушілер</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {drivers.map((d) => (
                <TouchableOpacity
                  key={d.user_id}
                  style={[s.driverChip, selectedDriver === d.user_id && s.driverChipSel]}
                  onPress={() => focusDriver(d)}
                >
                  <Text style={s.driverChipEmoji}>🚗</Text>
                  <Text style={s.driverChipName} numberOfLines={1}>{d.name}</Text>
                  <Text style={s.driverChipSeats}>💺{d.current_seats}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <TouchableOpacity style={s.historyBtn} onPress={() => navigation.navigate('History')}>
          <Text style={s.historyTxt}>📋  Тапсырыс тарихы</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  map:  { flex: 1 },

  /* Жоғарғы бар */
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 14,
    paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  topLeft:  { flex: 1 },
  topGreet: { fontSize: 16, fontWeight: '700', color: '#111' },
  topSub:   { fontSize: 12, color: '#888', marginTop: 2 },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  /* Офлайн */
  offlineBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 74,
    left: 0, right: 0,
    backgroundColor: '#EF4444', paddingVertical: 7, alignItems: 'center',
  },
  offlineTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  /* GPS батырма */
  myLocBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 90,
    right: 14, width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 5,
  },
  myLocIcon: { fontSize: 22, color: '#3B82F6' },

  /* Жаңарту */
  refreshBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 172 : 142,
    right: 14, width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  refreshIcon: { fontSize: 22, color: '#fff', fontWeight: '700' },

  /* Жүргізуші маркері */
  carMarker: {
    backgroundColor: '#fff', borderRadius: 24, padding: 6,
    borderWidth: 2, borderColor: '#FF6B35',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  carMarkerSel: { borderColor: '#EF4444', borderWidth: 3 },
  carEmoji:     { fontSize: 20 },

  /* ── ТӨМЕНГІ ПАНЕЛЬ ── */
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 18, fontWeight: '800', color: '#111',
    paddingHorizontal: 20, marginBottom: 14,
  },

  /* 4 Қызмет батырмасы */
  servicesGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, gap: 10, marginBottom: 4,
  },
  serviceBtn: {
    width: '47%', borderRadius: 18, padding: 14,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  serviceIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  serviceIcon:  { fontSize: 26 },
  serviceLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },

  /* Онлайн жүргізушілер */
  driversRow: { paddingHorizontal: 16, marginTop: 10, marginBottom: 4 },
  driversRowTitle: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  driverChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
    marginRight: 8, borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  driverChipSel: { borderColor: '#FF6B35', backgroundColor: '#FFF3EF' },
  driverChipEmoji: { fontSize: 16 },
  driverChipName:  { fontSize: 12, fontWeight: '600', color: '#374151', maxWidth: 80 },
  driverChipSeats: { fontSize: 11, color: '#9CA3AF' },

  /* Тарих батырма */
  historyBtn: {
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  historyTxt: { color: '#6B7280', fontWeight: '600', fontSize: 14 },

  /* Белсенді тапсырыс карточка */
  ordersScroll: { maxHeight: 180, paddingHorizontal: 16, paddingTop: 12 },
  orderCard: {
    backgroundColor: '#FAFAFA', borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderTypeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  orderTypeEmoji:  { fontSize: 14 },
  orderTypeText:   { fontSize: 12, fontWeight: '700' },
  statusBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusDot:       { width: 7, height: 7, borderRadius: 4 },
  statusText:      { fontSize: 11, fontWeight: '600' },
  orderRoute:      { fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 2 },
  orderPrice:      { fontSize: 14, fontWeight: '700', color: '#111' },

  driverBox:       { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 10 },
  driverBoxLeft:   { flex: 1 },
  driverBoxName:   { fontWeight: '700', fontSize: 13, color: '#065F46' },
  driverBoxCar:    { fontSize: 12, color: '#6EE7B7', marginTop: 2 },
  driverBoxBtns:   { flexDirection: 'row', gap: 8 },
  driverActionBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  driverActionEmoji:{ fontSize: 18 },
  unreadDot:       { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

  cancelBtn:  { marginTop: 10, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  cancelTxt:  { color: '#EF4444', fontWeight: '700', fontSize: 13 },

  rateBtn:    { marginTop: 10, backgroundColor: '#FFFBEB', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A' },
  rateBtnTxt: { color: '#92400E', fontWeight: '700', fontSize: 13 },

  /* Рейтинг модалы */
  ratingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  ratingBox:     { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
  ratingTitle:   { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 6 },
  ratingDriverName: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  starsRow:      { flexDirection: 'row', gap: 8, marginBottom: 24 },
  star:          { fontSize: 44, color: '#D1D5DB' },
  starActive:    { color: '#F59E0B' },
  ratingBtns:    { flexDirection: 'row', gap: 12, width: '100%' },
  skipBtn:       { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#F3F4F6' },
  skipTxt:       { color: '#6B7280', fontWeight: '700' },
  sendBtn:       { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#F59E0B' },
  sendBtnOff:    { backgroundColor: '#FDE68A' },
  sendTxt:       { color: '#fff', fontWeight: '800', fontSize: 15 },
});
