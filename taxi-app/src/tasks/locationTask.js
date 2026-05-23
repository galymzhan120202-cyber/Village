import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { BASE_URL } from '../services/api';

export const LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  const loc = locations?.[0];
  if (!loc) return;

  try {
    const token = await AsyncStorage.getItem('access_token');
    if (!token) return;
    await axios.post(
      `${BASE_URL}/api/drivers/location?lat=${loc.coords.latitude}&lon=${loc.coords.longitude}`,
      {},
      { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
    );
  } catch (_) {}
});

export async function startBackgroundLocation() {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return;
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) return;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,
      distanceInterval: 30,
      foregroundService: {
        notificationTitle: 'Такси Жаңабазар',
        notificationBody: '🚗 GPS трекинг жұмыс жасауда...',
        notificationColor: '#f4a261',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
  } catch (_) {}
}

export async function stopBackgroundLocation() {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch (_) {}
}
