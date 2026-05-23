import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl, Linking, Vibration, Platform,
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

export default function HomeDriverScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { isOffline }    = useNetwork();

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
      if (ordersIntervalRef.current) { clearInterval(ordersIntervalRef.current); ordersIntervalRef.current = null; }
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
    if (locationIntervalRef.current) { clearInterval(locationIntervalRef.current); locationIntervalRef.current = null; }
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
    Alert.alert('Тоқтату', 'Жұмысты аяқтайсыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә', style: 'destructive', onPress: async () => { await driverAPI.stopWork(); loadData(); } },
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
    Alert.alert('Растау', 'Тапсырысты аяқтайсыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә', onPress: async () => {
        try {
          await ordersAPI.finish(id);
          Alert.alert('✅ Аяқталды', 'Тапсырыс аяқталды');
          loadData();
        } catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
      }},
    ]);
  }

  async function dropOrder(id) {
    Alert.alert('Бас тарту', 'Тапсырысты тастайсыз ба?', [
      { text: 'Жоқ' },
      { text: 'Иә', style: 'destructive', onPress: async () => {
        try { await ordersAPI.drop(id); loadData(); }
        catch (e) { Alert.alert('Қате', e.response?.data?.detail || 'Қате'); }
      }},
    ]);
  }

  function navigate(address) {
    const encoded = encodeURIComponent(address);
    const url = Platform.OS === 'ios'
      ? `maps://?q=${encoded}`
      : `geo:0,0?q=${encoded}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`)
    );
  }

  if (loading && !profile) {
    return <View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View>;
  }

  return (
    <ScrollView
      style={s.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
    >
      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{user?.name} 🚗</Text>
          <Text style={s.status}>
            {profile?.is_online ? '🟢 Жұмыста' : '🔴 Оффлайн'}
            {'  ·  '}⭐ {profile?.rating ?? '5.0'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={s.avatarBtn}>
          <Text style={s.avatarTxt}>{(user?.name || 'D')[0].toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📵 Интернет жоқ</Text>
        </View>
      )}

      {/* ── ЖҰМЫС БАТЫРМАЛАРЫ ── */}
      <View style={s.workRow}>
        {profile?.is_online ? (
          <TouchableOpacity style={[s.workBtn, s.stopBtn]} onPress={stopWork}>
            <Text style={s.workBtnTxt}>🛑  Тоқтату</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.workBtn, s.startBtn]} onPress={() => setShowForm(v => !v)}>
            <Text style={s.workBtnTxt}>🚀  Жұмысқа шығу</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.workBtn, s.earningsBtn]} onPress={() => navigation.navigate('Earnings')}>
          <Text style={s.workBtnTxt}>💰  Табыс</Text>
        </TouchableOpacity>
      </View>

      {/* ── ЖҰМЫСҚА ШЫҒУ ФОРМАСЫ ── */}
      {showForm && (
        <View style={s.form}>
          <Text style={s.formTitle}>Орын саны: <Text style={{ color: '#FF6B35' }}>{seats}</Text></Text>
          <View style={s.seatsRow}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <TouchableOpacity key={n}
                style={[s.seatBtn, seats === n && s.seatBtnOn]}
                onPress={() => setSeats(n)}>
                <Text style={[s.seatTxt, seats === n && s.seatTxtOn]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.confirmBtn} onPress={startWork}>
            <Text style={s.confirmTxt}>✅  Жұмысқа шығу</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── МЕНІҢ ЖОЛАУШЫЛАРЫМ ── */}
      {myPassengers.length > 0 && (
        <>
          <Text style={s.sectionTitle}>👥 Жолаушыларым ({myPassengers.length})</Text>
          {myPassengers.map((p) => {
            const fromAddr = p.landmark || p.village || '—';
            const toAddr   = p.to_loc || '—';
            return (
              <View key={p.id} style={s.pasCard}>
                {/* Жолаушы аты + телефон */}
                <View style={s.pasTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pasName}>{p.passenger_name}</Text>
                    <Text style={s.pasType}>
                      {p.order_type === 'delivery' ? '📦 Сәлемдеме' : '🚖 Такси'}
                      {'  ·  '}
                      <Text style={s.pasPrice}>💰 {p.price} тг</Text>
                    </Text>
                  </View>
                  <TouchableOpacity style={s.callBtn}
                    onPress={() => Linking.openURL(`tel:${p.passenger_phone}`)}>
                    <Text style={s.callTxt}>📞</Text>
                  </TouchableOpacity>
                </View>

                {/* Маршрут + навигация */}
                <View style={s.routeRow}>
                  <View style={{ flex: 1 }}>
                    <View style={s.addrLine}>
                      <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                      <Text style={s.addrTxt} numberOfLines={1}>{fromAddr}</Text>
                    </View>
                    <View style={s.addrLine}>
                      <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={s.addrTxt} numberOfLines={1}>{toAddr}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={s.navBtn} onPress={() => navigate(fromAddr)}>
                    <Text style={s.navTxt}>🗺️</Text>
                    <Text style={s.navLabel}>Нав.</Text>
                  </TouchableOpacity>
                </View>

                {/* Батырмалар */}
                <View style={s.pasBtns}>
                  <TouchableOpacity style={[s.pasBtn, s.chatPasBtn]}
                    onPress={() => {
                      setUnreadChats(prev => { const n = new Set(prev); n.delete(p.id); return n; });
                      navigation.navigate('Chat', { orderId: p.id, otherName: p.passenger_name });
                    }}>
                    <Text style={s.pasBtnTxt}>💬 Чат{unreadChats.has(p.id) ? ' 🔴' : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.pasBtn, s.finishPasBtn]} onPress={() => finishOrder(p.id)}>
                    <Text style={s.pasBtnTxt}>✅ Түсірдім</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.pasBtn, s.dropPasBtn]} onPress={() => dropOrder(p.id)}>
                    <Text style={s.pasBtnTxt}>❌</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* ── ҚОЛЖЕТІМДІ ТАПСЫРЫСТАР ── */}
      {profile?.is_online && (
        <>
          <Text style={s.sectionTitle}>📥 Тапсырыстар ({availOrders.length})</Text>
          {availOrders.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyTxt}>Тапсырыс жоқ, күтуде...</Text>
            </View>
          ) : (
            availOrders.map((o) => (
              <View key={o.id} style={s.orderCard}>
                <View style={s.orderTop}>
                  <Text style={s.orderType}>
                    {o.order_type === 'delivery' ? '📦 Сәлемдеме' : `🚖 Такси (${o.seats} орын)`}
                  </Text>
                  <Text style={s.orderPrice}>💰 {o.price} тг</Text>
                </View>
                <View style={s.addrLine}>
                  <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                  <Text style={s.addrTxt} numberOfLines={1}>{o.from}</Text>
                </View>
                <View style={s.addrLine}>
                  <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
                  <Text style={s.addrTxt} numberOfLines={1}>{o.to}</Text>
                </View>
                {o.comment ? <Text style={s.orderComment}>📝 {o.comment}</Text> : null}
                <TouchableOpacity style={s.acceptBtn} onPress={() => acceptOrder(o.id)}>
                  <Text style={s.acceptTxt}>✅  Қабылдау</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      )}

      {/* ── ТӨМЕНГІ БАТЫРМАЛАР ── */}
      <View style={s.bottomRow}>
        <TouchableOpacity style={[s.bottomBtn, { backgroundColor: '#3B82F6' }]}
          onPress={() => navigation.navigate('Map')}>
          <Text style={s.bottomTxt}>🗺️  Карта</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.bottomBtn, { backgroundColor: '#8B5CF6' }]}
          onPress={() => navigation.navigate('History')}>
          <Text style={s.bottomTxt}>📋  Тарих</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#F3F4F6' },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* Header */
  header:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, marginBottom: 8 },
  name:      { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  status:    { color: '#888', marginTop: 3, fontSize: 13 },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },

  offlineBanner: { backgroundColor: '#EF4444', paddingVertical: 8, alignItems: 'center' },
  offlineTxt:    { color: '#fff', fontWeight: '700' },

  /* Жұмыс */
  workRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  workBtn:    { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  startBtn:   { backgroundColor: '#10B981' },
  stopBtn:    { backgroundColor: '#EF4444' },
  earningsBtn:{ backgroundColor: '#FF6B35' },
  workBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  /* Форма */
  form:       { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  formTitle:  { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  seatsRow:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
  seatBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  seatBtnOn:  { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  seatTxt:    { fontWeight: '700', color: '#555', fontSize: 16 },
  seatTxtOn:  { color: '#fff' },
  confirmBtn: { backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  /* Section */
  sectionTitle: { fontSize: 15, fontWeight: '800', paddingHorizontal: 16, marginTop: 4, marginBottom: 8, color: '#1a1a2e' },

  /* Жолаушы карточкасы */
  pasCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, padding: 14, elevation: 3,
    borderLeftWidth: 4, borderLeftColor: '#10B981',
  },
  pasTop:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pasName:   { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  pasType:   { fontSize: 12, color: '#888', marginTop: 2 },
  pasPrice:  { color: '#FF6B35', fontWeight: '700' },
  callBtn:   { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  callTxt:   { fontSize: 20 },

  routeRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addrLine:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  addrTxt:   { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },
  navBtn:    { width: 48, height: 48, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  navTxt:    { fontSize: 18 },
  navLabel:  { fontSize: 9, color: '#3B82F6', fontWeight: '700' },

  pasBtns:   { flexDirection: 'row', gap: 8 },
  pasBtn:    { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  chatPasBtn:{ backgroundColor: '#EFF6FF' },
  finishPasBtn: { backgroundColor: '#ECFDF5' },
  dropPasBtn:{ backgroundColor: '#FEF2F2' },
  pasBtnTxt: { fontWeight: '700', fontSize: 12, color: '#1a1a2e' },

  /* Тапсырыс карточкасы */
  orderCard:  { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 14, elevation: 2 },
  orderTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderType:  { fontWeight: '700', fontSize: 14, color: '#1a1a2e' },
  orderPrice: { fontWeight: '800', fontSize: 15, color: '#FF6B35' },
  orderComment: { color: '#9CA3AF', fontSize: 12, marginTop: 4, marginBottom: 4 },
  acceptBtn:  { marginTop: 10, backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  acceptTxt:  { color: '#fff', fontWeight: '800', fontSize: 14 },

  /* Бос */
  emptyCard:  { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 20, alignItems: 'center' },
  emptyTxt:   { color: '#9CA3AF', fontSize: 14 },

  /* Төмен */
  bottomRow:  { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 10 },
  bottomBtn:  { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  bottomTxt:  { color: '#fff', fontWeight: '800', fontSize: 14 },
});
