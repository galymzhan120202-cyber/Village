import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { paymentsAPI } from '../services/api';

const CARD_ICONS = { Visa: '💳', Mastercard: '💳', Kaspi: '🟡', Card: '💳' };

function detectType(num) {
  const n = num.replace(/\s/g, '');
  if (n.startsWith('4'))           return 'Visa';
  if (/^(51|52|53|54|55)/.test(n)) return 'Mastercard';
  if (/^222[1-9]|^22[3-9]|^2[3-6]|^27[01]|^2720/.test(n)) return 'Mastercard';
  return 'Card';
}

function formatCardNumber(raw) {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

export default function AddCardScreen({ navigation }) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry,     setExpiry]     = useState('');
  const [holder,     setHolder]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [focused,    setFocused]    = useState(null);

  const expiryRef = useRef(null);
  const holderRef = useRef(null);

  const cardType = detectType(cardNumber);
  const last4    = cardNumber.replace(/\s/g, '').slice(-4) || '••••';
  const displayNum = cardNumber || '•••• •••• •••• ••••';
  const displayExp = expiry    || 'MM/YY';

  async function handleSubmit() {
    const clean = cardNumber.replace(/\s/g, '');
    if (clean.length < 13) { Alert.alert('', 'Карта нөмірін толық жазыңыз'); return; }
    if (!expiry || expiry.length < 5) { Alert.alert('', 'Мерзімді MM/YY форматында жазыңыз'); return; }

    setLoading(true);
    try {
      const res = await paymentsAPI.addCard({
        card_number: clean,
        expire:      expiry,
        holder_name: holder.trim(),
      });
      Alert.alert(
        '✅ Карта тіркелді',
        res.data.message || 'Комиссия автоматты шешіледі',
        [{ text: 'Жарайды', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Қате', e.response?.data?.detail || 'Картаны тіркеу мүмкін болмады');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ── КАРТА ПРЕВЬЮ ─────────────────────────────── */}
        <View style={[s.cardPreview, focused && s.cardPreviewActive]}>
          <View style={s.cardTopRow}>
            <Text style={s.cardChip}>▣</Text>
            <Text style={s.cardTypeLabel}>{cardType}</Text>
          </View>
          <Text style={s.cardNum}>{displayNum}</Text>
          <View style={s.cardBottomRow}>
            <View>
              <Text style={s.cardFieldLabel}>КАРТА ИЕСІ</Text>
              <Text style={s.cardFieldVal}>{holder.trim() || 'АТЫ ЖӨНІ'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.cardFieldLabel}>МЕРЗІМІ</Text>
              <Text style={s.cardFieldVal}>{displayExp}</Text>
            </View>
          </View>
        </View>

        {/* ── АҚПАРАТ ───────────────────────────────────── */}
        <View style={s.infoBox}>
          <Text style={s.infoTxt}>
            💡 Тапсырыс аяқталған сайын <Text style={s.infoBold}>10% комиссия</Text> автоматты түрде осы картадан шешіледі.
          </Text>
        </View>

        {/* ── ФОРМА ─────────────────────────────────────── */}
        <View style={s.form}>
          <Text style={s.fieldLabel}>КАРТА НӨМІРІ</Text>
          <TextInput
            style={[s.input, focused === 'num' && s.inputFocused]}
            placeholder="0000 0000 0000 0000"
            value={cardNumber}
            onChangeText={(v) => setCardNumber(formatCardNumber(v))}
            keyboardType="numeric"
            maxLength={19}
            placeholderTextColor="#9CA3AF"
            onFocus={() => setFocused('num')}
            onBlur={() => setFocused(null)}
            returnKeyType="next"
            onSubmitEditing={() => expiryRef.current?.focus()}
          />

          <View style={s.row}>
            <View style={s.halfField}>
              <Text style={s.fieldLabel}>МЕРЗІМІ</Text>
              <TextInput
                ref={expiryRef}
                style={[s.input, focused === 'exp' && s.inputFocused]}
                placeholder="MM/YY"
                value={expiry}
                onChangeText={(v) => setExpiry(formatExpiry(v))}
                keyboardType="numeric"
                maxLength={5}
                placeholderTextColor="#9CA3AF"
                onFocus={() => setFocused('exp')}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
                onSubmitEditing={() => holderRef.current?.focus()}
              />
            </View>
            <View style={s.halfField}>
              <Text style={s.fieldLabel}>ИЕСІНІҢ АТЫ</Text>
              <TextInput
                ref={holderRef}
                style={[s.input, focused === 'holder' && s.inputFocused]}
                placeholder="ASET BEKZHANOV"
                value={holder}
                onChangeText={(v) => setHolder(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={26}
                placeholderTextColor="#9CA3AF"
                onFocus={() => setFocused('holder')}
                onBlur={() => setFocused(null)}
                returnKeyType="done"
              />
            </View>
          </View>
        </View>

        {/* ── SUBMIT ────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.submitBtn, loading && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitTxt}>💳  Картаны тіркеу</Text>
          }
        </TouchableOpacity>

        {/* ── ҚАУІПСІЗДІК ──────────────────────────────── */}
        <View style={s.secureRow}>
          <Text style={s.secureTxt}>🔒 Деректер шифрланған · CloudPayments</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const CARD_BG = ['#1a1a2e', '#16213e'];

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:  { padding: 20, paddingTop: 24 },

  /* Карта превью */
  cardPreview: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20, padding: 22,
    marginBottom: 20,
    shadowColor: '#1a1a2e', shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  cardPreviewActive: { shadowOpacity: 0.6, shadowRadius: 20 },
  cardTopRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  cardChip:      { fontSize: 28, color: '#F59E0B' },
  cardTypeLabel: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  cardNum:       { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 3, marginBottom: 22, fontVariant: ['tabular-nums'] },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardFieldLabel:{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 4 },
  cardFieldVal:  { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 1 },

  /* Info */
  infoBox: {
    backgroundColor: '#FFFBEB', borderRadius: 14,
    padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  infoTxt:  { fontSize: 13, color: '#92400E', lineHeight: 20 },
  infoBold: { fontWeight: '800' },

  /* Форма */
  form:       { marginBottom: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', marginBottom: 6, letterSpacing: 1.2 },
  input: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#111', borderWidth: 1.5, borderColor: '#E5E7EB',
    marginBottom: 16, letterSpacing: 1,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  inputFocused: { borderColor: '#3B82F6', shadowColor: '#3B82F6', shadowOpacity: 0.15 },
  row:       { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  /* Батырмалар */
  submitBtn: {
    backgroundColor: '#FF6B35', borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', marginTop: 8, marginBottom: 16,
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  submitBtnDisabled: { backgroundColor: '#FCA57D', shadowOpacity: 0.1 },
  submitTxt: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },

  /* Қауіпсіздік */
  secureRow: { alignItems: 'center', marginBottom: 30 },
  secureTxt: { fontSize: 12, color: '#9CA3AF', letterSpacing: 0.3 },
});
