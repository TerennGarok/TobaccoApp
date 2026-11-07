import { ComingSoon } from '../../components/ComingSoon';

export default function Humidor() {
  return (
    <ComingSoon
      icon="water-outline"
      title="Humidor Monitor"
      blurb="Live humidity & temperature from your Cigar Oasis Plus 4.0."
      points={[
        'Current RH and °F with 24 h / 7 d / 30 d history charts',
        'Your own limits (e.g. 65–70% RH, 62–70°F) with push alerts when out of range',
        'Low-water and offline-device alerts',
        'Integration path depends on Cigar Oasis access — see docs/ROADMAP.md',
      ]}
    />
  );
}
