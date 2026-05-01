import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { supabase } from './lib/supabase';
import './index.css';

async function bootstrap() {
  // Supabase auth callbacks come back as `#access_token=…`, which clashes with HashRouter.
  // Let supabase consume the hash, then strip it, before the router mounts.
  const hash = window.location.hash;
  if (/(?:^|[#&])(access_token|error|error_code)=/.test(hash)) {
    await supabase.auth.getSession();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
