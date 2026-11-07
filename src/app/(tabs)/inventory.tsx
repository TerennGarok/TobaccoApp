import { ComingSoon } from '../../components/ComingSoon';

export default function Inventory() {
  return (
    <ComingSoon
      icon="file-tray-stacked-outline"
      title="Inventory"
      blurb="What's resting in your humidor and pipe tobacco cellar."
      points={[
        'Count by cigar & size, with purchase date, price paid and vendor',
        'Age-in-humidor tracking ("resting since…") and smoke-by reminders',
        'Auto-decrement when you log a smoke; low-stock alerts on favourites',
        'Pipe tobacco tins and jars by weight, with cellar date for aging',
        'Collection value from current market prices',
      ]}
    />
  );
}
