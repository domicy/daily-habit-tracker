module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: [],
  moduleNameMapper: {
    '^@nozbe/watermelondb$': '<rootDir>/node_modules/@nozbe/watermelondb',
    '^@nozbe/watermelondb/(.*)$': '<rootDir>/node_modules/@nozbe/watermelondb/$1',
    '^react-native$': '<rootDir>/node_modules/react-native',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@nozbe|@notifee|@react-native-async-storage|react-native-safe-area-context|react-native-screens|react-native-uuid)/)',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 55,
    },
  },
  forceExit: true,
};
