import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
  Linking, Vibration, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function HomeDriverScreen({ navigation }) {
  const { user }      = useAuth();
  const { isOffline } = useNetwork();

  const [profile,      setProfile]      = useState(null);
  const [availOrders,  setAvailOrders]  = useState([]);
  const [myPassengers, setMyPassengers] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [unreadChats,  setUnreadChats]  = useState(new Set());
  const [showForm,     setShowForm]     = useState(false);
  const [seats,        setSeats]        = useState(4);

  const locationRef  = useRef(null);
  const ordersRef    = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => { loadData(); loadSavedSeats(); registerPushToken(); }, []);

  useEffect(() => {
    if (profile?.is_online) {
      startLocTracking();
      startBackgroundLocation();
      ordersRef.current = setInterval(loadOrders, 20000);
    } else {
      stopLocTracking();
      stopBackgroundLocation();
      if (ordersRef.current) { clearInterval(ordersRef.current); ordersRef.current = null; }
    }
    return () => {
      stopLocTracking();
      stopBackgroundLocation();
      if (ordersRef.current) clearInterval(ordersRef.current);
    };
  }, [profile?.is_online]);

  async function registerPushToken() {
    try {
      if (!Device.isDevice) return;
      const { status: ex } = await Notifications.getPermissionsAsync();
      let fs = ex;
      if (ex !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        fs = status;
      }
      if (fs !== 'granted') return;
      const t = await Notifications.getExpoPushTokenAsync();
      await driverAPI.savePushToken(t.data);
    } catch (_) {}
  }

  async function loadSavedSeats() {
    try {
      const r = await AsyncStorage.getItem('driver_seats');
      if (r) setSeats(parseInt(r) || 4);
    } catch (_) {}
  }

  async function startLocTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    sendLoc();
    locationRef.current = setInterval(sendLoc, 30000);
  }

  function stopLocTracking() {
    if (locationRef.current) { clearInterval(locationRef.current); locationRef.current = null; }
  }

  async function sendLoc() {
    try {
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await driverAPI.updateLocation(l.coords.latitude, l.coords.longitude);
    } catch (_) {}
  }

  async function loadOrders() {
    try {
      const res = await ordersAPI.available();
      if (res.data.length > prevCountRef.current) Vibration.vibrate([0, 200, 100, 200]);
      prevCountRef.current = res.data.length;
      setAvailOrders(res.data);
    } catch (_) {}
  }

  async function loadData() {
    try {
      const [pR, passR] = await Promise.all([driverAPI.profile(), driverAPI.passengers()]);
      setProfile(pR.data);
      setMyPassengers(passR.data);
      const unread = new Set();
      await Promise.all(passR.data.map(async (p) => {
        if (!p.msg_count) return;
        const s = await AsyncStorage.getItem(`chat_read_${p.id}`);
        if (p.msg_count > parseInt(s || '0', 10)) unread.add(p.id);
      }));
      setUnreadChats(unread);
      if (pR.data.is_online) {
        const oR = await ordersAPI.available();
        prevCountRef.current = oR.data.length;
        setAvailOrders(oR.data);
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
      Alert.alert('Қате', e.response?.data?.detail || 'Қате болды');
    }
  }

  async function stopWork() {
    Alert.alert('Жұмысты тоқтату', 'Тапсырыс қабылдауды тоқтатасыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә', style: 'destructive', onPress: async () => { await driverAPI.stopWork(); loadData(); } },
    ]);
  }

  async function acceptOrder(id) {
    try {
      const res = await ordersAPI.accept(id);
      Alert.alert('✅ Қабылданды', `${res.data.price} тг`);
      loadData();
    } catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
  }

  async function finishOrder(id) {
    Alert.alert('Жолаушыны түсірдіңіз бе?', '', [
      { text: 'Жоқ' },
      { text: 'Иә, аяқтау', onPress: async () => {
        try { await ordersAPI.finish(id); loadData(); }
        catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
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

  function openMaps(addr) {
    const q = encodeURIComponent(addr);
    const url = Platform.OS === 'ios' ? `maps://?q=${q}` : `geo:0,0?q=${q}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`)
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View>
      </SafeAreaView>
    );
  }

  const isOnline = !!profile?.is_online;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── ЖҰМЫСҚА ШЫҒУ МОДАЛЫ ── */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={m.overlay}>
          <TouchableOpacity style={m.bg} activeOpacity={1} onPress={() => setShowForm(false)} />
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>Жұмысқа шығу</Text>
            <Text style={m.sub}>Машинаңыздың орын санын таңдаңыз</Text>

            <View style={m.seatRow}>
              {[
                { n: 4, emoji: '🚗', lbl: 'Жеңіл авто' },
                { n: 6, emoji: '🚐', lbl: 'Микроавтобус' },
              ].map(({ n, emoji, lbl }) => (
                <TouchableOpacity
                  key={n}
                  style={[m.seatCard, seats === n && m.seatCardOn]}
                  onPress={() => setSeats(n)}
                  activeOpacity={0.8}
                >
                  <Text style={m.seatEmoji}>{emoji}</Text>
                  <Text style={[m.seatNum, seats === n && m.seatNumOn]}>{n}</Text>
                  <Text style={[m.seatUnit, seats === n && m.seatUnitOn]}>орын</Text>
                  <Text style={[m.seatLbl, seats === n && m.seatLblOn]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={m.infoBox}>
              {['Барлық маршруттар', 'Барлық ауылдар', 'Сәлемдеме жеткізу'].map(t => (
                <View key={t} style={m.infoRow}>
                  <View style={m.infoDot} />
                  <Text style={m.infoTxt}>{t}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={m.goBtn} onPress={startWork}>
              <Text style={m.goBtnTxt}>Жұмысты бастау →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowForm(false)} style={m.cancelBtn}>
              <Text style={m.cancelTxt}>Болдырмау</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.hName} numberOfLines={1}>{user?.name}</Text>
          <View style={s.hRow}>
            <View style={[s.hDot, { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' }]} />
            <Text style={s.hStatus}>{isOnline ? 'Жұмыста' : 'Оффлайн'}</Text>
            <Text style={s.hSep}>·</Text>
            <Text style={s.hRating}>⭐ {profile?.rating ?? '5.0'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={s.avatar}>
          <Text style={s.avatarTxt}>{(user?.name || 'D')[0].toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📵 Интернет байланысы жоқ</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor="#FF6B35"
          />
        }
      >
        {/* ── СТАТИСТИКА ── */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{profile?.weekly_completed ?? 0}</Text>
            <Text style={s.statLbl}>Тапсырыс</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={[s.statNum, { color: '#10B981' }]}>
              {profile?.weekly_income ?? 0}
            </Text>
            <Text style={s.statLbl}>Табыс (тг)</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={[s.statNum, { color: '#F59E0B' }]}>
              {profile?.rating ?? '5.0'}
            </Text>
            <Text style={s.statLbl}>Рейтинг</Text>
          </View>
        </View>

        {/* ── ЖҰМЫС КҮЙІ ── */}
        {isOnline ? (
          <View style={s.onlineCard}>
            <View style={s.pulse}>
              <View style={s.pulseCore} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.onlineTitle}>Жұмыста 🟢</Text>
              <Text style={s.onlineSub}>
                {profile?.current_seats ?? seats} орын · Тапсырыс күтілуде
              </Text>
            </View>
            <TouchableOpacity style={s.stopBtn} onPress={stopWork}>
              <Text style={s.stopBtnTxt}>Тоқтату</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.startCard} onPress={() => setShowForm(true)} activeOpacity={0.9}>
            <View style={s.startCardIcon}>
              <Text style={{ fontSize: 28 }}>🚗</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.startCardTitle}>Жұмысқа шығу</Text>
              <Text style={s.startCardSub}>Тапсырыс қабылдауды бастаңыз</Text>
            </View>
            <View style={s.startCardArrow}>
              <Text style={s.startCardArrowTxt}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── QUICK ACTIONS ── */}
        <View style={s.quickGrid}>
          <TouchableOpacity style={[s.quickTile, { backgroundColor: '#EFF6FF' }]}
            onPress={() => navigation.navigate('Map')}>
            <Text style={s.quickEmoji}>🗺️</Text>
            <Text style={[s.quickLabel, { color: '#2563EB' }]}>Карта</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.quickTile, { backgroundColor: '#ECFDF5' }]}
            onPress={() => navigation.navigate('Earnings')}>
            <Text style={s.quickEmoji}>💰</Text>
            <Text style={[s.quickLabel, { color: '#059669' }]}>Табыс</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.quickTile, { backgroundColor: '#F5F3FF' }]}
            onPress={() => navigation.navigate('History')}>
            <Text style={s.quickEmoji}>📋</Text>
            <Text style={[s.quickLabel, { color: '#7C3AED' }]}>Тарих</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.quickTile, { backgroundColor: '#FFF7ED' }]}
            onPress={() => navigation.navigate('Profile')}>
            <Text style={s.quickEmoji}>👤</Text>
            <Text style={[s.quickLabel, { color: '#D97706' }]}>Профиль</Text>
          </TouchableOpacity>
        </View>

        {/* ── ЖОЛАУШЫЛАР ── */}
        {myPassengers.length > 0 && (
          <>
            <Text style={s.sectionTitle}>👥 Жолаушыларым ({myPassengers.length})</Text>
            {myPassengers.map((p) => {
              const from = p.landmark || p.village || '—';
              const to   = p.to_loc || '—';
              return (
                <View key={p.id} style={s.pasCard}>
                  <View style={s.pasHead}>
                    <View style={s.pasAv}>
                      <Text style={{ fontSize: 22 }}>👤</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.pasName}>{p.passenger_name}</Text>
                      <Text style={s.pasType}>
                        {p.order_type === 'delivery' ? '📦 Сәлемдеме' : '🚖 Такси'}
                        {'  ·  '}
                        <Text style={{ color: '#FF6B35', fontWeight: '700' }}>{p.price} тг</Text>
                      </Text>
                    </View>
                    <TouchableOpacity style={s.callBtn}
                      onPress={() => Linking.openURL(`tel:${p.passenger_phone}`)}>
                      <Text style={{ fontSize: 20 }}>📞</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.routeWrap}>
                    <View style={s.routeLine}>
                      <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                      <Text style={s.routeTxt} numberOfLines={1}>{from}</Text>
                      <TouchableOpacity style={s.mapBtn} onPress={() => openMaps(from)}>
                        <Text>🗺️</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.routeLine}>
                      <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={s.routeTxt} numberOfLines={1}>{to}</Text>
                    </View>
                  </View>

                  <View style={s.pasBtns}>
                    <TouchableOpacity style={[s.pasBtn, { backgroundColor: '#EFF6FF' }]}
                      onPress={() => {
                        setUnreadChats(pr => { const n = new Set(pr); n.delete(p.id); return n; });
                        navigation.navigate('Chat', { orderId: p.id, otherName: p.passenger_name });
                      }}>
                      <Text style={[s.pasBtnTxt, { color: '#2563EB' }]}>
                        💬 Чат{unreadChats.has(p.id) ? ' 🔴' : ''}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.pasBtn, { backgroundColor: '#ECFDF5' }]}
                      onPress={() => finishOrder(p.id)}>
                      <Text style={[s.pasBtnTxt, { color: '#059669' }]}>✅ Түсірдім</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.pasBtn, { backgroundColor: '#FEF2F2', flex: 0, paddingHorizontal: 16 }]}
                      onPress={() => dropOrder(p.id)}>
                      <Text style={s.pasBtnTxt}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── ТАПСЫРЫСТАР ── */}
        {isOnline && (
          <>
            <Text style={s.sectionTitle}>
              📥 Тапсырыстар{availOrders.length > 0 ? ` (${availOrders.length})` : ''}
            </Text>
            {availOrders.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>🔍</Text>
                <Text style={s.emptyTitle}>Тапсырыс жоқ</Text>
                <Text style={s.emptySub}>
                  Жаңа тапсырыс келгенде{'\n'}телефон вибрация береді
                </Text>
              </View>
            ) : (
              availOrders.map((o) => (
                <View key={o.id} style={s.orderCard}>
                  <View style={s.orderHead}>
                    <View style={s.orderTypePill}>
                      <Text style={{ fontSize: 15 }}>
                        {o.order_type === 'delivery' ? '📦' : '🚖'}
                      </Text>
                      <Text style={s.orderTypeTxt}>
                        {o.order_type === 'delivery' ? 'Сәлемдеме' : `Такси · ${o.seats} орын`}
                      </Text>
                    </View>
                    <Text style={s.orderPrice}>{o.price} тг</Text>
                  </View>

                  <View style={s.routeWrap}>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─────────────────── STYLES ─────────────────── */
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  hName:   { fontSize: 20, fontWeight: '900', color: '#1a1a2e' },
  hRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  hDot:    { width: 8, height: 8, borderRadius: 4 },
  hStatus: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  hSep:    { color: '#D1D5DB' },
  hRating: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FF6B35',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  avatarTxt: { color: '#fff', fontWeight: '900', fontSize: 18 },

  offlineBanner: { backgroundColor: '#EF4444', paddingVertical: 8, alignItems: 'center' },
  offlineTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 20, paddingVertical: 18,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statBox:     { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#F3F4F6' },
  statNum:     { fontSize: 24, fontWeight: '900', color: '#1a1a2e', marginBottom: 4 },
  statLbl:     { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  /* Online card */
  onlineCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#1a1a2e', borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  pulse:     { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(16,185,129,0.25)', alignItems: 'center', justifyContent: 'center' },
  pulseCore: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#10B981' },
  onlineTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  onlineSub:   { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  stopBtn:    { backgroundColor: '#EF4444', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  stopBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  /* Start card */
  startCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    borderWidth: 2, borderColor: '#F3F4F6',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  startCardIcon:     { width: 52, height: 52, borderRadius: 16, backgroundColor: '#FFF3EF', alignItems: 'center', justifyContent: 'center' },
  startCardTitle:    { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  startCardSub:      { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  startCardArrow:    { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  startCardArrowTxt: { color: '#fff', fontSize: 24, lineHeight: 30 },

  /* Quick grid */
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 16, marginTop: 14, gap: 10,
  },
  quickTile: {
    width: '47.5%', borderRadius: 18,
    paddingVertical: 18, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  quickEmoji: { fontSize: 24 },
  quickLabel: { fontSize: 15, fontWeight: '800' },

  /* Section */
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a2e', paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },

  /* Passenger card */
  pasCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 20, padding: 16, elevation: 3,
    borderLeftWidth: 4, borderLeftColor: '#10B981',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
  },
  pasHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pasAv:   { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasName: { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  pasType: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  callBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },

  routeWrap: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 12, marginBottom: 12, gap: 8 },
  routeLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeTxt:  { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },
  mapBtn:    { width: 30, height: 30, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },

  pasBtns:   { flexDirection: 'row', gap: 8 },
  pasBtn:    { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  pasBtnTxt: { fontSize: 13, fontWeight: '700', color: '#374151' },

  /* Order card */
  orderCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 20, padding: 16, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
  },
  orderHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  orderTypePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  orderTypeTxt:  { fontSize: 13, fontWeight: '700', color: '#374151' },
  orderPrice:    { fontSize: 20, fontWeight: '900', color: '#FF6B35' },
  orderComment:  { fontSize: 12, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' },
  acceptBtn: {
    marginTop: 12, backgroundColor: '#FF6B35', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  acceptBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  /* Empty */
  emptyBox:   { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 20, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151', marginBottom: 6 },
  emptySub:   { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
});

/* ─── MODAL STYLES ─── */
const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  bg:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 24 },
  title:  { fontSize: 26, fontWeight: '900', color: '#1a1a2e', marginBottom: 4 },
  sub:    { fontSize: 14, color: '#9CA3AF', marginBottom: 28 },

  seatRow:    { flexDirection: 'row', gap: 16, marginBottom: 24 },
  seatCard:   {
    flex: 1, borderRadius: 24, paddingVertical: 26, alignItems: 'center',
    backgroundColor: '#F9FAFB', borderWidth: 2.5, borderColor: '#E5E7EB',
  },
  seatCardOn: { backgroundColor: '#1a1a2e', borderColor: '#1a1a2e' },
  seatEmoji:  { fontSize: 36, marginBottom: 10 },
  seatNum:    { fontSize: 40, fontWeight: '900', color: '#1a1a2e', lineHeight: 44 },
  seatNumOn:  { color: '#FF6B35' },
  seatUnit:   { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginTop: 2 },
  seatUnitOn: { color: 'rgba(255,255,255,0.45)' },
  seatLbl:    { fontSize: 12, color: '#D1D5DB', marginTop: 6 },
  seatLblOn:  { color: 'rgba(255,255,255,0.3)' },

  infoBox: { backgroundColor: '#F0FDF4', borderRadius: 18, padding: 18, marginBottom: 24, gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  infoTxt: { fontSize: 14, fontWeight: '600', color: '#059669' },

  goBtn:    { backgroundColor: '#FF6B35', borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginBottom: 12, shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  goBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
  cancelBtn:  { paddingVertical: 12, alignItems: 'center' },
  cancelTxt:  { color: '#9CA3AF', fontSize: 15, fontWeight: '600' },
});
