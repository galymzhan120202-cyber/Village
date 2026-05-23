import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { ordersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS = {
  active:    { label: 'Іздеуде',    bg: '#FEF9C3', color: '#D97706', dot: '#F59E0B' },
  accepted:  { label: 'Жолда',      bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6' },
  finished:  { label: 'Аяқталды',   bg: '#ECFDF5', color: '#059669', dot: '#10B981' },
  cancelled: { label: 'Жойылды',    bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
};

function routeLabel(o) {
  if (o.route === 'local')           return `${o.village} ← ішінде →`;
  if (o.route === 'village_city')    return `${o.village} → Шымкент`;
  if (o.route === 'city_village')    return `Шымкент → ${o.village}`;
  if (o.route === 'village_village') return `${o.village} → ${o.to_loc}`;
  return o.village || '—';
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('kk-KZ', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await ordersAPI.history();
      setOrders(res.data);
    } catch (_) {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor="#FF6B35"
        />
      }
    >
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Тарих</Text>
        <Text style={s.headerSub}>{orders.length} тапсырыс</Text>
      </View>

      {orders.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyTitle}>Тарих бос</Text>
          <Text style={s.emptySub}>Аяқталған тапсырыстар осында көрінеді</Text>
        </View>
      ) : (
        <View style={s.list}>
          {orders.map((o) => {
            const st = STATUS[o.status] || { label: o.status, bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' };
            const fromAddr = o.landmark || (o.route === 'city_village' ? 'Шымкент' : o.village) || '—';
            const toAddr   = o.to_loc || (o.route === 'village_city' ? 'Шымкент' : o.village) || '—';

            return (
              <View key={o.id} style={s.card}>
                {/* Карточка шыңы */}
                <View style={s.cardTop}>
                  <View style={s.typeRow}>
                    <Text style={s.typeIcon}>
                      {o.order_type === 'delivery' ? '📦' : '🚖'}
                    </Text>
                    <Text style={s.typeLabel}>
                      {o.order_type === 'delivery' ? 'Сәлемдеме' : 'Такси'}
                    </Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                    <View style={[s.badgeDot, { backgroundColor: st.dot }]} />
                    <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                {/* Маршрут */}
                <View style={s.routeBlock}>
                  <View style={s.addrRow}>
                    <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                    <Text style={s.addrTxt} numberOfLines={1}>{fromAddr}</Text>
                  </View>
                  <View style={s.addrConnector} />
                  <View style={s.addrRow}>
                    <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
                    <Text style={s.addrTxt} numberOfLines={1}>{toAddr}</Text>
                  </View>
                </View>

                {/* Төменгі жол: баға + күн */}
                <View style={s.cardBottom}>
                  <Text style={s.price}>{o.price} тг</Text>
                  <Text style={s.date}>{formatDate(o.created_at)}</Text>
                </View>

                {/* Рейтинг (аяқталған болса) */}
                {o.status === 'finished' && o.rating > 0 && (
                  <View style={s.ratingRow}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Text key={i} style={i <= o.rating ? s.starOn : s.starOff}>★</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#F3F4F6' },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:     { backgroundColor: '#fff', padding: 20, paddingTop: 24, marginBottom: 8 },
  headerTitle:{ fontSize: 24, fontWeight: '800', color: '#1a1a2e' },
  headerSub:  { fontSize: 13, color: '#9CA3AF', marginTop: 2 },

  empty:      { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub:   { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  list:     { paddingHorizontal: 16, paddingTop: 4 },

  card:     {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  typeRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeIcon:  { fontSize: 18 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },

  badge:      { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
  badgeDot:   { width: 7, height: 7, borderRadius: 4 },
  badgeText:  { fontSize: 12, fontWeight: '700' },

  routeBlock: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 12, gap: 6 },
  addrRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:        { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  addrTxt:    { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  addrConnector: { width: 1, height: 6, backgroundColor: '#D1D5DB', marginLeft: 4 },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price:      { fontSize: 16, fontWeight: '800', color: '#FF6B35' },
  date:       { fontSize: 12, color: '#9CA3AF' },

  ratingRow:  { flexDirection: 'row', marginTop: 10, gap: 2 },
  starOn:     { fontSize: 16, color: '#F59E0B' },
  starOff:    { fontSize: 16, color: '#D1D5DB' },
});
