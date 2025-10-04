// ads.js – obsluha reklam (browser + Android app)

// ⚡ Testovací ID z Google (Rewarded Video – Android)
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917"; // oficiální test ID

let AdMob;
let RewardAdPluginEvents;
let _rewardedReady = false;
let _onClose = null;

// Pokus o import AdMob pluginu (funguje jen v Android/iOS aplikaci)
try {
  const module = await import('@capacitor-community/admob');
  AdMob = module.AdMob;
  RewardAdPluginEvents = module.RewardAdPluginEvents || module.RewardedAdPluginEvents || {
    Rewarded: 'rewarded',
    Dismissed: 'dismissed'
  };
  console.log("✅ AdMob modul nalezen");
} catch (err) {
  console.warn("⚠️ AdMob není k dispozici (běžíš asi v prohlížeči). Používám mock.");

  // Mock verze, aby kód nespadl v browseru
  AdMob = {
    initialize: async () => console.log("Mock: AdMob.initialize()"),
    prepareRewardVideoAd: async () => {
      console.log("Mock: prepareRewardVideoAd()");
      _rewardedReady = true;
    },
    showRewardVideoAd: async () => {
      console.log("Mock: showRewardVideoAd()");
      setTimeout(() => { _onClose?.(true); }, 1000); // simulace úspěšné odměny
    }
  };

  RewardAdPluginEvents = {
    Rewarded: "mockRewarded",
    Dismissed: "mockDismissed"
  };
}

// 🔹 Inicializace AdMob
export async function initAds() {
  try {
    await AdMob.initialize({
      requestTrackingAuthorization: true,
      testingDevices: [],
      initializeForTesting: true,
    });
    console.log("✅ AdMob inicializován (test mode)");
    await loadRewardedAd(); // přednačti rewarded
  } catch (err) {
    console.warn("⚠️ Chyba při inicializaci AdMob:", err);
  }
}

export async function loadRewardedAd() {
  try {
    _rewardedReady = false;

    // případné odvěšení starých listenerů (bezpečnost)
    if (typeof document !== 'undefined' && RewardAdPluginEvents) {
      document.removeEventListener(RewardAdPluginEvents.Rewarded, _onRewardedOnce, { capture: false });
      document.removeEventListener(RewardAdPluginEvents.Dismissed, _onDismissedOnce, { capture: false });
    }

    if (AdMob.prepareRewardVideoAd) {
      await AdMob.prepareRewardVideoAd({
        adId: TEST_REWARDED_ID,
        isTesting: true,
      });
    } else if (AdMob.prepareRewardAd) {
      await AdMob.prepareRewardAd({
        adId: TEST_REWARDED_ID,
        isTesting: true,
      });
    } else {
      await AdMob.prepareRewardVideoAd(); // mock fallback
    }

    _rewardedReady = true;
    console.log("✅ Rewarded připraven");
  } catch (err) {
    _rewardedReady = false;
    console.warn("⚠️ Chyba při načítání rewarded:", err);
  }
}

export function isRewardedReady() {
  return _rewardedReady;
}

function _onRewardedOnce() {
  _onClose?.(true);
}
function _onDismissedOnce() {
  _onClose?.(false);
}

/**
 * Zobraz rewarded. onComplete(true) = odměněno (dokoukáno), onComplete(false) = zavřeno/selhalo.
 */
export async function showRewardedAd(onComplete) {
  if (!_rewardedReady) {
    onComplete?.(false);
    return;
  }
  _rewardedReady = false;
  _onClose = (success) => {
    try { onComplete?.(!!success); } finally {
      loadRewardedAd(); // připrav další
    }
  };

  if (typeof document !== 'undefined' && RewardAdPluginEvents) {
    document.addEventListener(RewardAdPluginEvents.Rewarded, _onRewardedOnce, { once: true });
    document.addEventListener(RewardAdPluginEvents.Dismissed, _onDismissedOnce, { once: true });
  }

  try {
    if (AdMob.showRewardVideoAd) {
      await AdMob.showRewardVideoAd();
    } else if (AdMob.showRewardAd) {
      await AdMob.showRewardAd();
    } else {
      await AdMob.showRewardVideoAd(); // mock fallback
    }
    console.log("✅ Rewarded zobrazen");
  } catch (err) {
    console.warn("⚠️ Rewarded se nezobrazil:", err);
    _onClose?.(false);
  }
}
