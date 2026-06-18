const { withAppBuildGradle } = require('@expo/config-plugins');

// AGP's bundled CMake default (3.22.1) ships a ninja build (1.10.2) that can't
// handle the long object-file paths produced by some autolinked native modules
// (notably react-native-keyboard-controller) on Windows, failing with
// "Filename longer than 260 characters". Pinning a newer CMake here (bundling
// ninja >= 1.11, which supports Windows long paths) avoids that without
// touching node_modules.
const CMAKE_VERSION = '3.31.6';

module.exports = function withAndroidCmakeVersion(config) {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes(`cmake.version`)) {
      config.modResults.contents = config.modResults.contents.replace(
        /^android \{/m,
        `android {\n    externalNativeBuild {\n        cmake {\n            version "${CMAKE_VERSION}"\n        }\n    }\n`,
      );
    }
    return config;
  });
};
