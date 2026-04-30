import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { semantic, spacing, typography, radii } from '@baby-monitor/design-tokens';

// How close to the threshold the current dB needs to be before the
// pill switches from "tranquilo" to the warning state. Picked at 5 dB
// because the alert engine debounces over 3 readings, so values just
// below the threshold can still cross it within a second of speech.
const WARN_BAND_DB = 5;

interface AlertPreviewPillProps {
  readonly currentDb: number;
  readonly threshold: number;
  readonly alertActive: boolean;
}

type PillState = 'tranquil' | 'warning' | 'firing';

export function AlertPreviewPill({
  currentDb,
  threshold,
  alertActive,
}: AlertPreviewPillProps): React.JSX.Element {
  const state: PillState = alertActive
    ? 'firing'
    : currentDb > threshold - WARN_BAND_DB
      ? 'warning'
      : 'tranquil';

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'warning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
    return undefined;
  }, [state, pulseAnim]);

  const config = STATE_CONFIG[state];

  return (
    <View style={[styles.pill, { borderColor: config.color }]}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: config.color, opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.label, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

const STATE_CONFIG: Record<PillState, { label: string; color: string }> = {
  tranquil: { label: 'Tranquilo', color: semantic.status.connected },
  warning: { label: 'Perto de disparar', color: semantic.status.moderate },
  firing: { label: 'Disparando', color: semantic.status.disconnected },
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    alignSelf: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
});
