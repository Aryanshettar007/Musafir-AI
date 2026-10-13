const fs = require('fs');
const path = require('path');

// Manually parse .env if process.env hasn't loaded it yet
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...values] = trimmed.split('=');
      const val = values.join('=').trim();
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

module.exports = ({ config }) => {
  const androidMapsApiKey =
    process.env.ANDROID_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY ||
    '';

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: androidMapsApiKey,
        },
      },
    },
  };
};
