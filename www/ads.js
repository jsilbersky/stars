// ads.js — TEST ONLY (AdMob) + kompatibilita nová/legacy API
// Vrací statusy: 'rewarded' | 'closed' | 'unavailable' | 'error'

const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_REWARDED_ID = 'ca-app-pub-3940256099942544/5224354917';

const isNative =
  !!(window.Capacitor?.getPlatform && window.Capacitor.getPlatform() !== 'web');

let AdMob = null;
let initialized = false;

function getPluginSync() {
  // 1) zkusit načíst z window (nejspolehlivější v Capacitoru)
  if (window.Capacitor?.Plugins?.AdMob) return window.Capacitor.Plugins.AdMob;
  return null;
}

// bezpečné přidání listeneru napříč verzemi
function addL(ev, cb) {
  try { return AdMob?.addListener?.(ev, cb) || { remove(){} }; }
  catch { return { remove(){} }; }
}
function onceStatusFromEvents(timeoutMs = 35000) {
  return new Promise(resolve => {
    const offs = [];

    // NOVÉ API eventy
    offs.push(addL('onRewardedAdReward',   () => done('rewarded')));
    offs.push(addL('onRewardedAdCompleted',() => done('rewarded'))); // některé verze
    offs.push(addL('onRewardedAdDismissed',() => done('closed')));
    offs.push(addL('onRewardedAdFailedToShow', () => done('error')));

    // LEGACY video eventy
    offs.push(addL('onRewardedVideoAdReward', () => done('rewarded')));
    offs.push(addL('onRewardedVideoAdClosed', () => done('closed')));

    const to = setTimeout(() => done('error'), timeoutMs);

    function done(status) {
      clearTimeout(to);
      offs.forEach(o => o?.remove?.());
      resolve(status);
    }
  });
}

export async function initAds() {
  if (!isNative) return;             // v prohlížeči nic nedělej
  if (initialized) return;

  AdMob = getPluginSync();

  // (volitelné) Dynamický import by šel zkusit, ale v čistém webview často není potřeba
  // a někdy by selhal bez bundleru. window.Capacitor.Plugins je správně.

  if (!AdMob) {
    console.warn('⚠️ AdMob plugin není k dispozici (běží nativní build? cap sync android?)');
    return;
  }

  try {
    // některé verze chtějí appId, některým stačí initializeForTesting
    await AdMob.initialize({
      appId: TEST_APP_ID,
      initializeForTesting: true,
      requestTrackingAuthorization: false
    });
    initialized = true;
    console.log('✅ AdMob inicializován (TEST)');
  } catch (e) {
    console.warn('⚠️ AdMob.initialize() selhalo:', e);
  }
}

/**
 * Zobrazí **testovací** Rewarded reklamu a vrátí status:
 *  - 'rewarded'     ... hráč získal odměnu
 *  - 'closed'       ... zavřel bez odměny
 *  - 'unavailable'  ... nejsme na nativu / plugin chybí
 *  - 'error'        ... chyba načtení / zobrazení
 */
export async function showRewardedAd() {
  if (!isNative) return 'unavailable';

  if (!initialized) {
    try { await initAds(); } catch {}
  }
  if (!AdMob) return 'unavailable';

  // 1) Nové API (showRewardedAd)
  if (typeof AdMob.showRewardedAd === 'function') {
    try {
      // Některé verze resolvnou hned, reward přijde přes event; proto čekáme na eventy.
      const waitP = onceStatusFromEvents(35000);

      const res = await AdMob.showRewardedAd({
        adId: TEST_REWARDED_ID,
        isTesting: true
      });

      // pokud by náhodou metoda vrátila reward přímo (vzácné)
      if (res?.reward) return 'rewarded';

      // jinak čekej na event
      const status = await waitP;
      return status;
    } catch (e) {
      console.warn('⚠️ showRewardedAd(new API) error:', e);
      // spadni na legacy flow
    }
  }

  // 2) Legacy API (prepareRewardVideoAd → showRewardVideoAd)
  if (typeof AdMob.prepareRewardVideoAd === 'function' &&
      typeof AdMob.showRewardVideoAd === 'function') {
    try {
      await AdMob.prepareRewardVideoAd({
        adId: TEST_REWARDED_ID,
        isTesting: true
      });

      const waitP = onceStatusFromEvents(35000);
      await AdMob.showRewardVideoAd();
      const status = await waitP;
      return status;
    } catch (e) {
      console.warn('⚠️ showRewardedAd(legacy) error:', e);
      return 'error';
    }
  }

  console.warn('⚠️ Žádná kompatibilní metoda pro Rewarded Ad nebyla nalezena.');
  return 'unavailable';
}
