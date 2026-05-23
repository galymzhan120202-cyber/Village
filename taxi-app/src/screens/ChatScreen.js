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
    return <View style={s.center}><ActivityIndicator color="#f4a261" size="large" /></View>;
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
  container:  { flex: 1, backgroundColor: '#f0f0f0' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:       { padding: 12, paddingBottom: 8, flexGrow: 1 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 16, fontWeight: 'bold', color: '#888' },
  emptySub:   { fontSize: 13, color: '#bbb', marginTop: 4 },

  msgRow:     { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther:{ justifyContent: 'flex-start' },

  avatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  avatarText: { fontSize: 16 },

  bubble:      { maxWidth: '75%', borderRadius: 18, padding: 10, paddingHorizontal: 14 },
  bubbleMine:  { backgroundColor: '#f4a261', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3 },

  senderName:  { fontSize: 11, fontWeight: '700', color: '#f4a261', marginBottom: 3 },
  msgText:     { fontSize: 15, color: '#1a1a2e', lineHeight: 20 },
  msgTextMine: { color: '#fff' },
  msgTime:     { fontSize: 10, color: '#aaa', marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMine: { color: 'rgba(255,255,255,0.7)' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#fff', padding: 10, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: '#eee',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  input: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, color: '#1a1a2e', marginRight: 8,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  sendBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f4a261', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  sendBtnOff: { backgroundColor: '#ddd' },
  sendIcon:   { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
