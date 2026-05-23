import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated,
} from 'react-native';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Телефон форматтау: +7 777 123 45 67
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 1) return digits.startsWith('7') ? '+7' : digits ? '+7' : '';
  const local = digits.startsWith('7') ? digits.slice(1) : digits;
  let res = '+7';
  if (local.length > 0) res += ' ' + local.slice(0, 3);
  if (local.length > 3) res += ' ' + local.slice(3, 6);
  if (local.length > 6) res += ' ' + local.slice(6, 8);
  if (local.length > 8) res += ' ' + local.slice(8, 10);
  return res;
}

function cleanPhone(formatted) {
  return '+' + formatted.replace(/\D/g, '');
}

// ── PIN ВИЗУАЛДЫ INPUT ──────────────────────────────────────────────────────
function PinInput({ value, onChange }) {
  const inputRef = useRef(null);

  return (
    <TouchableOpacity style={pin.wrap} onPress={() => inputRef.current?.focus()} activeOpacity={1}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="numeric"
        secureTextEntry
        maxLength={4}
        style={pin.hiddenInput}
        caretHidden
      />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[pin.cell, value.length === i && pin.cellActive, value.length > i && pin.cellFilled]}>
          {value.length > i
            ? <View style={pin.dot} />
            : null}
        </View>
      ))}
    </TouchableOpacity>
  );
}

// ── ROLE CARD ───────────────────────────────────────────────────────────────
function RoleCard({ icon, title, desc, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[rc.card, selected && rc.cardSel]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[rc.iconWrap, selected && rc.iconWrapSel]}>
        <Text style={rc.icon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[rc.title, selected && rc.titleSel]}>{title}</Text>
        <Text style={rc.desc}>{desc}</Text>
      </View>
      <View style={[rc.check, selected && rc.checkSel]}>
        {selected && <View style={rc.checkDot} />}
      </View>
    </TouchableOpacity>
  );
}

// ── MAIN ────────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { login } = useAuth();

  const [mode,    setMode]    = useState('login'); // 'login' | 'register'
  const [phone,   setPhone]   = useState('');
  const [pin,     setPin]     = useState('');
  const [name,    setName]    = useState('');
  const [role,    setRole]    = useState('passenger');
  const [carInfo, setCarInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const nameRef    = useRef(null);
  const phoneRef   = useRef(null);
  const carRef     = useRef(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [mode]);

  function switchMode() {
    fadeAnim.setValue(0);
    setMode(m => m === 'login' ? 'register' : 'login');
    setPin(''); setPhone(''); setName(''); setCarInfo(''); setRole('passenger');
  }

  async function handleSubmit() {
    const cleanedPhone = cleanPhone(phone);
    if (cleanedPhone.length < 11) {
      Alert.alert('', 'Телефон нөмірін толық жазыңыз'); return;
    }
    if (pin.length !== 4) {
      Alert.alert('', '4 санды PIN-код жазыңыз'); return;
    }
    if (mode === 'register') {
      if (!name.trim()) { Alert.alert('', 'Атыңызды жазыңыз'); return; }
      if (role === 'driver' && !carInfo.trim()) {
        Alert.alert('', 'Көлік ақпаратын жазыңыз'); return;
      }
    }

    setLoading(true);
    try {
      let res;
      if (mode === 'login') {
        res = await authAPI.login({ phone: cleanedPhone, pin });
      } else {
        res = await authAPI.register({
          phone: cleanedPhone,
          pin,
          name: name.trim(),
          role,
          car_info: role === 'driver' ? carInfo.trim() : undefined,
        });
      }
      await login(res.data);
    } catch (err) {
      Alert.alert('Қате', err.response?.data?.detail || err.message || 'Сервермен байланыс қатесі');
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === 'register';
  const isDriver   = role === 'driver';
  const canSubmit  = cleanPhone(phone).length >= 11 && pin.length === 4 &&
                     (!isRegister || (name.trim() && (!isDriver || carInfo.trim())));

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ── */}
        <View style={s.hero}>
          <View style={s.logoCircle}>
            <Text style={s.logoEmoji}>🚖</Text>
          </View>
          <Text style={s.appName}>ZhCity Такси</Text>
          <Text style={s.appTagline}>Жылдам · Ыңғайлы · Сенімді</Text>
        </View>

        {/* ── ФОРМА КАРТА ── */}
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>
          <Text style={s.cardTitle}>{isRegister ? 'Жаңа аккаунт' : 'Кіру'}</Text>

          {/* Тіркелу өрістері */}
          {isRegister && (
            <>
              {/* Аты */}
              <Text style={s.label}>Атыңыз</Text>
              <View style={s.inputRow}>
                <Text style={s.inputIcon}>👤</Text>
                <TextInput
                  ref={nameRef}
                  style={s.input}
                  placeholder="Аты-жөніңіз"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  placeholderTextColor="#9CA3AF"
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                />
              </View>

              {/* Рөл */}
              <Text style={s.label}>Сіз кімсіз?</Text>
              <RoleCard
                icon="🙋"
                title="Жолаушы"
                desc="Такси шақыру, сәлемдеме жіберу"
                selected={role === 'passenger'}
                onPress={() => setRole('passenger')}
              />
              <RoleCard
                icon="🚗"
                title="Жүргізуші"
                desc="Тапсырыс қабылдап, табыс табу"
                selected={role === 'driver'}
                onPress={() => setRole('driver')}
              />

              {/* Көлік (жүргізуші ғана) */}
              {isDriver && (
                <>
                  <Text style={s.label}>Көлік ақпараты</Text>
                  <View style={s.inputRow}>
                    <Text style={s.inputIcon}>🚘</Text>
                    <TextInput
                      ref={carRef}
                      style={s.input}
                      placeholder="Toyota Camry, Ақ, 777 AAA"
                      value={carInfo}
                      onChangeText={setCarInfo}
                      placeholderTextColor="#9CA3AF"
                      returnKeyType="next"
                      onSubmitEditing={() => phoneRef.current?.focus()}
                    />
                  </View>
                  <Text style={s.hint}>Маркасы, түсі және мемлекеттік нөмірі</Text>
                </>
              )}
            </>
          )}

          {/* Телефон */}
          <Text style={s.label}>Телефон нөмірі</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>📱</Text>
            <TextInput
              ref={phoneRef}
              style={s.input}
              placeholder="+7 777 123 45 67"
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              keyboardType="phone-pad"
              placeholderTextColor="#9CA3AF"
              returnKeyType="next"
            />
          </View>

          {/* PIN */}
          <Text style={s.label}>PIN-код</Text>
          <PinInput value={pin} onChange={setPin} />
          {!isRegister && (
            <Text style={s.pinHint}>PIN ұмыттыңыз ба? «Тіркелу» арқылы жаңа PIN қойыңыз</Text>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, (!canSubmit || loading) && s.submitBtnOff]}
            onPress={handleSubmit}
            disabled={!canSubmit || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitTxt}>{isRegister ? 'Тіркелу →' : 'Кіру →'}</Text>}
          </TouchableOpacity>
        </Animated.View>

        {/* Switch */}
        <TouchableOpacity style={s.switchRow} onPress={switchMode}>
          <Text style={s.switchTxt}>
            {isRegister ? 'Аккаунтыңыз бар ма?' : 'Аккаунт жоқ па?'}
            {'  '}
            <Text style={s.switchLink}>{isRegister ? 'Кіру' : 'Тіркелу'}</Text>
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F3F4F6' },
  scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },

  /* Hero */
  hero:       { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#FF6B35', shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  logoEmoji:  { fontSize: 40 },
  appName:    { fontSize: 26, fontWeight: '900', color: '#1a1a2e', letterSpacing: -0.5 },
  appTagline: { fontSize: 13, color: '#9CA3AF', marginTop: 4, fontWeight: '500' },

  /* Карта */
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 22,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 20 },

  label: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  hint:  { fontSize: 11, color: '#9CA3AF', marginTop: -8, marginBottom: 14 },

  /* Input */
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, marginBottom: 16,
  },
  inputIcon: { fontSize: 18, marginRight: 10 },
  input: {
    flex: 1, paddingVertical: 14, fontSize: 16,
    color: '#1a1a2e', fontWeight: '500',
  },

  /* PIN */
  pinHint: { fontSize: 11, color: '#9CA3AF', marginTop: -4, marginBottom: 16, textAlign: 'center' },

  /* Submit */
  submitBtn: {
    backgroundColor: '#FF6B35', borderRadius: 16,
    paddingVertical: 17, alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  submitBtnOff: { backgroundColor: '#FCA57D', shadowOpacity: 0 },
  submitTxt: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },

  /* Switch */
  switchRow: { alignItems: 'center', paddingVertical: 8 },
  switchTxt: { color: '#9CA3AF', fontSize: 14 },
  switchLink:{ color: '#FF6B35', fontWeight: '700' },
});

// PIN styles
const pin = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 20, position: 'relative' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  cell: {
    width: 58, height: 58, borderRadius: 16,
    backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  cellActive: { borderColor: '#FF6B35', backgroundColor: '#FFF3EF' },
  cellFilled: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  dot:        { width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981' },
});

// Role card styles
const rc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#F9FAFB', borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 2, borderColor: '#E5E7EB',
  },
  cardSel:    { borderColor: '#FF6B35', backgroundColor: '#FFF3EF' },
  iconWrap:   { width: 48, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  iconWrapSel:{ backgroundColor: '#FF6B35' },
  icon:       { fontSize: 24 },
  title:      { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  titleSel:   { color: '#FF6B35' },
  desc:       { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  check:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  checkSel:   { borderColor: '#FF6B35' },
  checkDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF6B35' },
});
