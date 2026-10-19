const { AndroidConfig, withAndroidStyles, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to address Google Play Console release requirements:
 * 1. Edge-to-edge: Removes deprecated `android:statusBarColor` and `android:navigationBarColor` from `AppTheme`.
 * 2. Large screens / Android 16: Adds `android:resizeableActivity="true"` to application and activities.
 */
function withAndroidPlayConsoleFixes(config) {
  // 1. Ensure resizability on large screens (foldables, tablets, multi-window)
  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication = modConfig.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:resizeableActivity'] = 'true';
      if (Array.isArray(mainApplication.activity)) {
        mainApplication.activity.forEach((act) => {
          act.$['android:resizeableActivity'] = 'true';
        });
      }
    }
    return modConfig;
  });

  // 2. Remove deprecated Android 15 edge-to-edge style items
  config = withAndroidStyles(config, (modConfig) => {
    const parent = { name: 'AppTheme' };
    modConfig.modResults = AndroidConfig.Styles.removeStylesItem({
      xml: modConfig.modResults,
      parent,
      name: 'android:statusBarColor',
    });
    modConfig.modResults = AndroidConfig.Styles.removeStylesItem({
      xml: modConfig.modResults,
      parent,
      name: 'android:navigationBarColor',
    });
    return modConfig;
  });

  return config;
}

module.exports = withAndroidPlayConsoleFixes;
