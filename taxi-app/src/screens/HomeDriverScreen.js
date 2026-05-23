import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
  Linking, Vibration, Platform, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { driverAPI, ordersAPI } from '../services/api';
import { startBackgroundLocation, stopBackgroundLocation } from '../tasks/locationTask';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const QUICK = [
  { key: 'Map',      icon: '🗺️', label: 'Карта',    color: '#3B82F6', bg: '#EFF6FF' },
  { key: 'Earnings', icon: '💰', label: 'Табыс',    color: '#10B981', bg: '#ECFDF5' },
  { key: 'History',  icon: '📋', label: 'Тарих',    color: '#8B5CF6', bg: '#F5F3FF' },
  { key: 'Profile',  icon: '👤', label: 'Профиль', color: '#F59E0B', bg: '#FFFBEB' },
];

export default function HomeDriverScreen({ navigation }) {
  const { user }    = useAuth();
  const { isOffline } = useNetwork();

  const [profile,      setProfile]      = useState(null);
  const [availOrders,  setAvailOrders]  = useState([]);
  const [myPassengers, setMyPassengers] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [unreadChats,  setUnreadChats]  = useState(new Set());
  const [showForm,     setShowForm]     = useState(false);
  const [seats,        setSeats]        = useState(4);

  const locationIntervalRef = useRef(null);
  const ordersIntervalRef   = useRef(null);
  const prevOrderCountRef   = useRef(0);

  useEffect(() => { loadData(); loadSavedSeats(); registerPushToken(); }, []);

  useEffect(() => {
    if (profile?.is_online) {
      startLocationTracking();
      startBackgroundLocation();
      ordersIntervalRef.current = setInterval(loadAvailableOrders, 20000);
    } else {
      stopLocationTracking();
      stopBackgroundLocation();
      if (ordersIntervalRef.current) {
        clearInterval(ordersIntervalRef.current);
        ordersIntervalRef.current = null;
      }
    }
    return () => {
      stopLocationTracking();
      stopBackgroundLocation();
      if (ordersIntervalRef.current) clearInterval(ordersIntervalRef.current);
    };
  }, [profile?.is_online]);

  async function registerPushToken() {
    try {
      if (!Device.isDevice) return;
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      const tokenData = await Notifications.getExpoPushTokenAsync();
      await driverAPI.savePushToken(tokenData.data);
    } catch (_) {}
  }

  async function loadSavedSeats() {
    try {
      const raw = await AsyncStorage.getItem('driver_seats');
      if (raw) setSeats(parseInt(raw) || 4);
    } catch (_) {}
  }

  async function startLocationTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    sendLocation();
    locationIntervalRef.current = setInterval(sendLocation, 30000);
  }

  function stopLocationTracking() {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  }

  async function sendLocation() {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await driverAPI.updateLocation(loc.coords.latitude, loc.coords.longitude);
    } catch (_) {}
  }

  async function loadAvailableOrders() {
    try {
      const res = await ordersAPI.available();
      const newOrders = res.data;
      if (newOrders.length > prevOrderCountRef.current) Vibration.vibrate([0, 200, 100, 200]);
      prevOrderCountRef.current = newOrders.length;
      setAvailOrders(newOrders);
    } catch (_) {}
  }

  async function loadData() {
    setLoading(true);
    try {
      const [profRes, passRes] = await Promise.all([driverAPI.profile(), driverAPI.passengers()]);
      setProfile(profRes.data);
      setMyPassengers(passRes.data);

      const unread = new Set();
      await Promise.all(passRes.data.map(async (p) => {
        if (!p.msg_count) return;
        const stored = await AsyncStorage.getItem(`chat_read_${p.id}`);
        if (p.msg_count > parseInt(stored || '0', 10)) unread.add(p.id);
      }));
      setUnreadChats(unread);

      if (profRes.data.is_online) {
        const ordRes = await ordersAPI.available();
        prevOrderCountRef.current = ordRes.data.length;
        setAvailOrders(ordRes.data);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }

  async function startWork() {
    try {
      await AsyncStorage.setItem('driver_seats', String(seats));
      await driverAPI.startWork({ seats, accepts_delivery: true });
      setShowForm(false);
      loadData();
    } catch (e) {
      Alert.alert('Қате', e.response?.data?.detail || 'Қате');
    }
  }

  async function stopWork() {
    Alert.alert('Жұмысты тоқтату', 'Тапсырыс қабылдауды тоқтатасыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә, тоқтату', style: 'destructive', onPress: async () => { await driverAPI.stopWork(); loadData(); } },
    ]);
  }

  async function acceptOrder(id) {
    try {
      const res = await ordersAPI.accept(id);
      Alert.alert('✅ Қабылданды', `${res.data.price} тг`);
      loadData();
    } catch (e) {
      Alert.alert('Қате', e.response?.data?.detail || 'Қате');
    }
  }

  async function finishOrder(id) {
    Alert.alert('Растау', 'Жолаушыны түсірдіңіз бе?', [
      { text: 'Жоқ' },
      { text: 'Иә, аяқтау', onPress: async () => {
        try {
          await ordersAPI.finish(id);
          loadData();
        } catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
      }},
    ]);
  }

  async function dropOrder(id) {
    Alert.alert('Бас тарту', 'Тапсырыстан бас тартасыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә', style: 'destructive', onPress: async () => {
        try { await ordersAPI.drop(id); loadData(); }
        catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
      }},
    ]);
  }

  function openMaps(address) {
    const q = encodeURIComponent(address);
    const url = Platform.OS === 'ios' ? `maps://?q=${q}` : `geo:0,0?q=${q}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`)
    );
  }

  if (loading && !profile) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const isOnline = !!profile?.is_online;

  return (
    <>
      {/* ── ЖҰМЫСҚА ШЫҒУ МОДАЛЫ ── */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayBg} activeOpacity={1} onPress={() => setShowForm(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />

            <Text style={s.sheetTitle}>🚗  Жұмысқа шығу</Text>
            <Text style={s.sheetSub}>Машинаңыздың орын санын таңдаңыз</Text>

            {/* Тек 4 немесе 6 */}
            <View style={s.seatRow}>
              <TouchableOpacity
                style={[s.seatCard, seats === 4 && s.seatCardOn]}
                onPress={() => setSeats(4)}
                activeOpacity={0.8}
              >
                <Text style={s.seatCardEmoji}>🚗</Text>
                <Text style={[s.seatCardNum, seats === 4 && s.seatCardNumOn]}>4</Text>
                <Text style={[s.seatCardLbl, seats === 4 && s.seatCardLblOn]}>орын</Text>
                <Text style={[s.seatCardSub, seats === 4 && s.seatCardSubOn]}>Жеңіл авто</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.seatCard, seats === 6 && s.seatCardOn]}
                onPress={() => setSeats(6)}
                activeOpacity={0.8}
              >
                <Text style={s.seatCardEmoji}>🚐</Text>
                <Text style={[s.seatCardNum, seats === 6 && s.seatCardNumOn]}>6</Text>
                <Text style={[s.seatCardLbl, seats === 6 && s.seatCardLblOn]}>орын</Text>
                <Text style={[s.seatCardSub, seats === 6 && s.seatCardSubOn]}>Микроавтобус</Text>
              </TouchableOpacity>
            </View>

            {/* Қосылатындар */}
            <View style={s.includeBox}>
              <Text style={s.includeTxt}>✓  Барлық маршруттар</Text>
              <Text style={s.includeTxt}>✓  Барлық ауылдар</Text>
              <Text style={s.includeTxt}>✓  Сәлемдеме жеткізу</Text>
            </View>

            <TouchableOpacity style={s.startBtn} onPress={startWork}>
              <Text style={s.startBtnTxt}>🚀  Жұмысты бастау</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={s.cancelBtnTxt}>Болдырмау</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={s.screen}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#FF6B35" />
        }
      >
        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerName}>{user?.name}</Text>
            <View style={s.headerStatus}>
              <View style={[s.headerDot, { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' }]} />
              <Text style={s.headerStatusTxt}>
                {isOnline ? 'Жұмыста' : 'Оффлайн'}
              </Text>
              <Text style={s.headerSep}>·</Text>
              <Text style={s.headerRating}>⭐ {profile?.rating ?? '5.0'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={s.avatarBtn}>
            <Text style={s.avatarTxt}>{(user?.name || 'D')[0].toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {isOffline && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineTxt}>📵 Интернет байланысы жоқ</Text>
          </View>
        )}

        {/* ── АПТАЛЫҚ СТАТИСТИКА ── */}
        <View style={s.statsCard}>
          <View style={s.statItem}>
            <Text style={s.statNum}>{profile?.weekly_completed ?? 0}</Text>
            <Text style={s.statLbl}>Тапсырыс</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: '#10B981' }]}>{profile?.weekly_income ?? 0} ₸</Text>
            <Text style={s.statLbl}>Апталық</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: '#F59E0B' }]}>{profile?.rating ?? '5.0'}</Text>
            <Text style={s.statLbl}>Рейтинг</Text>
          </View>
        </View>

        {/* ── ЖҰМЫС КҮЙІ ── */}
        {isOnline ? (
          <View style={s.onlineCard}>
            <View style={s.onlinePulse}>
              <View style={s.onlinePulseInner} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.onlineTitle}>Жұмыста</Text>
              <Text style={s.onlineSub}>{profile?.current_seats ?? seats} орын · Тапсырыс күтілуде</Text>
            </View>
            <TouchableOpacity style={s.stopBtn} onPress={stopWork}>
              <Text style={s.stopBtnTxt}>Тоқтату</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.offlineCard} onPress={() => setShowForm(true)} activeOpacity={0.85}>
            <View style={s.offlineCardIcon}>
              <Text style={{ fontSize: 26 }}>🚗</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.offlineCardTitle}>Жұмысқа шығу</Text>
              <Text style={s.offlineCardSub}>Тапсырыс қабылдауды бастаңыз</Text>
            </View>
            <View style={s.offlineCardArrow}>
              <Text style={s.offlineCardArrowTxt}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── QUICK ACTIONS ── */}
        <View style={s.quickGrid}>
          {QUICK.map((q) => (
            <TouchableOpacity
              key={q.key}
              style={[s.quickTile, { backgroundColor: q.bg }]}
              onPress={() => navigation.navigate(q.key)}
              activeOpacity={0.75}
            >
              <Text style={s.quickIcon}>{q.icon}</Text>
              <Text style={[s.quickLabel, { color: q.color }]}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── ЖОЛАУШЫЛАР ── */}
        {myPassengers.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>👥 Жолаушыларым</Text>
            {myPassengers.map((p) => {
              const from = p.landmark || p.village || '—';
              const to   = p.to_loc || '—';
              return (
                <View key={p.id} style={s.pasCard}>
                  <View style={s.pasTop}>
                    <View style={s.pasAvatar}>
                      <Text style={{ fontSize: 20 }}>👤</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.pasName}>{p.passenger_name}</Text>
                      <Text style={s.pasInfo}>
                        {p.order_type === 'delivery' ? '📦 Сәлемдеме' : '🚖 Такси'}
                        {'  '}
                        <Text style={s.pasPrice}>{p.price} ₸</Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={s.callBtn}
                      onPress={() => Linking.openURL(`tel:${p.passenger_phone}`)}
                    >
                      <Text style={{ fontSize: 20 }}>📞</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.routeBlock}>
                    <View style={s.routeLine}>
                      <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                      <Text style={s.routeTxt} numberOfLines={1}>{from}</Text>
                      <TouchableOpacity style={s.navBtn} onPress={() => openMaps(from)}>
                        <Text style={s.navTxt}>🗺️</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.routeLine}>
                      <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={s.routeTxt} numberOfLines={1}>{to}</Text>
                    </View>
                  </View>

                  <View style={s.pasBtns}>
                    <TouchableOpacity
                      style={[s.pasBtn, { backgroundColor: '#EFF6FF' }]}
                      onPress={() => {
                        setUnreadChats(prev => { const n = new Set(prev); n.delete(p.id); return n; });
                        navigation.navigate('Chat', { orderId: p.id, otherName: p.passenger_name });
                      }}
                    >
                      <Text style={[s.pasBtnTxt, { color: '#3B82F6' }]}>
                        💬 Чат{unreadChats.has(p.id) ? ' 🔴' : ''}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.pasBtn, { backgroundColor: '#ECFDF5' }]}
                      onPress={() => finishOrder(p.id)}
                    >
                      <Text style={[s.pasBtnTxt, { color: '#059669' }]}>✅ Түсірдім</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.pasBtn, { backgroundColor: '#FEF2F2', flex: 0, paddingHorizontal: 14 }]}
                      onPress={() => dropOrder(p.id)}
                    >
                      <Text style={{ fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── ТАПСЫРЫСТАР ── */}
        {isOnline && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              📥 Тапсырыстар{availOrders.length > 0 ? ` (${availOrders.length})` : ''}
            </Text>
            {availOrders.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>🔍</Text>
                <Text style={s.emptyTitle}>Тапсырыс күтілуде</Text>
                <Text style={s.emptySub}>Жаңа тапсырыс келгенде вибрация береді</Text>
              </View>
            ) : (
              availOrders.map((o) => (
                <View key={o.id} style={s.orderCard}>
                  <View style={s.orderTop}>
                    <View style={s.orderTypePill}>
                      <Text style={s.orderTypeEmoji}>
                        {o.order_type === 'delivery' ? '📦' : '🚖'}
                      </Text>
                      <Text style={s.orderTypeTxt}>
                        {o.order_type === 'delivery' ? 'Сәлемдеме' : `Такси · ${o.seats} орын`}
                      </Text>
                    </View>
                    <Text style={s.orderPrice}>{o.price} ₸</Text>
                  </View>

                  <View style={s.routeBlock}>
                    <View style={s.routeLine}>
                      <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                      <Text style={s.routeTxt} numberOfLines={1}>{o.from}</Text>
                    </View>
                    <View style={s.routeLine}>
                      <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={s.routeTxt} numberOfLines={1}>{o.to}</Text>
                    </View>
                  </View>

                  {o.comment ? (
                    <Text style={s.orderComment}>💬 {o.comment}</Text>
                  ) : null}

                  <TouchableOpacity style={s.acceptBtn} onPress={() => acceptOrder(o.id)}>
                    <Text style={s.acceptBtnTxt}>Қабылдау</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ── MODAL ── */
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
  },
  sheetHandle: {
    width: 48, height: 5, borderRadius: 3,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 24,
  },
  sheetTitle: { fontSize: 24, fontWeight: '900', color: '#1a1a2e', marginBottom: 4 },
  sheetSub:   { fontSize: 14, color: '#9CA3AF', marginBottom: 24 },

  seatRow:    { flexDirection: 'row', gap: 14, marginBottom: 20 },
  seatCard:   {
    flex: 1, borderRadius: 22, paddingVertical: 22, alignItems: 'center',
    backgroundColor: '#F9FAFB', borderWidth: 2.5, borderColor: '#E5E7EB',
  },
  seatCardOn: { backgroundColor: '#1a1a2e', borderColor: '#1a1a2e' },
  seatCardEmoji: { fontSize: 32, marginBottom: 8 },
  seatCardNum:   { fontSize: 36, fontWeight: '900', color: '#374151', lineHeight: 40 },
  seatCardNumOn: { color: '#FF6B35' },
  seatCardLbl:   { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginTop: 2 },
  seatCardLblOn: { color: 'rgba(255,255,255,0.5)' },
  seatCardSub:   { fontSize: 11, color: '#D1D5DB', marginTop: 4 },
  seatCardSubOn: { color: 'rgba(255,255,255,0.35)' },

  includeBox: {
    backgroundColor: '#F0FDF4', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 18,
    gap: 6, marginBottom: 24,
  },
  includeTxt: { fontSize: 13, fontWeight: '600', color: '#059669' },

  startBtn: {
    backgroundColor: '#FF6B35', borderRadius: 18, paddingVertical: 18,
    alignItems: 'center', marginBottom: 12,
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  startBtnTxt:  { color: '#fff', fontSize: 17, fontWeight: '900' },
  cancelBtn:    { paddingVertical: 12, alignItems: 'center' },
  cancelBtnTxt: { color: '#9CA3AF', fontSize: 15, fontWeight: '600' },

  /* ── HEADER ── */
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerName:      { fontSize: 20, fontWeight: '900', color: '#1a1a2e' },
  headerStatus:    { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  headerDot:       { width: 8, height: 8, borderRadius: 4 },
  headerStatusTxt: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  headerSep:       { color: '#D1D5DB', fontSize: 13 },
  headerRating:    { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  avatarBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.45, shadowRadius: 8, elevation: 5,
  },
  avatarTxt: { color: '#fff', fontWeight: '900', fontSize: 19 },

  offlineBanner: { backgroundColor: '#EF4444', paddingVertical: 9, alignItems: 'center' },
  offlineTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  /* ── СТАТИСТИКА ── */
  statsCard: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 14, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#F3F4F6' },
  statNum:     { fontSize: 22, fontWeight: '900', color: '#1a1a2e', marginBottom: 3 },
  statLbl:     { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  /* ── ОНЛАЙН КАРТА ── */
  onlineCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#1a1a2e', borderRadius: 20, padding: 18,
    shadowColor: '#1a1a2e', shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  onlinePulse: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  onlinePulseInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
  onlineTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  onlineSub:   { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  stopBtn: {
    backgroundColor: '#EF4444', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  stopBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  /* ── ОФЛАЙН КАРТА ── */
  offlineCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    borderWidth: 2, borderColor: '#F3F4F6',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  offlineCardIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#FFF3EF', alignItems: 'center', justifyContent: 'center',
  },
  offlineCardTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  offlineCardSub:   { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  offlineCardArrow: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
  },
  offlineCardArrowTxt: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },

  /* ── QUICK ACTIONS ── */
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 16, marginTop: 14, gap: 10,
  },
  quickTile: {
    width: '47%', borderRadius: 18,
    paddingVertical: 16, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  quickIcon:  { fontSize: 22 },
  quickLabel: { fontSize: 14, fontWeight: '700' },

  /* ── SECTION ── */
  section:      { marginTop: 14 },
  sectionTitle: {
    fontSize: 15, fontWeight: '800', color: '#1a1a2e',
    paddingHorizontal: 16, marginBottom: 10,
  },

  /* ── ЖОЛАУШЫ КАРТОЧКА ── */
  pasCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 20, padding: 16, elevation: 3,
    borderLeftWidth: 4, borderLeftColor: '#10B981',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
  },
  pasTop:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pasAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  pasName:   { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  pasInfo:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  pasPrice:  { color: '#FF6B35', fontWeight: '700' },
  callBtn:   {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center',
  },

  routeBlock: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 12, marginBottom: 12, gap: 8 },
  routeLine:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:        { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeTxt:   { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },
  navBtn:     {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  navTxt: { fontSize: 16 },

  pasBtns:   { flexDirection: 'row', gap: 8 },
  pasBtn:    { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  pasBtnTxt: { fontSize: 13, fontWeight: '700' },

  /* ── ТАПСЫРЫС КАРТОЧКА ── */
  orderCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 20, padding: 16, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
  },
  orderTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  orderTypePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  orderTypeEmoji:{ fontSize: 16 },
  orderTypeTxt:  { fontSize: 13, fontWeight: '700', color: '#374151' },
  orderPrice:    { fontSize: 18, fontWeight: '900', color: '#FF6B35' },
  orderComment:  { fontSize: 12, color: '#9CA3AF', marginTop: 4, marginBottom: 4, fontStyle: 'italic' },
  acceptBtn: {
    marginTop: 12, backgroundColor: '#FF6B35', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  acceptBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  /* ── БОС КҮЙІ ── */
  emptyBox: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 20,
    padding: 28, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151', marginBottom: 4 },
  emptySub:   { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});
