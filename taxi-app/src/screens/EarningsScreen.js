import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { driverAPI, paymentsAPI } from '../services/api';

const STATUS_COLORS = {
  ok:      { bg: '#ECFDF5', text: '#065F46', label: 'Шешілді ✓' },
  failed:  { bg: '#FEF2F2', text: '#991B1B', label: 'Қате ✗'    },
  no_card: { bg: '#FFF7ED', text: '#9A3412', label: 'Карта жоқ' },
  pending: { bg: '#F3F4F6', text: '#6B7280', label: 'Күтуде...' },
};

export default function EarningsScreen({ navigation }) {
  const [earnings, setEarnings]   = useState(null);
  const [commData, setCommData]   = useState(null);
  const [loading,  setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eRes, cRes] = await Promise.all([
        driverAPI.earnings(),
        paymentsAPI.commissionLogs(),
      ]);
      setEarnings(eRes.data);
      setCommData(cRes.data);
    } catch (e) {
      Alert.alert('Қате', 'Мәлімет жүктелмеді');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  async function removeCard(card_id) {
    Alert.alert('Растау', 'Картаны жою керек пе?', [
      { text: 'Жоқ' },
      {
        text: 'Иә, жою', style: 'destructive', onPress: async () => {
          try {
            await paymentsAPI.removeCard(card_id);
            load();
          } catch {
            Alert.alert('Қате', 'Картаны жою мүмкін болмады');
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View>;
  }

  const hasCard = commData?.has_card;
  const pct     = commData?.commission_pct ?? 10;

  return (
    <ScrollView
      style={s.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* ── АПТАЛЫҚ СТАТИСТИКА ─────────────────────────── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📅 Осы аптада</Text>
        <View style={s.statsGrid}>
          <View style={s.statCell}>
            <Text style={s.statBig}>{earnings?.weekly_completed ?? 0}</Text>
            <Text style={s.statSub}>тапсырыс</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCell}>
            <Text style={[s.statBig, { color: '#10B981' }]}>{earnings?.weekly_income ?? 0} тг</Text>
            <Text style={s.statSub}>табыс</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCell}>
            <Text style={[s.statBig, { color: '#EF4444' }]}>{commData?.weekly_commission ?? 0} тг</Text>
            <Text style={s.statSub}>комиссия ({pct}%)</Text>
          </View>
        </View>
      </View>

      {/* ── КАРТА ─────────────────────────────────────── */}
      {hasCard ? (
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>💳 Байланысқан карта</Text>
            <View style={s.activeBadge}><Text style={s.activeBadgeTxt}>Белсенді</Text></View>
          </View>
          <View style={s.savedCard}>
            <View style={s.savedCardLeft}>
              <Text style={s.savedCardType}>{commData?.card_type}</Text>
              <Text style={s.savedCardNum}>•••• •••• •••• {commData?.card_last4}</Text>
            </View>
            <TouchableOpacity
              style={s.removeBtn}
              onPress={() => {
                // Get the active card id from logs
                Alert.alert('Картаны жою', 'Картаны жойсаңыз комиссия автоматты шешілмейді', [
                  { text: 'Болдырмау' },
                  {
                    text: 'Жою', style: 'destructive',
                    onPress: async () => {
                      try {
                        const cards = await paymentsAPI.myCards();
                        const active = cards.data.find(c => c.is_active);
                        if (active) await paymentsAPI.removeCard(active.id);
                        load();
                      } catch { Alert.alert('Қате'); }
                    },
                  },
                ]);
              }}
            >
              <Text style={s.removeBtnTxt}>Жою</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.cardHint}>
            Тапсырыс аяқталғанда <Text style={{ fontWeight: '800' }}>{pct}%</Text> автоматты шешіледі
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={s.addCardBtn}
          onPress={() => navigation.navigate('AddCard')}
          activeOpacity={0.85}
        >
          <View style={s.addCardIcon}><Text style={{ fontSize: 28 }}>💳</Text></View>
          <View style={s.addCardText}>
            <Text style={s.addCardTitle}>Карта қосыңыз</Text>
            <Text style={s.addCardSub}>{pct}% комиссия автоматты шешілсін</Text>
          </View>
          <Text style={s.addCardArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* ── КОМИССИЯ ТАРИХЫ ───────────────────────────── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📋 Комиссия тарихы</Text>
        {!commData?.logs?.length ? (
          <Text style={s.emptyTxt}>Тарих жоқ</Text>
        ) : (
          commData.logs.map((log) => {
            const sc = STATUS_COLORS[log.status] || STATUS_COLORS.pending;
            return (
              <View key={log.id} style={s.logRow}>
                <View style={s.logLeft}>
                  <Text style={s.logOrder}>Тапсырыс #{log.order_id}</Text>
                  <Text style={s.logDate}>{log.created_at?.slice(0, 16)}</Text>
                </View>
                <View style={s.logRight}>
                  <Text style={s.logAmount}>−{log.amount} тг</Text>
                  <View style={[s.logBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[s.logBadgeTxt, { color: sc.text }]}>{sc.label}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle:  { fontSize: 15, fontWeight: '800', color: '#111' },

  /* Статистика */
  statsGrid:   { flexDirection: 'row', alignItems: 'center' },
  statCell:    { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statDivider: { width: 1, height: 40, backgroundColor: '#F3F4F6' },
  statBig:     { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 4 },
  statSub:     { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },

  /* Белсенді badge */
  activeBadge:    { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#065F46' },

  /* Сақталған карта */
  savedCard:     { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  savedCardLeft: { flex: 1 },
  savedCardType: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  savedCardNum:  { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: 2 },
  removeBtn:     { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  removeBtnTxt:  { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  cardHint:      { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },

  /* Карта қосу батырмасы */
  addCardBtn: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 12, borderWidth: 2, borderColor: '#FF6B35',
    borderStyle: 'dashed',
    shadowColor: '#FF6B35', shadowOpacity: 0.1, shadowRadius: 8, elevation: 2,
  },
  addCardIcon:  { width: 52, height: 52, borderRadius: 16, backgroundColor: '#FFF3EF', alignItems: 'center', justifyContent: 'center' },
  addCardText:  { flex: 1 },
  addCardTitle: { fontSize: 16, fontWeight: '800', color: '#FF6B35' },
  addCardSub:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  addCardArrow: { fontSize: 24, color: '#FF6B35', fontWeight: '300' },

  /* Тарих */
  emptyTxt:    { color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 },
  logRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  logLeft:     {},
  logOrder:    { fontSize: 14, fontWeight: '700', color: '#111' },
  logDate:     { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  logRight:    { alignItems: 'flex-end', gap: 6 },
  logAmount:   { fontSize: 15, fontWeight: '800', color: '#EF4444' },
  logBadge:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  logBadgeTxt: { fontSize: 11, fontWeight: '700' },
});
