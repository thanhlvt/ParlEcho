import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React, { createContext, useContext, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../constants/Colors';

const { width, height } = Dimensions.get('window');
const SIDEBAR_WIDTH = 280;

// Create Sidebar Context
interface SidebarContextType {
  toggleSidebar: () => void;
  closeSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContextType>({
  toggleSidebar: () => {},
  closeSidebar: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export default function AppLayout() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  
  // Animated values for smooth sliding & backdrop fade
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setIsOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0.5,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -SIDEBAR_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsOpen(false);
    });
  };

  const toggleSidebar = () => {
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  };

  const navigateTo = (route: any) => {
    closeSidebar();
    router.push(route);
  };

  const menuItems = [
    { label: 'Trang chủ', route: '/(app)', icon: 'home-outline' as const },
    { label: 'Luyện phát âm', route: '/(app)/practice', icon: 'mic-outline' as const },
    { label: 'Hội thoại AI', route: '/(app)/chat', icon: 'chatbubbles-outline' as const },
    { label: 'Live (Luyện nói AI)', route: '/(app)/live', icon: 'radio-outline' as const },
    { label: 'Sổ tay ôn tập', route: '/(app)/notebook', icon: 'book-outline' as const },
    { label: 'Thống kê tiến độ', route: '/(app)/analytics', icon: 'stats-chart-outline' as const },
    { label: 'Hồ sơ cá nhân', route: '/(app)/profile', icon: 'person-outline' as const },
  ];

  return (
    <SidebarContext.Provider value={{ toggleSidebar, closeSidebar }}>
      <View style={{ flex: 1 }}>
        {/* Main Tabs Navigation */}
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarStyle: {
              backgroundColor: Colors.surface,
              borderTopColor: Colors.border,
              paddingBottom: 4,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Trang chủ',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="practice"
            options={{
              title: 'Luyện nói',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'mic' : 'mic-outline'} size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chat"
            options={{
              title: 'Hội thoại',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="live"
            options={{
              title: 'Live',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'radio' : 'radio-outline'} size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Hồ sơ',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
              ),
            }}
          />
          {/* Hide notebook and analytics from bottom menu bar */}
          <Tabs.Screen
            name="notebook"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="analytics"
            options={{
              href: null,
            }}
          />
        </Tabs>

        {/* Backdrop Overlay */}
        {isOpen && (
          <Pressable style={styles.backdrop} onPress={closeSidebar}>
            <Animated.View style={[styles.backdropFill, { opacity: backdropOpacity }]} />
          </Pressable>
        )}

        {/* Sidebar Drawer Panel */}
        {isOpen && (
          <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
            {/* Sidebar Header */}
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarLogo}>ParlEcho 🤖</Text>
              <Text style={styles.sidebarSubtitle}>Luyện Anh - Nhật song song</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={closeSidebar} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Sidebar Navigation Items */}
            <View style={styles.menuList}>
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.menuItem}
                  onPress={() => navigateTo(item.route)}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuIconWrapper}>
                    <Ionicons name={item.icon} size={22} color={Colors.primary} />
                  </View>
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Sidebar Footer */}
            <View style={styles.sidebarFooter}>
              <Text style={styles.footerText}>Phiên bản 1.0.0</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </SidebarContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  backdropFill: {
    flex: 1,
    backgroundColor: '#000',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: Colors.surface,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
    paddingTop: 48,
    display: 'flex',
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    position: 'relative',
  },
  sidebarLogo: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  sidebarSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 0,
  },
  menuList: {
    paddingVertical: 16,
    gap: 4,
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  menuIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  sidebarFooter: {
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
