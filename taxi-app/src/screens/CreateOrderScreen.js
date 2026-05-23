import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, Modal,
  KeyboardAvoidingView,
} from 'react-native';
import MapView, { Marker, UrlTile, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { ordersAPI } from '../services/api';

const KZ_CENTER = { latitude: 48.0196, longitude: 66.9237, latitudeDelta: 12, longitudeDelta: 15 };

const TABS = [
  { key: 'local',    icon: '🚖', label: 'Такси',     color: '#FF6B35' },
  { key: 'delivery', icon: '📦', label: 'Сәлемдеме', color: '#8B5CF6' },
];

// ─── GPS ──────────────────────────────────────────────────────────────────────
async function getGPS() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({});
    return loc.coords;
  } catch { return null; }
}

async function reverseGeocode(coord) {
  try {
    const res = await Location.reverseGeocodeAsync(coord);
    const r = res[0];
    return [r?.street, r?.name, r?.district, r?.city].filter(Boolean).join(', ')
      || `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`;
  } catch {
    return `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`;
  }
}

// ─── Карта модалы ──────────────────────────────────────────────────────────────
function MapModal({ visible, onClose, onConfirm, userLocation }) {
  const mapRef = useRef(null);
  const [step,   setStep]   = useState('from');
  const [from,   setFrom]   = useState(null);
  const [to,     setTo]     = useState(null);
  const [busy,   setBusy]   = useState(false);

  useEffect(() => {
    if (!visible) { setStep('from'); setFrom(null); setTo(null); return; }
    const c = userLocation
      ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }
      : KZ_CENTER;
    setTimeout(() => mapRef.current?.animateToRegion(c, 500), 300);
  }, [visible]);

  function onPress(e) {
    const c = e.nativeEvent.coordinate;
    if (step === 'from') { setFrom(c); setStep('to'); }
    else setTo(c);
  }

  async function confirm() {
    if (!from || !to) return;
    setBusy(true);
    const [fa, ta] = await Promise.all([reverseGeocode(from), reverseGeocode(to)]);
    setBusy(false);
    onConfirm({ from, to, fromAddr: fa, toAddr: ta });
  }

  const isFrom = step === 'from';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={ms.header}>
          <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
            <Text style={ms.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={ms.title}>Маршрутты белгілеңіз</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Step bar */}
        <View style={ms.stepBar}>
          <View style={ms.stepItem}>
            <View style={[ms.dot, { backgroundColor: '#10B981' }]}>
              <Text style={ms.dotTxt}>{from ? '✓' : '1'}</Text>
            </View>
            <Text style={[ms.stepLbl, { color: '#10B981' }]}>Қайдан</Text>
          </View>
          <View style={[ms.line, from && { backgroundColor: '#10B981' }]} />
          <View style={ms.stepItem}>
            <View style={[ms.dot, { backgroundColor: to ? '#EF4444' : isFrom ? '#D1D5DB' : '#EF4444' }]}>
              <Text style={ms.dotTxt}>{to ? '✓' : '2'}</Text>
            </View>
            <Text style={[ms.stepLbl, { color: to || !isFrom ? '#EF4444' : '#9CA3AF' }]}>Қайда</Text>
          </View>
        </View>

        {/* Hint */}
        <View style={[ms.hint, { backgroundColor: isFrom ? '#10B981' : '#EF4444' }]}>
          <Text style={ms.hintTxt}>
            {isFrom ? '🟢  Қайдан екеніңізді белгілеңіз' : '🔴  Баратын жерді белгілеңіз'}
          </Text>
        </View>

        {/* Map */}
        <MapView ref={mapRef} style={{ flex: 1 }} provider={PROVIDER_DEFAULT}
          initialRegion={KZ_CENTER} showsUserLocation onPress={onPress}>
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19} flipY={false} shouldReplaceMapContent
          />
          {from && (
            <Marker coordinate={from} anchor={{ x: 0.5, y: 1 }}>
              <View style={ms.pin}>
                <View style={[ms.pinBubble, { backgroundColor: '#10B981' }]}>
                  <Text style={ms.pinTxt}>Қайдан</Text>
                </View>
                <View style={[ms.pinTail, { borderTopColor: '#10B981' }]} />
              </View>
            </Marker>
          )}
          {to && (
            <Marker coordinate={to} anchor={{ x: 0.5, y: 1 }}>
              <View style={ms.pin}>
                <View style={[ms.pinBubble, { backgroundColor: '#EF4444' }]}>
                  <Text style={ms.pinTxt}>Қайда</Text>
                </View>
                <View style={[ms.pinTail, { borderTopColor: '#EF4444' }]} />
              </View>
            </Marker>
          )}
          {from && to && (
            <Polyline coordinates={[from, to]} strokeColor="#FF6B35" strokeWidth={3} lineDashPattern={[8, 4]} />
          )}
        </MapView>

        {/* Bottom */}
        <View style={ms.bottom}>
          {from && (
            <TouchableOpacity style={ms.resetBtn}
              onPress={() => { setFrom(null); setTo(null); setStep('from'); }}>
              <Text style={ms.resetTxt}>↩ Қайта бастау</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[ms.confirmBtn, (!from || !to) && ms.confirmOff]}
            onPress={confirm} disabled={!from || !to || busy}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={ms.confirmTxt}>Маршрутты растау</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────────
function Label({ text }) {
  return <Text style={s.label}>{text}</Text>;
}

function PriceHint({ text }) {
  return (
    <View style={s.hint}>
      <Text style={s.hintTxt}>💡 {text}</Text>
    </View>
  );
}

function SeatsRow({ value, onChange }) {
  return (
    <View style={s.seatsRow}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <TouchableOpacity key={n}
          style={[s.seatBtn, value === n && s.seatBtnOn]}
          onPress={() => onChange(n)}>
          <Text style={[s.seatNum, value === n && s.seatNumOn]}>{n}</Text>
          <Text style={[s.seatSub, value === n && s.seatSubOn]}>орын</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Адрес карточкасы ─────────────────────────────────────────────────────────
function AddrCard({ fromVal, toVal, onFromChange, onToChange, onMapPress }) {
  return (
    <View style={s.addrCard}>
      <TouchableOpacity style={s.mapRow} onPress={onMapPress}>
        <Text style={s.mapEmoji}>🗺️</Text>
        <Text style={s.mapTxt}>Картадан белгілеу</Text>
        <Text style={s.mapArrow}>›</Text>
      </TouchableOpacity>
      <View style={s.divider} />
      <View style={s.addrRow}>
        <View style={[s.dot, { backgroundColor: '#10B981' }]} />
        <TextInput style={s.addrInput} placeholder="Қайдан? (үй, көше...)"
          value={fromVal} onChangeText={onFromChange} placeholderTextColor="#9CA3AF" />
      </View>
      <View style={s.addrLine} />
      <View style={s.addrRow}>
        <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
        <TextInput style={s.addrInput} placeholder="Қайда? (мақсат...)"
          value={toVal} onChangeText={onToChange} placeholderTextColor="#9CA3AF" />
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. ТАКСИ
// ══════════════════════════════════════════════════════════════════════════════
function TaxiForm({ onSubmit, loading }) {
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [price,   setPrice]   = useState('500');
  const [seats,   setSeats]   = useState(4);
  const [comment, setComment] = useState('');
  const [mapVis,  setMapVis]  = useState(false);
  const [gps,     setGps]     = useState(null);

  useEffect(() => { getGPS().then(setGps); }, []);

  function submit() {
    if (!from.trim()) { Alert.alert('', 'Қайдан екенін жазыңыз'); return; }
    if (!to.trim())   { Alert.alert('', 'Қайда баратынын жазыңыз'); return; }
    if (!price || parseInt(price) <= 0) { Alert.alert('', 'Баға жазыңыз'); return; }
    onSubmit({
      o_type:  'taxi',
      village: from.trim(),
      route:   'local',
      land:    from.trim(),
      to_loc:  to.trim(),
      price:   parseInt(price),
      seats,
      comment: comment.trim() || undefined,
    });
  }

  return (
    <>
      <MapModal visible={mapVis} onClose={() => setMapVis(false)}
        onConfirm={r => { setFrom(r.fromAddr); setTo(r.toAddr); setMapVis(false); }}
        userLocation={gps} />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Label text="Маршрут" />
        <AddrCard fromVal={from} toVal={to}
          onFromChange={setFrom} onToChange={setTo}
          onMapPress={() => setMapVis(true)} />

        <Label text="Орын саны" />
        <SeatsRow value={seats} onChange={setSeats} />

        <Label text="Баға (теңге)" />
        <PriceHint text="Орташа баға: 300–800 тг" />
        <TextInput style={s.input} placeholder="500" value={price}
          onChangeText={setPrice} keyboardType="numeric" placeholderTextColor="#9CA3AF" />

        <Label text="Ескертпе (міндетті емес)" />
        <TextInput style={[s.input, s.inputMulti]}
          placeholder="Жүк бар, баламен..." value={comment}
          onChangeText={setComment} multiline numberOfLines={2}
          placeholderTextColor="#9CA3AF" />

        <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitTxt}>🚖  Такси шақыру</Text>}
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. СӘЛЕМДЕМЕ
// ══════════════════════════════════════════════════════════════════════════════
function DeliveryForm({ onSubmit, loading }) {
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [price,   setPrice]   = useState('500');
  const [comment, setComment] = useState('');

  function submit() {
    if (!from.trim()) { Alert.alert('', 'Қайдан екенін жазыңыз'); return; }
    if (!to.trim())   { Alert.alert('', 'Қайда баратынын жазыңыз'); return; }
    if (!price || parseInt(price) <= 0) { Alert.alert('', 'Баға жазыңыз'); return; }
    onSubmit({
      o_type:  'delivery',
      village: from.trim(),
      route:   'local',
      land:    from.trim(),
      to_loc:  to.trim(),
      price:   parseInt(price),
      seats:   0,
      comment: comment.trim() || undefined,
    });
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Label text="Қайдан → Қайда" />
      <View style={s.addrCard}>
        <View style={s.addrRow}>
          <View style={[s.dot, { backgroundColor: '#10B981' }]} />
          <TextInput style={s.addrInput} placeholder="Жіберілетін жер (мекенжай)"
            value={from} onChangeText={setFrom} placeholderTextColor="#9CA3AF" />
        </View>
        <View style={s.addrLine} />
        <View style={s.addrRow}>
          <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
          <TextInput style={s.addrInput} placeholder="Жеткізілетін жер (мекенжай)"
            value={to} onChangeText={setTo} placeholderTextColor="#9CA3AF" />
        </View>
      </View>

      <Label text="Жеткізу бағасы (теңге)" />
      <PriceHint text="Орташа баға: 300–1000 тг" />
      <TextInput style={s.input} placeholder="500" value={price}
        onChangeText={setPrice} keyboardType="numeric" placeholderTextColor="#9CA3AF" />

      <Label text="Жүктің сипаттамасы" />
      <TextInput style={[s.input, s.inputMulti]}
        placeholder="Салмағы, өлшемі, ерекшелігі..."
        value={comment} onChangeText={setComment}
        multiline numberOfLines={2} placeholderTextColor="#9CA3AF" />

      <TouchableOpacity style={[s.submitBtn, { backgroundColor: '#8B5CF6' }]}
        onPress={submit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.submitTxt}>📦  Сәлемдеме жіберу</Text>}
      </TouchableOpacity>
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// НЕГІЗГІ ЭКРАН
// ══════════════════════════════════════════════════════════════════════════════
export default function CreateOrderScreen({ navigation, route }) {
  const paramType = route?.params?.type || 'local';
  const initTab   = TABS.find(t => t.key === paramType)?.key || 'local';

  const [activeTab, setActiveTab] = useState(initTab);
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(data) {
    setLoading(true);
    try {
      await ordersAPI.create(data);
      Alert.alert('Сәтті! 🎉', 'Тапсырыс жүргізушілерге жіберілді', [
        { text: 'Жарайды', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Қате', e.response?.data?.detail || 'Сервер қатесі');
    } finally {
      setLoading(false);
    }
  }

  const activeColor = TABS.find(t => t.key === activeTab)?.color || '#FF6B35';

  return (
    <KeyboardAvoidingView style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

      {/* Tabs */}
      <View style={s.tabBar}>
        {TABS.map((tab) => {
          const on = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key}
              style={[s.tab, on && { borderBottomColor: tab.color }]}
              onPress={() => setActiveTab(tab.key)} activeOpacity={0.75}>
              <Text style={s.tabIcon}>{tab.icon}</Text>
              <Text style={[s.tabTxt, on && { color: tab.color, fontWeight: '700' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.formArea}>
        {activeTab === 'local'    && <TaxiForm    onSubmit={handleSubmit} loading={loading} />}
        {activeTab === 'delivery' && <DeliveryForm onSubmit={handleSubmit} loading={loading} />}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── СТИЛЬДЕР ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#F9FAFB' },
  tabBar:  { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#F3F4F6' },
  tab:     { flex: 1, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabIcon: { fontSize: 20 },
  tabTxt:  { fontSize: 15, fontWeight: '500', color: '#9CA3AF' },
  formArea:{ flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  label:   { fontSize: 11, fontWeight: '800', color: '#9CA3AF', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },

  hint:    { backgroundColor: '#FFFBEB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A' },
  hintTxt: { fontSize: 12, color: '#92400E', fontWeight: '600' },

  addrCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', elevation: 2, marginBottom: 2 },
  mapRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#FFF7F3', gap: 8 },
  mapEmoji: { fontSize: 17 },
  mapTxt:   { flex: 1, fontSize: 13, fontWeight: '700', color: '#FF6B35' },
  mapArrow: { fontSize: 18, color: '#FF6B35' },
  divider:  { height: 1, backgroundColor: '#F3F4F6' },
  addrRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 4, gap: 12 },
  dot:      { width: 11, height: 11, borderRadius: 6 },
  addrInput:{ flex: 1, fontSize: 14, color: '#111', paddingVertical: 13 },
  addrLine: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 40 },

  input:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB', color: '#111', marginBottom: 2, elevation: 1 },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },

  seatsRow:   { flexDirection: 'row', gap: 8, marginBottom: 2 },
  seatBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  seatBtnOn:  { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  seatNum:    { fontSize: 22, fontWeight: '800', color: '#374151' },
  seatNumOn:  { color: '#fff' },
  seatSub:    { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  seatSubOn:  { color: 'rgba(255,255,255,0.8)' },

  submitBtn: { marginTop: 24, backgroundColor: '#FF6B35', borderRadius: 16, padding: 17, alignItems: 'center', shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  submitTxt: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

const ms = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 54 : 14, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  closeBtn:{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeTxt:{ fontSize: 20, color: '#9CA3AF' },
  title:   { fontSize: 16, fontWeight: '700', color: '#111' },

  stepBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 30, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  stepItem:{ alignItems: 'center', gap: 4 },
  dot:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dotTxt:  { color: '#fff', fontWeight: '800', fontSize: 14 },
  stepLbl: { fontSize: 11, fontWeight: '700' },
  line:    { flex: 1, height: 3, backgroundColor: '#E5E7EB', marginHorizontal: 10, borderRadius: 2 },

  hint:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18 },
  hintTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  pin:       { alignItems: 'center' },
  pinBubble: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, elevation: 4 },
  pinTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  pinTail:   { width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent' },

  bottom:     { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopWidth: 1, borderColor: '#F3F4F6', gap: 10 },
  resetBtn:   { alignItems: 'center' },
  resetTxt:   { color: '#9CA3AF', fontSize: 13 },
  confirmBtn: { backgroundColor: '#FF6B35', borderRadius: 14, padding: 16, alignItems: 'center', elevation: 4 },
  confirmOff: { backgroundColor: '#E5E7EB', elevation: 0 },
  confirmTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
