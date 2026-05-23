import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { ordersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL = {
  active:   { text: 'Іздеуде',   color: '#f39c12' },
  accepted: { text: 'Қабылданды', color: '#3498db' },
  finished: { text: 'Аяқталды',  color: '#2ecc71' },
  cancelled:{ text: 'Жойылды',   color: '#e74c3c' },
};

export default function HistoryScreen() {
  const { user } = useAuth();
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await ordersAPI.history();
      setOrders(res.data);
    } catch (e) {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function routeLabel(o) {
    if (o.route === 'local')           return `${o.village} (ауыл ішінде)`;
    if (o.route === 'village_city')    return `${o.village} → Шымкент`;
    if (o.route === 'city_village')    return `Шымкент → ${o.village}`;
    if (o.route === 'village_village') return `${o.village} → ${o.to_loc}`;
    return o.village || '—';
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#f4a261" /></View>;
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={s.title}>📋 Тапсырыс тарихы</Text>

      {orders.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyText}>Тарих бос</Text>
        </View>
      ) : (
        orders.map((o) => {
          const st = STATUS_LABEL[o.status] || { text: o.status, color: '#999' };
          return (
            <View key={o.id} style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.orderType}>
                  {o.order_type === 'delivery' ? '📦 Сәлемдеме' : '🚖 Такси'}
                </Text>
                <View style={[s.badge, { backgroundColor: st.color + '22', borderColor: st.color }]}>
                  <Text style={[s.badgeText, { color: st.color }]}>{st.text}</Text>
                </View>
              </View>

              <Text style={s.route}>📍 {routeLabel(o)}</Text>
              <Text style={s.price}>💰 {o.price} тг</Text>

              {o.created_at ? (
                <Text style={s.date}>
                  🕐 {new Date(o.created_at).toLocaleDateString('kk-KZ', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 16 },

  empty:      { alignItems: 'center', marginTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { color: '#aaa', fontSize: 16 },

  card:       {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderType:  { fontWeight: 'bold', fontSize: 14, color: '#1a1a2e' },
  badge:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  badgeText:  { fontSize: 12, fontWeight: '600' },
  route:      { color: '#555', fontSize: 14, marginBottom: 4 },
  price:      { fontWeight: 'bold', color: '#1a1a2e', fontSize: 14, marginBottom: 4 },
  date:       { color: '#aaa', fontSize: 12 },
});
