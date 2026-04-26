import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LOW_BATTERY_THRESHOLD } from '@baby-monitor/shared-types';
import { semantic, spacing, typography } from '@baby-monitor/design-tokens';

interface BatteryIndicatorProps {
  readonly level: number | null;
  readonly charging: boolean;
}

export function BatteryIndicator({
  level,
  charging,
}: BatteryIndicatorProps): React.JSX.Element | null {
  if (level === null) return null;

  const percent = Math.round(level * 100);
  const isLow = level < LOW_BATTERY_THRESHOLD && !charging;
  const color = isLow
    ? semantic.status.disconnected
    : charging
      ? semantic.status.connected
      : semantic.text.muted;

  const fillWidth = Math.max(2, Math.min(100, percent)) * 0.16;

  return (
    <View style={styles.container} accessibilityLabel={`Bateria do baby: ${percent}%${charging ? ' carregando' : ''}`}>
      <View style={[styles.battery, { borderColor: color }]}>
        <View
          style={[styles.fill, { width: fillWidth, backgroundColor: color }]}
        />
      </View>
      <View style={[styles.cap, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>
        {charging ? `⚡ ${percent}%` : `${percent}%`}
      </Text>
      {isLow && (
        <Text style={styles.warning}>Bateria baixa</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  battery: {
    width: 22,
    height: 11,
    borderWidth: 1,
    borderRadius: 2,
    padding: 1,
    justifyContent: 'center',
  },
  fill: {
    height: 7,
    borderRadius: 1,
  },
  cap: {
    width: 2,
    height: 5,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
    marginLeft: -1,
  },
  label: {
    fontFamily: typography.family.mono,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  warning: {
    fontSize: typography.size.xs,
    color: semantic.status.disconnected,
    fontWeight: typography.weight.semibold,
    marginLeft: spacing[1],
  },
});
