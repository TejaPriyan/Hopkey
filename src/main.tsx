import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App.tsx';
import { initPwa } from './pwa.ts';

initPwa();
// StrictMode is intentionally off: it double-mounts effects in dev, which would register two PeerJS peers per share.
createRoot(document.getElementById('root')!).render(<App />);
