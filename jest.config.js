module.exports = {
  preset: 'react-native',
  // Font files are assets, not code.
  moduleNameMapper: {'\\.ttf$': '<rootDir>/__tests__/support/asset.js'},
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/support/'],
};
