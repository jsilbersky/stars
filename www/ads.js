// ads.js – čistá verze pro Rewarded Ads

let AdMob;

try {
  const module = await import('@capacitor-community/admob');
  AdMob = module.AdMob;
  console.log("✅ AdMob modul nalezen");
} catch (err) {
  console.warn("⚠️ AdMob není k dispozici (pravděpodobně běžíš v prohlížeči). Používám mock.");

  // Mock verze (jen logy, žádná reklama)
  AdMob = {
    initialize: async () => console.log("Mock: AdMob.initialize()"),
    showRewardedAd: async () => {
      console.log("Mock: showRewardedAd()");
      return { reward: true };
    },
  };
}

const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";

export async function initAds() {
  try {
    await AdMob.initialize();
    console.log("✅ AdMob initialized");
  } catch (e) {
    console.warn("⚠️ AdMob init error:", e);
  }
}

export async function showRewardedAd() {
  try {
    const result = await AdMob.showRewardedAd({
      adId: TEST_REWARDED_ID,
      isTesting: true,
    });
    console.log("✅ Rewarded result:", result);
    return true;
  } catch (err) {
    console.warn("⚠️ Rewarded failed:", err);
    return false;
  }
}
