// Where the "Shop" and "CigarBid" buttons go.
//
// Retailers: the five biggest US online cigar shops by traffic/sales estimates
// (Similarweb, Semrush, Grips Intelligence, 2026), with Pipes and Cigars for
// pipe tobacco. The sources disagree on exact order, so swap freely.
//
// Retailer search URLs were captured from each site. CigarBid's isn't known
// yet, so it falls back to a Google search limited to cigarbid.com.
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export interface Shop {
  id: string;
  name: string;
  domain: string;
  /** Direct site search, with {q} replaced by the query. Optional until verified. */
  searchUrl?: string;
  pipe?: boolean;
}

export const CIGARBID: Shop = { id: 'cigarbid', name: 'CigarBid', domain: 'cigarbid.com' };

export const RETAILERS: Shop[] = [
  { id: 'ci', name: 'Cigars International', domain: 'cigarsinternational.com', searchUrl: 'https://www.cigarsinternational.com/search/?q={q}' },
  { id: 'famous', name: 'Famous Smoke Shop', domain: 'famous-smoke.com', searchUrl: 'https://www.famous-smoke.com/catalogsearch/result/?q={q}', pipe: true },
  { id: 'jr', name: 'JR Cigar', domain: 'jrcigars.com', searchUrl: 'https://www.jrcigars.com/search?lang=en_US&q={q}' },
  { id: 'cigarpage', name: 'Cigar Page', domain: 'cigarpage.com', searchUrl: 'https://www.cigarpage.com/catalogsearch/result/?q={q}' },
  { id: 'pac', name: 'Pipes and Cigars', domain: 'pipesandcigars.com', searchUrl: 'https://www.pipesandcigars.com/search/?q={q}', pipe: true },
];

export function shopUrl(shop: Shop, query: string): string {
  if (shop.searchUrl) return shop.searchUrl.replace('{q}', encodeURIComponent(query));
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${shop.domain} ${query}`)}`;
}

export async function openShop(shop: Shop, query: string): Promise<void> {
  const url = shopUrl(shop, query);
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}
