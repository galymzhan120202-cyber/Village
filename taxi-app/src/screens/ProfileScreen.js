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

  // PIN өзгерту
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
    } catch (e) {
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
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) { Alert.alert('', 'PIN-код — 4 сан'); return; }
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
    return <View style={s.center}><ActivityIndicator size="large" color="#f4a261" /></View>;
  }

  const roleLabel = user?.role === 'driver' ? '🚗 Жүргізуші' : '🙋 Жолаушы';
  const avatarEmoji = user?.role === 'driver' ? '🚗' : '👤';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>

        {/* ── Аватар карточкасы ── */}
        <View style={s.avatarCard}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarEmoji}>{avatarEmoji}</Text>
          </View>
          <Text style={s.profileName}>{name}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleBadgeText}>{roleLabel}</Text>
          </View>
          <Text style={s.profilePhone}>{phone}</Text>
        </View>

        {/* ── Ат өзгерту ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Жеке ақпарат</Text>

          <Text style={s.label}>Атыңыз</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Атыңыз"
            placeholderTextColor="#bbb"
          />

          <Text style={s.label}>Телефон нөмірі</Text>
          <View style={s.inputReadonly}>
            <Text style={s.inputReadonlyText}>{phone}</Text>
            <Text style={s.inputReadonlyHint}>өзгертуге болмайды</Text>
          </View>

          {user?.role === 'driver' && (
            <>
              <Text style={s.label}>Көлік ақпараты</Text>
              <TextInput
                style={s.input}
                value={carInfo}
                onChangeText={setCarInfo}
                placeholder="Мысалы: Toyota Camry Ақ 777 AAA"
                placeholderTextColor="#bbb"
              />
            </>
          )}

          <TouchableOpacity style={s.saveBtn} onPress={saveProfile} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>💾 Сақтау</Text>}
          </TouchableOpacity>
        </View>

        {/* ── PIN өзгерту ── */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.pinToggle}
            onPress={() => setPinOpen(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={s.sectionTitle}>🔐 PIN-кодты өзгерту</Text>
            <Text style={s.pinToggleArrow}>{pinOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {pinOpen && (
            <View style={s.pinForm}>
              <Text style={s.label}>Ескі PIN-код</Text>
              <TextInput
                style={s.input}
                value={oldPin}
                onChangeText={t => setOldPin(t.replace(/\D/g,'').slice(0,4))}
                placeholder="••••"
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
                placeholderTextColor="#bbb"
              />

              <Text style={s.label}>Жаңа PIN-код</Text>
              <TextInput
                style={s.input}
                value={newPin}
                onChangeText={t => setNewPin(t.replace(/\D/g,'').slice(0,4))}
                placeholder="••••"
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
                placeholderTextColor="#bbb"
              />

              <Text style={s.label}>Жаңа PIN-кодты қайталаңыз</Text>
              <TextInput
                style={s.input}
                value={newPin2}
                onChangeText={t => setNewPin2(t.replace(/\D/g,'').slice(0,4))}
                placeholder="••••"
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
                placeholderTextColor="#bbb"
              />

              <TouchableOpacity style={s.pinSaveBtn} onPress={changePin} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>✅ PIN өзгерту</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Шығу батырмасы ── */}
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() =>
            Alert.alert('Шығу', 'Аккаунттан шығасыз ба?', [
              { text: 'Жоқ' },
              { text: 'Иә, шығу', style: 'destructive', onPress: logout },
            ])
          }
        >
          <Text style={s.logoutText}>🚪 Аккаунттан шығу</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f5f5' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Аватар карточкасы
  avatarCard: {
    backgroundColor: '#f4a261', alignItems: 'center',
    paddingTop: 36, paddingBottom: 28, paddingHorizontal: 20,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarEmoji:   { fontSize: 42 },
  profileName:   { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  roleBadge:     { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 8 },
  roleBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  profilePhone:  { color: 'rgba(255,255,255,0.85)', fontSize: 14 },

  // Секция
  section: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 14,
    borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 14 },

  label:         { fontSize: 12, fontWeight: '700', color: '#aaa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#f7f7f7', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#1a1a2e', borderWidth: 1, borderColor: '#eee',
    marginBottom: 14,
  },
  inputReadonly: {
    backgroundColor: '#f0f0f0', borderRadius: 12, padding: 14,
    marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  inputReadonlyText: { fontSize: 15, color: '#555' },
  inputReadonlyHint: { fontSize: 11, color: '#bbb' },

  saveBtn:    { backgroundColor: '#f4a261', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4, shadowColor: '#f4a261', shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  saveBtnText:{ color: '#fff', fontWeight: 'bold', fontSize: 15 },

  // PIN секциясы
  pinToggle:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pinToggleArrow: { fontSize: 14, color: '#aaa' },
  pinForm:    { marginTop: 14 },
  pinSaveBtn: { backgroundColor: '#2ecc71', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },

  // Шығу
  logoutBtn:  {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#ffd0d0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  logoutText: { color: '#e74c3c', fontWeight: '700', fontSize: 16 },
});
