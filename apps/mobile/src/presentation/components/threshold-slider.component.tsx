import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, semantic, spacing, typography } from '@baby-monitor/design-tokens';
import { describeThreshold } from '../../domain/entities/threshold-description';

interface ThresholdSliderProps {
  readonly value: number;
  readonly onValueChange: (value: number) => void;
}

export function ThresholdSlider({
  value,
  onValueChange,
}: ThresholdSliderProps): React.JSX.Element {
  const helpText = describeThreshold(value);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Sensibilidade</Text>
        <Text style={styles.value}>{Math.round(value)} dB</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={-60}
        maximumValue={-10}
        step={1}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={colors.teal[500]}
        maximumTrackTintColor={semantic.bg.surface}
        thumbTintColor={colors.teal[500]}
      />
      <View style={styles.labels}>
        <Text style={styles.rangeLabel}>Mais sensível</Text>
        <Text style={styles.rangeLabel}>Menos sensível</Text>
      </View>
      <Text style={styles.helpText}>{helpText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing[2],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.size.sm,
    color: semantic.text.secondary,
    fontWeight: typography.weight.medium,
  },
  value: {
    fontFamily: typography.family.mono,
    fontSize: typography.size.sm,
    color: semantic.text.muted,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeLabel: {
    fontSize: typography.size.xs,
    color: semantic.text.muted,
  },
  helpText: {
    fontSize: typography.size.xs,
    color: semantic.text.secondary,
    lineHeight: typography.size.xs * 1.5,
    paddingTop: spacing[1],
  },
});
