/**
 * CryptoView — read-only crypto viewer for Supernote.
 * One toolbar button opens the plugin view.
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const OPEN_BUTTON_ID = 100;
const ICON_URI = Image.resolveAssetSource(require('./assets/icon.png')).uri;

// showType 1: the host opens the plugin view (App) when the button is tapped.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: OPEN_BUTTON_ID,
  name: 'CryptoView',
  icon: ICON_URI,
  showType: 1,
});
