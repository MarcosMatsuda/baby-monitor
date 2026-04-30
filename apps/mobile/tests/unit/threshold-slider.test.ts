import { describeThreshold } from '../../src/domain/entities/threshold-description';

describe('describeThreshold', () => {
  it('warns about breathing-level sensitivity at -45 dB or below', () => {
    expect(describeThreshold(-50)).toMatch(/respiração/i);
    expect(describeThreshold(-45)).toMatch(/respiração/i);
  });

  it('describes the default range (-44 .. -35 dB) as light fussing / moderate noise', () => {
    expect(describeThreshold(-44)).toMatch(/choro leve/i);
    expect(describeThreshold(-40)).toMatch(/choro leve/i);
    expect(describeThreshold(-35)).toMatch(/choro leve/i);
  });

  it('describes mid-range (-34 .. -25 dB) as the balanced band', () => {
    expect(describeThreshold(-30)).toMatch(/equilibrada|consistentes/i);
    expect(describeThreshold(-28)).toMatch(/equilibrada|consistentes/i);
    expect(describeThreshold(-25)).toMatch(/equilibrada|consistentes/i);
  });

  it('describes high values (-20 dB and above) as low sensitivity', () => {
    expect(describeThreshold(-15)).toMatch(/pouco sensível/i);
    expect(describeThreshold(-10)).toMatch(/pouco sensível/i);
  });

  it('produces a unique description for each band (no overlap)', () => {
    const samples = [-50, -40, -28, -15];
    const descriptions = samples.map(describeThreshold);
    const unique = new Set(descriptions);
    expect(unique.size).toBe(samples.length);
  });
});
