import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import LicensesScreen from './src/screens/LicensesScreen';
import LicenseDetailScreen from './src/screens/LicenseDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ScanScreen from './src/screens/ScanScreen';

// Stores
import { useAuthStore } from './src/stores/authStore';
import { useThemeStore } from './src/stores/themeStore';

// Components
import SplashScreen from './src/components/SplashScreen';
import BiometricAuth from './src/components/BiometricAuth';

// API Client
import { initializeClient } from './src/services/api';

// Types
export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Main: undefined;
  Login: undefined;
  Register: undefined;
  Dashboard: undefined;
  Licenses: undefined;
  LicenseDetail: { licenseId: string };
  Profile: undefined;
  Settings: undefined;
  Scan: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
              break;
            case 'Licenses':
              iconName = focused ? 'license' : 'card-account-details-outline';
              break;
            case 'Scan':
              iconName = focused ? 'qrcode-scan' : 'qrcode';
              break;
            case 'Profile':
              iconName = focused ? 'account' : 'account-outline';
              break;
            case 'Settings':
              iconName = focused ? 'cog' : 'cog-outline';
              break;
            default:
              iconName = 'circle';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Licenses" component={LicensesScreen} />
      <Tab.Screen name="Scan" component={ScanScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LicenseDetail"
        component={LicenseDetailScreen}
        options={{ title: 'License Details' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const colorScheme = useColorScheme();
  const { isAuthenticated, checkAuth, logout } = useAuthStore();
  const { theme: appTheme } = useThemeStore();

  // Determine theme
  const theme = appTheme === 'auto'
    ? (colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme)
    : (appTheme === 'dark' ? MD3DarkTheme : MD3LightTheme);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize API client
      await initializeClient();

      // Check authentication status
      const token = await SecureStore.getItemAsync('access_token');
      if (token) {
        await checkAuth();
      }

      // Check biometric availability
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(compatible && enrolled);

      // Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === 'granted') {
        const token = await Notifications.getExpoPushTokenAsync();
        console.log('Push notification token:', token);
        // Send token to backend
      }

      // Register notification listeners
      const notificationListener = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
      });

      const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification response:', response);
        // Handle notification tap
      });

      // Cleanup listeners
      return () => {
        Notifications.removeNotificationSubscription(notificationListener);
        Notifications.removeNotificationSubscription(responseListener);
      };
    } catch (error) {
      console.error('Initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    if (!isBiometricAvailable) return true;

    const storedBiometric = await SecureStore.getItemAsync('biometric_enabled');
    if (storedBiometric !== 'true') return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access DCA-Auth',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });

    if (!result.success) {
      logout();
      return false;
    }

    return true;
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>
        <NavigationContainer theme={theme}>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          {isAuthenticated ? (
            <BiometricAuth
              isEnabled={isBiometricAvailable}
              onAuthenticate={handleBiometricAuth}
            >
              <MainStack />
            </BiometricAuth>
          ) : (
            <AuthStack />
          )}
        </NavigationContainer>
      </PaperProvider>
    </QueryClientProvider>
  );
}