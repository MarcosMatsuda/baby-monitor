import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { getDbColor, spacing, typography, semantic } from '@baby-monitor/design-tokens';

interface DbMeterProps {
  readonly db: number;
}

export function DbMeter({ db }: DbMeterProps): React.JSX.Element {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const color = getDbColor(db);
  const normalized = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: normalized,
      friction: 8,
      tension: 60,
      useNativeDriver: false,
    }).start();
  }, [normalized, widthAnim]);

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Text style={[styles.dbValue, { color }]}>
        {db > -100 ? Math.round(db) : '--'}
      </Text>
      <Text style={styles.dbLabel}>dB</Text>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.bar,
            { width: barWidth, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing[2],
    width: '100%',
  },
  dbValue: {
    fontFamily: typography.family.mono,
    fontSize: typography.size['4xl'],
    fontWeight: typography.weight.bold,
    letterSpacing: -2,
    lineHeight: typography.size['4xl'] * 1.05,
  },
  dbLabel: {
    fontSize: typography.size.sm,
    color: semantic.text.muted,
    fontWeight: typography.weight.medium,
  },
  track: {
    width: '100%',
    height: 6,
    backgroundColor: semantic.bg.surface,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  bar: {
    height: '100%',
    borderRadius: 3,
  },
});
