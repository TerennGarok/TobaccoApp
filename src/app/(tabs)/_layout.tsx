import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { colors, fonts } from '../../theme';

const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: import('react-native').ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: fonts.display, color: colors.text, fontSize: 22 },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: colors.textFaint,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cigars',
          tabBarIcon: icon('book-outline'),
          headerRight: () => (
            <Pressable accessibilityLabel="Settings" hitSlop={10} style={{ marginRight: 16 }} onPress={() => router.push('/settings')}>
              <Ionicons name="settings-outline" size={22} color={colors.brass} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="pipe" options={{ title: 'Pipe', tabBarIcon: icon('flame-outline') }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarIcon: icon('file-tray-stacked-outline') }} />
      <Tabs.Screen name="humidor" options={{ title: 'Humidor', tabBarIcon: icon('water-outline') }} />
      <Tabs.Screen name="market" options={{ title: 'Market', tabBarIcon: icon('pricetags-outline') }} />
    </Tabs>
  );
}
