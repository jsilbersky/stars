// ads.js – obsluha reklam (funguje i v browseru i v Android appce)

// ⚡ Testovací ID z Google (Android)
const TEST_INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712";

let AdMob;
let InterstitialAdPluginEvents;

// Pokus o import AdMob pluginu (funguje jen v Android/iOS aplikaci)
try {
  const module = await import('@capacitor-community/admob');
  AdMob = module.AdMob;
  InterstitialAdPluginEvents = module.InterstitialAdPluginEvents;
  console.log("✅ AdMob modul nalezen");
} catch (err) {
  console.warn("⚠️ AdMob není k dispozici (běžíš asi v prohlížeči). Používám mock.");

  // Mock verze, aby kód nespadl v browseru
  AdMob = {
    initialize: async () => console.log("Mock: AdMob.initialize()"),
    prepareInterstitialAd: async () => console.log("Mock: prepareInterstitialAd()"),
    showInterstitialAd: async () => console.log("Mock: showInterstitialAd()"),
  };

  InterstitialAdPluginEvents = {
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
  } catch (err) {
    console.warn("⚠️ Chyba při inicializaci AdMob:", err);
  }
}

// 🔹 Přednačti interstitial
export async function loadInterstitial() {
  try {
    await AdMob.prepareInterstitialAd({
      adId: TEST_INTERSTITIAL_ID,
      isTesting: true,
    });
    console.log("✅ Interstitial připraven");
  } catch (err) {
    console.warn("⚠️ Chyba při načítání interstitial:", err);
  }
}

// 🔹 Zobraz interstitial po Game Over
export async function showInterstitialThenGameOver() {
  // 🎵 nejdřív zvuk Game Over
  try {
    const gameOverSound = new Audio('sounds/game_over.mp3');
    gameOverSound.volume = 0.8;
    gameOverSound.play();
  } catch (err) {
    console.warn("⚠️ Nepodařilo se přehrát zvuk Game Over:", err);
  }

  // počkej ~1 sekundu, ať se dohraje zvuk
  setTimeout(async () => {
    try {
      await AdMob.showInterstitialAd();
      console.log("✅ Interstitial zobrazen");

      // po zavření reklamy → zobraz Game Over popup
      document.addEventListener(
        InterstitialAdPluginEvents.Dismissed,
        () => {
          console.log("✅ Reklama zavřena → ukazuju Game Over");
          if (typeof triggerGameOver === "function") {
            triggerGameOver();
          }
        },
        { once: true }
      );
    } catch (err) {
      console.warn("⚠️ Reklama se nezobrazila:", err);
      // fallback → rovnou Game Over
      if (typeof triggerGameOver === "function") {
        triggerGameOver();
      }
    }
  }, 1000); // čekání na dohrání zvuku
}
