import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { driverAPI, paymentsAPI } from '../services/api';

const STATUS_COLORS = {
  ok:      { bg: '#ECFDF5', text: '#065F46', dot: '#10B981', label: 'Шешілді' },
  failed:  { bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444', label: 'Қате'    },
  no_card: { bg: '#FFF7ED', text: '#9A3412', dot: '#F97316', label: 'Карта жоқ' },
  pending: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF', label: 'Күтуде' },
};

export default function EarningsScreen({ navigation }) {
  const [earnings,   setEarnings]   = useState(null);
  const [commData,   setCommData]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eRes, cRes] = await Promise.all([
        driverAPI.earnings(),
        paymentsAPI.commissionLogs(),
      ]);
      setEarnings(eRes.data);
      setCommData(cRes.data);
    } catch {
      Alert.alert('Қате', 'Мәлімет жүктелмеді');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View>;
  }

  const hasCard = commData?.has_card;
  const pct     = commData?.commission_pct ?? 10;
  const logs    = commData?.logs || [];

  return (
    <ScrollView
      style={s.screen}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor="#FF6B35"
        />
      }
    >
      {/* ── HERO СТАТИСТИКА ── */}
      <View style={s.hero}>
        <View style={s.heroDecor} />
        <View style={s.heroDecor2} />
        <Text style={s.heroLabel}>Осы апта</Text>
        <Text style={s.heroIncome}>{earnings?.weekly_income ?? 0} тг</Text>
        <Text style={s.heroSub}>Жалпы табыс</Text>

        <View style={s.heroStats}>
          <View style={s.heroStat}>
            <Text style={s.heroStatNum}>{earnings?.weekly_completed ?? 0}</Text>
            <Text style={s.heroStatLabel}>тапсырыс</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={[s.heroStatNum, { color: '#FCA57D' }]}>
              {commData?.weekly_commission ?? 0} тг
            </Text>
            <Text style={s.heroStatLabel}>комиссия ({pct}%)</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={[s.heroStatNum, { color: '#10B981' }]}>
              {Math.max(0, (earnings?.weekly_income ?? 0) - (commData?.weekly_commission ?? 0))} тг
            </Text>
            <Text style={s.heroStatLabel}>таза табыс</Text>
          </View>
        </View>
      </View>

      <View style={s.body}>
        {/* ── КАРТА ── */}
        {hasCard ? (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>💳 Байланысқан карта</Text>
              <View style={s.activeBadge}>
                <View style={s.activeDot} />
                <Text style={s.activeBadgeTxt}>Белсенді</Text>
              </View>
            </View>

            <View style={s.savedCard}>
              <View style={s.savedCardChip}>
                <Text style={{ fontSize: 18, color: '#F59E0B' }}>▣</Text>
              </View>
              <View style={s.savedCardInfo}>
                <Text style={s.savedCardType}>{commData?.card_type}</Text>
                <Text style={s.savedCardNum}>•••• •••• •••• {commData?.card_last4}</Text>
              </View>
              <TouchableOpacity
                style={s.removeBtn}
                onPress={() =>
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
                  ])
                }
              >
                <Text style={s.removeBtnTxt}>Жою</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.cardHint}>
              Тапсырыс аяқталғанда <Text style={{ fontWeight: '800', color: '#FF6B35' }}>{pct}%</Text> автоматты шешіледі
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={s.addCardBtn}
            onPress={() => navigation.navigate('AddCard')}
            activeOpacity={0.85}
          >
            <View style={s.addCardIconWrap}>
              <Text style={{ fontSize: 26 }}>💳</Text>
            </View>
            <View style={s.addCardText}>
              <Text style={s.addCardTitle}>Карта қосыңыз</Text>
              <Text style={s.addCardSub}>{pct}% комиссия автоматты шешілсін</Text>
            </View>
            <Text style={s.addCardArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── КОМИССИЯ ТАРИХЫ ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📋 Комиссия тарихы</Text>
          {logs.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
              <Text style={s.emptyTxt}>Тарих жоқ</Text>
            </View>
          ) : (
            logs.map((log) => {
              const sc = STATUS_COLORS[log.status] || STATUS_COLORS.pending;
              return (
                <View key={log.id} style={s.logRow}>
                  <View style={[s.logDot, { backgroundColor: sc.dot }]} />
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

        <View style={{ height: 32 }} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ── HERO ── */
  hero: {
    backgroundColor: '#1a1a2e',
    paddingTop: 28, paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center', overflow: 'hidden',
  },
  heroDecor: {
    position: 'absolute', top: -50, right: -50,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  heroDecor2: {
    position: 'absolute', bottom: -40, left: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  heroLabel:   { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginBottom: 8, letterSpacing: 1 },
  heroIncome:  { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 4 },
  heroSub:     { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 },
  heroStats:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, width: '100%' },
  heroStat:    { flex: 1, alignItems: 'center' },
  heroStatNum: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600', textAlign: 'center' },
  heroStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },

  body: { padding: 16 },

  /* ── КАРТОЧКА ── */
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle:  { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },

  activeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  activeDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' },
  activeBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#065F46' },

  /* Сақталған карта */
  savedCard:     { backgroundColor: '#1a1a2e', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  savedCardChip: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  savedCardInfo: { flex: 1 },
  savedCardType: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  savedCardNum:  { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 2 },
  removeBtn:     { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  removeBtnTxt:  { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  cardHint:      { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },

  /* Карта қосу */
  addCardBtn: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 12, borderWidth: 2, borderColor: '#FF6B35',
    borderStyle: 'dashed',
    shadowColor: '#FF6B35', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  addCardIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#FFF3EF', alignItems: 'center', justifyContent: 'center' },
  addCardText:     { flex: 1 },
  addCardTitle:    { fontSize: 16, fontWeight: '800', color: '#FF6B35' },
  addCardSub:      { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  addCardArrow:    { fontSize: 26, color: '#FF6B35', fontWeight: '300' },

  /* Тарих */
  emptyBox: { alignItems: 'center', paddingVertical: 24 },
  emptyTxt: { color: '#9CA3AF', fontSize: 15, fontWeight: '600' },

  logRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 12 },
  logDot:    { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  logLeft:   { flex: 1 },
  logOrder:  { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  logDate:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  logRight:  { alignItems: 'flex-end', gap: 5 },
  logAmount: { fontSize: 15, fontWeight: '800', color: '#EF4444' },
  logBadge:  { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  logBadgeTxt: { fontSize: 11, fontWeight: '700' },
});
