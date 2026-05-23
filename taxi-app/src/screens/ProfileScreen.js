import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

export default function ProfileScreen({ navigation }) {
  const { user, logout, updateUser } = useAuth();

  const [name,    setName]    = useState(user?.name || '');
  const [carInfo, setCarInfo] = useState('');
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching,setFetching]= useState(true);

  const [pinOpen,  setPinOpen]  = useState(false);
  const [oldPin,   setOldPin]   = useState('');
  const [newPin,   setNewPin]   = useState('');
  const [newPin2,  setNewPin2]  = useState('');

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    try {
      const res = await authAPI.getProfile();
      setName(res.data.name);
      setPhone(res.data.phone);
      setCarInfo(res.data.car_info || '');
    } catch {
      setPhone(user?.phone || '');
    } finally {
      setFetching(false);
    }
  }

  async function saveProfile() {
    if (!name.trim()) { Alert.alert('', 'Атыңызды жазыңыз'); return; }
    setLoading(true);
    try {
      const payload = { name: name.trim() };
      if (user?.role === 'driver') payload.car_info = carInfo.trim();
      await authAPI.updateProfile(payload);
      await updateUser({ name: name.trim() });
      Alert.alert('✅', 'Профиль сақталды');
    } catch (e) {
      Alert.alert('Қате', e.response?.data?.detail || 'Сервер қатесі');
    } finally {
      setLoading(false);
    }
  }

  async function changePin() {
    if (!oldPin || !newPin || !newPin2) { Alert.alert('', 'Барлық өрісті толтырыңыз'); return; }
    if (newPin !== newPin2) { Alert.alert('', 'Жаңа PIN-кодтар сәйкес емес'); return; }
    if (newPin.length !== 4) { Alert.alert('', 'PIN-код — 4 сан'); return; }
    setLoading(true);
    try {
      await authAPI.updateProfile({ old_pin: oldPin, new_pin: newPin });
      Alert.alert('✅', 'PIN-код өзгертілді');
      setOldPin(''); setNewPin(''); setNewPin2('');
      setPinOpen(false);
    } catch (e) {
      Alert.alert('Қате', e.response?.data?.detail || 'Сервер қатесі');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View>;
  }

  const isDriver = user?.role === 'driver';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={s.screen} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── ПРОФИЛЬ КАРТОЧКАСЫ ── */}
        <View style={s.profileHero}>
          <View style={s.heroDecor} />
          <View style={s.avatarWrap}>
            <View style={s.avatar}>
              <Text style={s.avatarEmoji}>{isDriver ? '🚗' : '👤'}</Text>
            </View>
            <View style={s.onlineDot} />
          </View>
          <Text style={s.heroName}>{name}</Text>
          <View style={s.rolePill}>
            <Text style={s.rolePillTxt}>{isDriver ? '🚗 Жүргізуші' : '🙋 Жолаушы'}</Text>
          </View>
          <Text style={s.heroPhone}>{phone}</Text>
        </View>

        {/* ── ЖЕКЕ АҚПАРАТ ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Жеке ақпарат</Text>

          <Text style={s.label}>Атыңыз</Text>
          <View style={s.inputWrap}>
            <Text style={s.inputIcon}>👤</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Аты-жөніңіз"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <Text style={s.label}>Телефон нөмірі</Text>
          <View style={[s.inputWrap, s.inputWrapReadonly]}>
            <Text style={s.inputIcon}>📱</Text>
            <Text style={s.inputReadonlyTxt}>{phone}</Text>
            <View style={s.lockBadge}><Text style={s.lockTxt}>🔒</Text></View>
          </View>

          {isDriver && (
            <>
              <Text style={s.label}>Көлік ақпараты</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🚘</Text>
                <TextInput
                  style={s.input}
                  value={carInfo}
                  onChangeText={setCarInfo}
                  placeholder="Toyota Camry, Ақ, 777 AAA"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </>
          )}

          <TouchableOpacity style={s.saveBtn} onPress={saveProfile} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnTxt}>💾  Сақтау</Text>}
          </TouchableOpacity>
        </View>

        {/* ── PIN ӨЗГЕРТУ ── */}
        <View style={s.card}>
          <TouchableOpacity style={s.pinToggleRow} onPress={() => setPinOpen(v => !v)} activeOpacity={0.7}>
            <View style={s.pinToggleLeft}>
              <View style={s.pinIconWrap}><Text style={{ fontSize: 18 }}>🔐</Text></View>
              <Text style={s.cardTitle}>PIN-кодты өзгерту</Text>
            </View>
            <Text style={s.chevron}>{pinOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {pinOpen && (
            <View style={s.pinForm}>
              <View style={s.pinDivider} />

              <Text style={s.label}>Ескі PIN-код</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🔑</Text>
                <TextInput
                  style={s.input}
                  value={oldPin}
                  onChangeText={t => setOldPin(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="• • • •"
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={4}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <Text style={s.label}>Жаңа PIN-код</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🔑</Text>
                <TextInput
                  style={s.input}
                  value={newPin}
                  onChangeText={t => setNewPin(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="• • • •"
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={4}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <Text style={s.label}>Қайталаңыз</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🔑</Text>
                <TextInput
                  style={s.input}
                  value={newPin2}
                  onChangeText={t => setNewPin2(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="• • • •"
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={4}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={changePin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnTxt}>✅  PIN өзгерту</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── ШЫҒУ ── */}
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() =>
            Alert.alert('Шығу', 'Аккаунттан шығасыз ба?', [
              { text: 'Жоқ' },
              { text: 'Иә, шығу', style: 'destructive', onPress: logout },
            ])
          }
        >
          <Text style={s.logoutTxt}>🚪  Аккаунттан шығу</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ── HERO ── */
  profileHero: {
    backgroundColor: '#1a1a2e', alignItems: 'center',
    paddingTop: 32, paddingBottom: 28, paddingHorizontal: 20,
    marginBottom: 12, overflow: 'hidden',
  },
  heroDecor: {
    position: 'absolute', top: -60, right: -60,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  avatarWrap:   { marginBottom: 12, position: 'relative' },
  avatar:       {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.6, shadowRadius: 16, elevation: 10,
  },
  avatarEmoji:  { fontSize: 42 },
  onlineDot:    {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#10B981', borderWidth: 3, borderColor: '#1a1a2e',
  },
  heroName:  { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 },
  rolePill:  { backgroundColor: 'rgba(255,107,53,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)' },
  rolePillTxt: { color: '#FF6B35', fontWeight: '700', fontSize: 13 },
  heroPhone: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },

  /* ── КАРТОЧКА ── */
  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a2e', marginBottom: 16 },

  label: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8,
  },

  /* Input */
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, marginBottom: 14,
  },
  inputWrapReadonly: { backgroundColor: '#F3F4F6' },
  inputIcon: { fontSize: 18 },
  input:     { flex: 1, paddingVertical: 14, fontSize: 15, color: '#1a1a2e', fontWeight: '500' },
  inputReadonlyTxt: { flex: 1, fontSize: 15, color: '#6B7280', paddingVertical: 14 },
  lockBadge: { backgroundColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  lockTxt:   { fontSize: 12 },

  /* Save btn */
  saveBtn:    {
    backgroundColor: '#FF6B35', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  /* PIN section */
  pinToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pinToggleLeft:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  pinIconWrap:  { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' },
  chevron:      { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  pinDivider:   { height: 1, backgroundColor: '#F3F4F6', marginVertical: 14 },
  pinForm:      {},

  /* Logout */
  logoutBtn: {
    marginHorizontal: 16, borderRadius: 18, padding: 18,
    backgroundColor: '#fff', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FEE2E2',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  logoutTxt: { color: '#EF4444', fontWeight: '700', fontSize: 16 },
});
