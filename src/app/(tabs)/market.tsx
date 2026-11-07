import { ComingSoon } from '../../components/ComingSoon';

export default function Market() {
  return (
    <ComingSoon
      icon="pricetags-outline"
      title="Market"
      blurb="Prices, deals and auctions for the cigars you love."
      points={[
        'Price comparison across major online retailers (per stick and per box)',
        'Price-drop alerts on your wishlist and top-rated cigars',
        'Auction watching with historical "good price" guidance',
        'Bid entry with a confirmation step — see docs/ROADMAP.md for the auction-site constraint',
        'One-tap hand-off to the retailer to complete checkout',
      ]}
    />
  );
}
