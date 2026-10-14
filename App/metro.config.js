const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Support importing .md markdown files directly as string modules
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'md');
if (!config.resolver.sourceExts.includes('md')) {
  config.resolver.sourceExts.push('md');
}
config.transformer.babelTransformerPath = path.resolve(__dirname, 'scripts/markdown-transformer.js');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Mock Node.js 'punycode' module required by markdown-it in React Native
  if (moduleName === 'punycode') {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/punycode.js'),
      type: 'sourceFile',
    };
  }

  if (platform === 'web' && (moduleName === 'react-native-maps' || moduleName.startsWith('react-native-maps/'))) {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/react-native-maps.web.tsx'),
      type: 'sourceFile',
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
