// How to put WeFit on your home screen, per platform. Used in Settings and as a one-time hint in the feed.
import { useState } from 'react';
import { iosBrowser, useInstall } from '../lib/install';
import { Panel, useToast } from './ui';

const DISMISS_KEY = 'wefit.install.hint.dismissed';

/** The iOS Share symbol (square with an arrow), so the steps match what people see in Safari. */
function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-label="Share" style={{ verticalAlign: '-2px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function Steps() {
  const { platform, canPrompt, prompt } = useInstall();
  const toast = useToast();
  if (canPrompt) {
    return (
      <div className="col" style={{ gap: 8 }}>
        <span className="small muted">Get WeFit as an app on your home screen: full screen, its own icon, and recipes shared from other apps land straight in it.</span>
        <div><button className="btn primary sm" onClick={async () => { if (await prompt()) toast('WeFit installed'); }}>Install WeFit</button></div>
      </div>
    );
  }
  if (platform === 'ios') {
    if (iosBrowser() === 'other') {
      return (
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Open this page in <b>Safari</b> (in Chrome or Edge on iOS 16.4 or later, the <ShareGlyph /> button in the address bar works too).</li>
          <li>Tap <b>Share</b> <ShareGlyph />, then <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>
      );
    }
    return (
      <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>Tap <b>Share</b> <ShareGlyph /> in Safari (on newer iPhones it can be under the <b>•••</b> button next to the address bar).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>. If you see <b>Open as Web App</b>, leave it on.</li>
        <li>Keep the name <b>WeFit</b> and tap <b>Add</b>.</li>
      </ol>
    );
  }
  if (platform === 'android') {
    return (
      <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>In Chrome, tap the <b>⋮</b> menu.</li>
        <li>Tap <b>Add to home screen</b> → <b>Install</b> (or <b>Install app</b>).</li>
      </ol>
    );
  }
  return <span className="small muted">In Chrome or Edge, use the install icon at the right of the address bar. On a phone, open WeFit in Chrome (Android) or Safari (iPhone) to add it to your home screen.</span>;
}

export function InstallPanel() {
  const { installed, platform } = useInstall();
  return (
    <Panel title="Install the app">
      {installed ? (
        <div className="col" style={{ gap: 6 }}>
          <span className="small">✓ You're using the installed WeFit app.</span>
          {platform === 'android' && (
            <span className="small muted">If your home screen still shows an old name or icon, open WeFit once a day for Chrome to update it, or remove the icon and install again from Chrome.</span>
          )}
        </div>
      ) : <Steps />}
    </Panel>
  );
}

/** One-time hint in the feed for phone users who haven't installed WeFit yet. */
export function InstallHint() {
  const { installed, platform } = useInstall();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  if (installed || hidden || platform === 'other') return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } };
  return (
    <Panel title="📲 Put WeFit on your home screen" right={<button className="btn ghost sm" onClick={dismiss} aria-label="Dismiss">Not now</button>}>
      <Steps />
    </Panel>
  );
}
