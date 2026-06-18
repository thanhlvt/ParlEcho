import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';

const DELETE_WIDTH = 76;

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  borderRadius?: number;
  isOpen?: boolean;
  onSwipeOpen?: () => void;
  onSwipeClose?: () => void;
}

export function SwipeableRow({
  children,
  onDelete,
  borderRadius = 16,
  isOpen = false,
  onSwipeOpen,
  onSwipeClose,
}: SwipeableRowProps) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);

  const closeRow = useCallback(() => {
    if (isOpenRef.current && onSwipeClose) {
      onSwipeClose();
    }
    isOpenRef.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  }, [onSwipeClose, translateX]);

  React.useEffect(() => {
    if (!isOpen && isOpenRef.current) {
      closeRow();
    }
  }, [isOpen, closeRow]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const shouldSet = Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        if (shouldSet && !isOpenRef.current && onSwipeOpen) {
          onSwipeOpen();
        }
        return shouldSet;
      },
      onPanResponderMove: (_, gesture) => {
        const base = isOpenRef.current ? -DELETE_WIDTH : 0;
        const next = base + gesture.dx;
        translateX.setValue(Math.max(-DELETE_WIDTH, Math.min(0, next)));
      },
      onPanResponderRelease: (_, gesture) => {
        const base = isOpenRef.current ? -DELETE_WIDTH : 0;
        const dx = base + gesture.dx;
        const shouldOpen = dx < -DELETE_WIDTH / 2;

        if (shouldOpen) {
          if (!isOpenRef.current && onSwipeOpen) {
            onSwipeOpen();
          }
          isOpenRef.current = true;
          Animated.spring(translateX, {
            toValue: -DELETE_WIDTH,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        } else {
          if (isOpenRef.current && onSwipeClose) {
            onSwipeClose();
          }
          isOpenRef.current = false;
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
    }),
  ).current;

  function handleDeletePress() {
    closeRow();
    onDelete();
  }

  return (
    <View style={[styles.wrap, { borderRadius }]}>
      <View style={[styles.deleteAction, { borderRadius, backgroundColor: colors.error }]}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeletePress} activeOpacity={0.8}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.deleteText}>Xoá</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  deleteText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
