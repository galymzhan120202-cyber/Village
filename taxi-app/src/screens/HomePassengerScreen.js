import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform, ScrollView,
  Linking, Vibration, Modal, Animated,
} from 'react-native';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth }    from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { ordersAPI, driverAPI } from '../services/api';

const INITIAL_REGION = {
  latitude: 42.3417, longitude: 69.5901,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};

const SERVICES = [
  { key: 'local',     icon: '🚖', label: 'Такси',       color: '#FF6B35', bg: '#FFF3EF' },
  { key: 'intercity', icon: '🏙️', label: 'Қалааралық',  color: '#3B82F6', bg: '#EFF6FF' },
  { key: 'delivery',  icon: '📦', label: 'Сәлемдеме',   color: '#8B5CF6', bg: '#F5F3FF' },
];

export default function HomePassengerScreen({ navigation }) {
  const { user }      = useAuth();
  const { isOffline } = useNetwork();
  const mapRef        = useRef(null);
  const prevRef       = useRef({});
  const pulseAnim     = useRef(new Animated.Value(1)).current;

  const [drivers,      setDrivers]      = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [userLoc,      setUserLoc]      = useState(null);
  const [selDriver,    setSelDriver]    = useState(null);
  const [unread,       setUnread]       = useState(new Set());
  const [ratingOrder,  setRatingOrder]  = useState(null);
  const [ratingValue,  setRatingValue]  = useState(0);
  const [refreshing,   setRefreshing]   = useState(false);
  // Пайдаланушы "Өткізу" басқан тапсырыстарды сақтаймыз → модал қайта шықпайды
  const dismissedRatings = useRef(new Set());

  useEffect(() => {
    requestLoc();
    loadAll();
    const d = setInterval(loadDrivers, 30000);
    const o = setInterval(loadOrders,  12000);
    return () => { clearInterval(d); clearInterval(o); };
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadOrders);
    return unsub;
  }, [navigation]);

  // Pulse animation for searching state
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    const order = activeOrders[0];
    if (order?.status === 'active') anim.start();
    else anim.stop();
    return () => anim.stop();
  }, [activeOrders]);

  async function requestLoc() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setUserLoc(loc.coords);
    mapRef.current?.animateToRegion({
      latitude:      loc.coords.latitude,
      longitude:     loc.coords.longitude,
      latitudeDelta:  0.04, longitudeDelta: 0.04,
    }, 800);
  }

  async function loadAll() {
    await Promise.all([loadDrivers(), loadOrders()]);
    setRefreshing(false);
  }

  async function loadDrivers() {
    try {
      const res = await driverAPI.onlineDrivers();
      setDrivers(res.data.filter(d => d.lat !== 0 && d.lon !== 0));
    } catch (_) {}
  }

  async function loadOrders() {
    try {
      const res    = await ordersAPI.myActive();
      const orders = res.data;

      orders.forEach(o => {
        const prev = prevRef.current[o.id];
        if (prev && prev !== 'accepted' && o.status === 'accepted') {
          Vibration.vibrate([0, 300, 100, 300]);
          Alert.alert('🚗 Тапсырыс қабылданды!',
            `${o.driver_name || 'Жүргізуші'} сізді алуға келе жатыр`);
        }
      });

      const next = {};
      orders.forEach(o => { next[o.id] = o.status; });

      // Бір рет ғана рейтинг сұраймыз (dismissed болмаса және modal ашық болмаса)
      if (!ratingOrder) {
        const unrated = orders.find(
          o => o.status === 'finished' && o.rating === 0 && !dismissedRatings.current.has(o.id)
        );
        if (unrated) {
          setRatingOrder({ id: unrated.id, driver_name: unrated.driver_name });
          setRatingValue(0);
        }
      }

      prevRef.current = next;

      const ur = new Set();
      await Promise.all(orders.map(async (o) => {
        if (!o.msg_count) return;
        const s = await AsyncStorage.getItem(`chat_read_${o.id}`);
        if (o.msg_count > parseInt(s || '0', 10)) ur.add(o.id);
      }));
      setUnread(ur);
      setActiveOrders(orders);
    } catch (_) {}
  }

  async function submitRating(stars) {
    if (!ratingOrder) return;
    try {
      await ordersAPI.rate(ratingOrder.id, stars, '');
    } catch (_) {}
    dismissedRatings.current.add(ratingOrder.id);
    setRatingOrder(null); setRatingValue(0);
  }

  async function cancelOrder() {
    Alert.alert('Тапсырысты жою', 'Тапсырысты жоямыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә, жою', style: 'destructive', onPress: async () => {
        try { await ordersAPI.cancel(); loadOrders(); }
        catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
      }},
    ]);
  }

  function focusDriver(d) {
    setSelDriver(d.user_id);
    mapRef.current?.animateToRegion({
      latitude: d.lat, longitude: d.lon,
      latitudeDelta: 0.015, longitudeDelta: 0.015,
    }, 600);
  }

  const order = activeOrders[0] || null;
  const hasOrder = !!order && order.status !== 'finished';

  return (
    <View style={s.root}>

      {/* ── РЕЙТИНГ МОДАЛЫ ── */}
      <Modal visible={!!ratingOrder} transparent animationType="fade">
        <View style={s.ratingOverlay}>
          <View style={s.ratingBox}>
            <Text style={s.ratingTitle}>Жүргізушіге баға беріңіз</Text>
            <Text style={s.ratingName}>{ratingOrder?.driver_name}</Text>
            <View style={s.starsRow}>
              {[1,2,3,4,5].map(i => (
                <TouchableOpacity key={i} onPress={() => setRatingValue(i)}>
                  <Text style={[s.star, ratingValue >= i && s.starOn]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.ratingBtns}>
              <TouchableOpacity style={s.skipBtn} onPress={() => {
                if (ratingOrder) dismissedRatings.current.add(ratingOrder.id);
                setRatingOrder(null); setRatingValue(0);
              }}>
                <Text style={s.skipTxt}>Өткізу</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.sendBtn, ratingValue === 0 && { opacity: 0.45 }]}
                disabled={ratingValue === 0}
                onPress={() => submitRating(ratingValue)}
              >
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
        onPress={() => setSelDriver(null)}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19} flipY={false} shouldReplaceMapContent
        />
        {drivers.map(d => (
          <Marker key={d.user_id}
            coordinate={{ latitude: d.lat, longitude: d.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => focusDriver(d)}
          >
            <View style={[s.carPin, selDriver === d.user_id && s.carPinSel]}>
              <Text style={s.carPinEmoji}>🚗</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── ЖОҒАРҒЫ БАР ── */}
      <SafeAreaView style={s.topBarSafe} edges={['top']} pointerEvents="box-none">
        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.topLeft}>
            <Text style={s.topName}>{user?.name}</Text>
            <Text style={s.topSub}>
              {drivers.length > 0
                ? `🚗 ${drivers.length} жүргізуші жақын`
                : '🔍 Жүргізуші іздеуде'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={s.topAvatar}>
            <Text style={s.topAvatarTxt}>{(user?.name || 'U')[0].toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📵 Интернет жоқ</Text>
        </View>
      )}

      {/* ── MAP CONTROLS ── */}
      <View style={s.mapControls} pointerEvents="box-none">
        <TouchableOpacity style={s.mapCtrlBtn} onPress={() => { setRefreshing(true); loadAll(); }}>
          {refreshing
            ? <ActivityIndicator color="#FF6B35" size="small" />
            : <Text style={s.mapCtrlIcon}>↻</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.mapCtrlBtn} onPress={requestLoc}>
          <Text style={[s.mapCtrlIcon, { color: '#3B82F6' }]}>◎</Text>
        </TouchableOpacity>
      </View>

      {/* ── BOTTOM SHEET ── */}
      <View style={s.bottomSheet}>
        <View style={s.handle} />

        {hasOrder ? (
          /* ── БЕЛСЕНДІ ТАПСЫРЫС (Yandex стилі) ── */
          <ActiveOrderView
            order={order}
            unread={unread}
            pulseAnim={pulseAnim}
            onCancel={cancelOrder}
            onChat={(id, name) => {
              setUnread(p => { const n = new Set(p); n.delete(id); return n; });
              navigation.navigate('Chat', { orderId: id, otherName: name });
            }}
            onRate={(id, name) => { setRatingOrder({ id, driver_name: name }); setRatingValue(0); }}
          />
        ) : (
          /* ── НЕГІЗГІ ЭКРАН ── */
          <>
            {/* Yandex-style search bar */}
            <TouchableOpacity
              style={s.searchBar}
              onPress={() => navigation.navigate('CreateOrder', { type: 'local' })}
              activeOpacity={0.85}
            >
              <View style={s.searchDot} />
              <Text style={s.searchTxt}>Қайда барасыз?</Text>
              <View style={s.searchArrow}>
                <Text style={s.searchArrowTxt}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Service tiles */}
            <View style={s.servicesRow}>
              {SERVICES.map(srv => (
                <TouchableOpacity
                  key={srv.key}
                  style={[s.serviceTile, { backgroundColor: srv.bg }]}
                  onPress={() => navigation.navigate('CreateOrder', { type: srv.key })}
                  activeOpacity={0.8}
                >
                  <View style={[s.serviceTileIcon, { backgroundColor: srv.color + '22' }]}>
                    <Text style={{ fontSize: 26 }}>{srv.icon}</Text>
                  </View>
                  <Text style={[s.serviceTileLabel, { color: srv.color }]}>{srv.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Online drivers */}
            {drivers.length > 0 && (
              <View style={s.driversSection}>
                <Text style={s.driversSectionTitle}>Онлайн жүргізушілер</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {drivers.map(d => (
                    <TouchableOpacity
                      key={d.user_id}
                      style={[s.driverChip, selDriver === d.user_id && s.driverChipSel]}
                      onPress={() => focusDriver(d)}
                    >
                      <Text style={s.driverChipAvatar}>{d.name[0]}</Text>
                      <View style={{ marginLeft: 6 }}>
                        <Text style={s.driverChipName} numberOfLines={1}>{d.name}</Text>
                        <Text style={s.driverChipSeats}>💺 {d.current_seats} орын</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity style={s.historyBtn} onPress={() => navigation.navigate('History')}>
              <Text style={s.historyEmoji}>📋</Text>
              <Text style={s.historyTxt}>Тапсырыс тарихы</Text>
              <Text style={s.historyArrow}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

/* ─── Active Order Component (Yandex style) ─── */
function ActiveOrderView({ order, unread, pulseAnim, onCancel, onChat, onRate }) {
  const isSearching = order.status === 'active';
  const isAccepted  = order.status === 'accepted';
  const isFinished  = order.status === 'finished';

  const statusCfg = {
    active:   { text: 'Жүргізуші іздеуде', color: '#F59E0B', bg: '#FFFBEB' },
    accepted: { text: 'Жүргізуші келе жатыр', color: '#10B981', bg: '#ECFDF5' },
    finished: { text: 'Аяқталды', color: '#6B7280', bg: '#F3F4F6' },
  };
  const cfg = statusCfg[order.status] || statusCfg.active;

  return (
    <View style={ao.wrap}>
      {/* Status */}
      <View style={[ao.statusBar, { backgroundColor: cfg.bg }]}>
        {isSearching ? (
          <Animated.View style={[ao.statusDot, { backgroundColor: cfg.color, transform: [{ scale: pulseAnim }] }]} />
        ) : (
          <View style={[ao.statusDot, { backgroundColor: cfg.color }]} />
        )}
        <Text style={[ao.statusTxt, { color: cfg.color }]}>{cfg.text}</Text>
        {isSearching && <ActivityIndicator size="small" color={cfg.color} style={{ marginLeft: 8 }} />}
      </View>

      {/* Driver card (when accepted) */}
      {isAccepted && order.driver_name && (
        <View style={ao.driverCard}>
          <View style={ao.driverAvatar}>
            <Text style={ao.driverAvatarTxt}>{order.driver_name[0]}</Text>
          </View>
          <View style={ao.driverInfo}>
            <Text style={ao.driverName}>{order.driver_name}</Text>
            {order.driver_car ? (
              <Text style={ao.driverCar}>{order.driver_car}</Text>
            ) : null}
            <View style={ao.driverStars}>
              {[1,2,3,4,5].map(i => (
                <Text key={i} style={{ fontSize: 12, color: i <= 5 ? '#F59E0B' : '#E5E7EB' }}>★</Text>
              ))}
            </View>
          </View>
          <View style={ao.driverBtns}>
            {order.driver_phone ? (
              <TouchableOpacity style={ao.driverBtn}
                onPress={() => Linking.openURL(`tel:${order.driver_phone}`)}>
                <Text style={{ fontSize: 20 }}>📞</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[ao.driverBtn, { backgroundColor: '#EFF6FF' }]}
              onPress={() => onChat(order.id, order.driver_name)}>
              <Text style={{ fontSize: 20 }}>💬</Text>
              {unread.has(order.id) && <View style={ao.unreadDot} />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Route */}
      <View style={ao.routeWrap}>
        <View style={ao.routeLine}>
          <View style={[ao.dot, { backgroundColor: '#10B981' }]} />
          <Text style={ao.routeTxt} numberOfLines={1}>
            {order.landmark || order.village || '—'}
          </Text>
        </View>
        <View style={[ao.routeLine, { marginTop: 6 }]}>
          <View style={[ao.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={ao.routeTxt} numberOfLines={1}>{order.to_loc || '—'}</Text>
        </View>
      </View>

      {/* Price + Actions */}
      <View style={ao.footer}>
        <Text style={ao.price}>{order.price} тг</Text>
        <View style={ao.footerBtns}>
          {isFinished && order.rating === 0 && (
            <TouchableOpacity style={ao.rateBtn}
              onPress={() => onRate(order.id, order.driver_name)}>
              <Text style={ao.rateBtnTxt}>⭐ Баға беру</Text>
            </TouchableOpacity>
          )}
          {!isFinished && (
            <TouchableOpacity style={ao.cancelBtn} onPress={onCancel}>
              <Text style={ao.cancelBtnTxt}>Бас тарту</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

/* ─────────── STYLES ─────────── */
const s = StyleSheet.create({
  root: { flex: 1 },
  map:  { flex: 1 },

  topBarSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  topLeft:      { flex: 1 },
  topName:      { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  topSub:       { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  topAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  topAvatarTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },

  offlineBanner: { position: 'absolute', top: 70, left: 0, right: 0, backgroundColor: '#EF4444', paddingVertical: 7, alignItems: 'center' },
  offlineTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  mapControls: {
    position: 'absolute', right: 14,
    bottom: 320, gap: 10,
  },
  mapCtrlBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 6, elevation: 5,
  },
  mapCtrlIcon: { fontSize: 20, color: '#374151', fontWeight: '700' },

  carPin: {
    backgroundColor: '#fff', borderRadius: 22, padding: 5,
    borderWidth: 2.5, borderColor: '#FF6B35',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  carPinSel: { borderColor: '#1a1a2e', borderWidth: 3 },
  carPinEmoji: { fontSize: 18 },

  /* Bottom sheet */
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 20, elevation: 18,
  },
  handle: {
    width: 42, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center',
    marginTop: 12, marginBottom: 16,
  },

  /* Search bar (Yandex style) */
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: '#F9FAFB', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  searchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF6B35', marginRight: 12 },
  searchTxt: { flex: 1, fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  searchArrow: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  searchArrowTxt: { color: '#fff', fontSize: 20, fontWeight: '300', marginTop: -2 },

  /* Services */
  servicesRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 14 },
  serviceTile: {
    flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  serviceTileIcon:  { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  serviceTileLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  /* Drivers */
  driversSection:      { paddingHorizontal: 16, marginBottom: 12 },
  driversSectionTitle: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  driverChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 9, marginRight: 8,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  driverChipSel:    { borderColor: '#FF6B35', backgroundColor: '#FFF3EF' },
  driverChipAvatar: { fontSize: 22, width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5E7EB', textAlign: 'center', lineHeight: 30 },
  driverChipName:   { fontSize: 12, fontWeight: '700', color: '#1a1a2e', maxWidth: 90 },
  driverChipSeats:  { fontSize: 11, color: '#9CA3AF' },

  historyBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, backgroundColor: '#F9FAFB',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  historyEmoji: { fontSize: 18, marginRight: 10 },
  historyTxt:   { flex: 1, fontSize: 14, fontWeight: '600', color: '#6B7280' },
  historyArrow: { fontSize: 20, color: '#D1D5DB' },

  /* Rating modal */
  ratingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  ratingBox:     { backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center' },
  ratingTitle:   { fontSize: 20, fontWeight: '900', color: '#1a1a2e', marginBottom: 6 },
  ratingName:    { fontSize: 14, color: '#9CA3AF', marginBottom: 20 },
  starsRow:      { flexDirection: 'row', gap: 8, marginBottom: 24 },
  star:          { fontSize: 46, color: '#E5E7EB' },
  starOn:        { color: '#F59E0B' },
  ratingBtns:    { flexDirection: 'row', gap: 12, width: '100%' },
  skipBtn:       { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#F3F4F6' },
  skipTxt:       { color: '#6B7280', fontWeight: '700' },
  sendBtn:       { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#F59E0B' },
  sendTxt:       { color: '#fff', fontWeight: '900', fontSize: 15 },
});

/* Active order styles */
const ao = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 4 },

  statusBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTxt: { fontSize: 14, fontWeight: '700', flex: 1 },

  driverCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 18,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  driverAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  driverAvatarTxt: { fontSize: 22, color: '#fff', fontWeight: '800' },
  driverInfo:      { flex: 1 },
  driverName:      { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  driverCar:       { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  driverStars:     { flexDirection: 'row', marginTop: 4, gap: 1 },
  driverBtns:      { flexDirection: 'row', gap: 8 },
  driverBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  unreadDot:       { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

  routeWrap: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 12, marginBottom: 14, gap: 0 },
  routeLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeTxt:  { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },

  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price:      { fontSize: 22, fontWeight: '900', color: '#1a1a2e' },
  footerBtns: { flexDirection: 'row', gap: 8 },
  cancelBtn:  { backgroundColor: '#FEF2F2', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  cancelBtnTxt: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  rateBtn:    { backgroundColor: '#FFFBEB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#FDE68A' },
  rateBtnTxt: { color: '#D97706', fontWeight: '700', fontSize: 13 },
});
