import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NetworkProvider } from './src/context/NetworkContext';
import './src/tasks/locationTask';
import LoginScreen          from './src/screens/LoginScreen';
import HomePassengerScreen  from './src/screens/HomePassengerScreen';
import HomeDriverScreen     from './src/screens/HomeDriverScreen';
import MapScreen            from './src/screens/MapScreen';
import CreateOrderScreen    from './src/screens/CreateOrderScreen';
import EarningsScreen       from './src/screens/EarningsScreen';
import HistoryScreen        from './src/screens/HistoryScreen';
import ProfileScreen        from './src/screens/ProfileScreen';
import ChatScreen           from './src/screens/ChatScreen';
import AddCardScreen        from './src/screens/AddCardScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#FF6B35' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        {!user ? (
          // Авторизациясыз экрандар
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : user.role === 'passenger' ? (
          // ЖОЛАУШЫ экрандары
          <>
            <Stack.Screen
              name="HomePassenger"
              component={HomePassengerScreen}
              options={{ title: '🚖 Такси Жаңабазар', headerShown: false }}
            />
            <Stack.Screen
              name="CreateOrder"
              component={CreateOrderScreen}
              options={{ title: 'Тапсырыс беру' }}
            />
            <Stack.Screen
              name="Map"
              component={MapScreen}
              options={{ title: '🗺️ Ауылдар картасы' }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ title: '📋 Тапсырыс тарихы' }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: '👤 Профиль' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({ title: `💬 ${route.params?.otherName || 'Чат'}` })}
            />
          </>
        ) : (
          // ЖҮРГІЗУШІ экрандары
          <>
            <Stack.Screen
              name="HomeDriver"
              component={HomeDriverScreen}
              options={{ title: '🚗 Жүргізуші', headerShown: false }}
            />
            <Stack.Screen
              name="Map"
              component={MapScreen}
              options={{ title: '🗺️ Ауылдар картасы' }}
            />
            <Stack.Screen
              name="Earnings"
              component={EarningsScreen}
              options={{ title: '💰 Табыс & Комиссия' }}
            />
            <Stack.Screen
              name="AddCard"
              component={AddCardScreen}
              options={{ title: '💳 Карта қосу' }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ title: '📋 Тапсырыс тарихы' }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: '👤 Профиль' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({ title: `💬 ${route.params?.otherName || 'Чат'}` })}
            />
          </>
        )}
      </Stack.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </NetworkProvider>
  );
}
