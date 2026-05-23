import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { ordersAPI } from '../services/api';

export default function ChatScreen({ route }) {
  const { orderId, otherName } = route.params;
  const { user } = useAuth();

  const [messages,  setMessages]  = useState([]);
  const [text,      setText]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const flatListRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    loadMessages();
    intervalRef.current = setInterval(loadMessages, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  async function loadMessages() {
    try {
      const res = await ordersAPI.getMessages(orderId);
      setMessages(res.data);
      // Оқылды деп белгілеу — хабарлама санын сақтаймыз
      await AsyncStorage.setItem(`chat_read_${orderId}`, String(res.data.length));
    } catch (e) {}
    finally { setLoading(false); }
  }

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await ordersAPI.sendMessage(orderId, trimmed);
      await loadMessages();
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  function renderMessage({ item }) {
    const isMine = item.sender_id === user.user_id;
    const time = new Date(item.created_at).toLocaleTimeString('kk-KZ', {
      hour: '2-digit', minute: '2-digit',
    });

    return (
      <View style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowOther]}>
        {!isMine && (
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {item.sender_role === 'driver' ? '🚗' : '👤'}
            </Text>
          </View>
        )}
        <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
          {!isMine && (
            <Text style={s.senderName}>{item.sender_name}</Text>
          )}
          <Text style={[s.msgText, isMine && s.msgTextMine]}>{item.text}</Text>
          <Text style={[s.msgTime, isMine && s.msgTimeMine]}>{time}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#FF6B35" size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Хабарлама тізімі */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => String(m.id)}
        renderItem={renderMessage}
        contentContainerStyle={s.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>💬</Text>
            <Text style={s.emptyText}>Хабарлама жоқ</Text>
            <Text style={s.emptySub}>Алғашқы хабарламаны жіберіңіз</Text>
          </View>
        }
      />

      {/* Жіберу өрісі */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Хабарлама жазыңыз..."
          placeholderTextColor="#bbb"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnOff]}
          onPress={send}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.sendIcon}>➤</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F3F4F6' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:       { padding: 14, paddingBottom: 8, flexGrow: 1 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon:  { fontSize: 52, marginBottom: 14 },
  emptyText:  { fontSize: 17, fontWeight: '800', color: '#374151', marginBottom: 4 },
  emptySub:   { fontSize: 13, color: '#9CA3AF' },

  msgRow:     { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther:{ justifyContent: 'flex-start' },

  avatar:     {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderWidth: 1.5, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  avatarText: { fontSize: 16 },

  bubble:      { maxWidth: '78%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine:  {
    backgroundColor: '#FF6B35', borderBottomRightRadius: 6,
    shadowColor: '#FF6B35', shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  bubbleOther: {
    backgroundColor: '#fff', borderBottomLeftRadius: 6,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },

  senderName:  { fontSize: 11, fontWeight: '700', color: '#FF6B35', marginBottom: 3 },
  msgText:     { fontSize: 15, color: '#1a1a2e', lineHeight: 21 },
  msgTextMine: { color: '#fff' },
  msgTime:     { fontSize: 10, color: '#9CA3AF', marginTop: 5, alignSelf: 'flex-end' },
  msgTimeMine: { color: 'rgba(255,255,255,0.65)' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
  },
  input: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, color: '#1a1a2e',
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  sendBtn:    {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  sendBtnOff: { backgroundColor: '#E5E7EB', shadowOpacity: 0, elevation: 0 },
  sendIcon:   { color: '#fff', fontSize: 18 },
});
