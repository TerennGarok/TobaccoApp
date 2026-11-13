import './styles.css';
import { initNav, push } from './nav';
import { homeScreen, consumeSharedFiles } from './library';
import { toast } from './ui';

const root = document.getElementById('app')!;
initNav(root);
push(homeScreen());
consumeSharedFiles();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update available — restart the app to use the new version', 5000);
        });
      });
    }).catch((e) => console.warn('SW registration failed', e));
  });
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
});
