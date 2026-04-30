// Maps a noise-alert threshold (in dB) to a plain-language Portuguese
// description so the parent knows what kind of sound triggers an alert
// at the current setting. Pure logic, framework-free, easy to unit-test.
//
// Reference points come from common baby-room acoustic ranges:
//   ~-45 dB  sleeping baby breathing, near-silent room
//   ~-35 dB  light fussing, soft murmurs (default)
//   ~-25 dB  active babbling, mild crying
//   ~-15 dB  loud crying, shouting
export function describeThreshold(db: number): string {
  if (db <= -45) {
    return 'Muito sensível: até a respiração do bebê dispara o alerta.';
  }
  if (db <= -35) {
    return 'Sensível: choro leve e ruídos moderados disparam o alerta.';
  }
  if (db <= -25) {
    return 'Equilibrada: só ruídos consistentes (resmungar, choro) disparam.';
  }
  return 'Pouco sensível: só choro alto ou ruído forte dispara o alerta.';
}
