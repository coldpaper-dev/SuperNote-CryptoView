/**
 * Typed access to the ViewNative bridge (the plugin's font files, text files
 * by absolute path).
 * Undefined under Jest and if the .npk failed to load.
 */
import {NativeModules} from 'react-native';

interface ViewNativeType {
  /** Registers a font file under a fontFamily name; rejects with the reason. */
  loadFont(family: string, uri: string): Promise<boolean>;
  /** '' when the file does not exist. */
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<boolean>;
}

export const ViewNative: ViewNativeType | undefined = NativeModules.ViewNative;
