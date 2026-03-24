import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTracker } from '../context/TrackerContext';
import { theme } from '../theme/tokens';
import { AccountScreen } from '../screens/AccountScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { TodayScreen } from '../screens/TodayScreen';

const Tab = createBottomTabNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.canvas,
    card: theme.colors.shell,
    border: 'transparent',
    primary: theme.colors.ember,
    text: theme.colors.ink,
  },
};

function LoadingScreen({ message }: { message: string }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadingOrb} />
      <ActivityIndicator color={theme.colors.ember} size="large" />
      <Text style={styles.loadingTitle}>Daily Tracker Mobile</Text>
      <Text style={styles.loadingMessage}>{message}</Text>
    </View>
  );
}

export function AppNavigator() {
  const { isBooting, syncMessage } = useTracker();

  if (isBooting) {
    return <LoadingScreen message={syncMessage} />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.ember,
          tabBarInactiveTintColor: theme.colors.inkSoft,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, size }) => {
            const iconName =
              route.name === 'Today'
                ? 'sparkles-outline'
                : route.name === 'Inbox'
                  ? 'albums-outline'
                  : route.name === 'Plan'
                    ? 'calendar-outline'
                    : 'person-circle-outline';

            return <Ionicons color={color} name={iconName} size={size} />;
          },
        })}
      >
        <Tab.Screen component={TodayScreen} name="Today" />
        <Tab.Screen component={InboxScreen} name="Inbox" />
        <Tab.Screen component={PlanScreen} name="Plan" />
        <Tab.Screen component={AccountScreen} name="Account" />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
    gap: theme.spacing.md,
  },
  loadingOrb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: theme.colors.emberSoft,
    opacity: 0.35,
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  loadingMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    height: 72,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
    backgroundColor: theme.colors.shell,
    borderRadius: 28,
    ...theme.shadow.card,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
