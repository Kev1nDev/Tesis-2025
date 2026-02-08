const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agregamos soporte para la extensión .lottie
config.resolver.assetExts.push('lottie');

module.exports = config;