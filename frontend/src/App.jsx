import React, { useEffect, useRef, useState } from 'react';
import { ALLOWED_DOMAIN, GOOGLE_CLIENT_ID, configIssues, decodeJwt } from './lib/api.js';
import Shell from './Shell.jsx';

export default function App() {
  const [idToken, setIdToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState('');
  const buttonRef = useRef(null);

  useEffect(() => {
    if (configIssues.length > 0 || idToken) return undefined;

    let cancelled = false;
    const existingScript = document.querySelector('script[data-google-identity]');

    function initializeWhenReady() {
      if (!cancelled) initGoogle();
    }

    if (window.google?.accounts?.id) {
      initializeWhenReady();
      return undefined;
    }

    if (existingScript) {
      existingScript.addEventListener('load', initializeWhenReady, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', initializeWhenReady);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = initializeWhenReady;
    script.onerror = () => setAuthError('Google Sign-In could not load. Check your connection and refresh.');
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.remove();
    };
  }, [idToken]);

  function initGoogle() {
    if (!window.google?.accounts?.id || !buttonRef.current) return;
    buttonRef.current.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      hd: ALLOWED_DOMAIN,
      callback: handleCredential,
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline', size: 'large', text: 'signin_with', width: 260,
    });
  }

  function handleCredential(response) {
    const payload = decodeJwt(response.credential);
    const email = payload?.email || '';
    if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      setAuthError(`Sign-in is restricted to @${ALLOWED_DOMAIN} accounts. You signed in as ${email || 'an unknown account'}.`);
      return;
    }
    setAuthError('');
    setProfile(payload);
    setIdToken(response.credential);
  }

  function signOut() {
    window.google?.accounts?.id?.disableAutoSelect();
    setIdToken(null);
    setProfile(null);
  }

  if (configIssues.length > 0) {
    return (
      <main className="login-screen">
        <section className="setup-card" aria-labelledby="setup-title">
          <p className="eyebrow">Setup required</p>
          <h1 id="setup-title">Cedars Performance Tracker</h1>
          <p className="setup-copy">Add the Vercel environment variables, then redeploy.</p>
          <ul>{configIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </section>
      </main>
    );
  }

  if (!idToken) {
    return (
      <main className="login-screen">
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">Cedars Performance Tracker</h1>
          <p>Sign in with your @{ALLOWED_DOMAIN} account to continue.</p>
          <div className="google-button" ref={buttonRef} />
          {authError && <div className="error-banner">{authError}</div>}
        </section>
      </main>
    );
  }

  return <Shell idToken={idToken} profile={profile} onSignOut={signOut} />;
}
