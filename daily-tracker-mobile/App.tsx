import 'react-native-gesture-handler';

import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TrackerProvider } from './src/context/TrackerContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TrackerProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </TrackerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
