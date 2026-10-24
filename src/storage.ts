/**
 * JSON files in the plugin's private folder, the only place a plugin may
 * write without a file permission.
 */
import {PluginManager} from 'sn-plugin-lib';
import {ViewNative} from './native';

let dir: Promise<string | null> | null = null;

function pluginDir(): Promise<string | null> {
  if (dir === null) {
    dir = (PluginManager as unknown as {getPluginDirPath: () => Promise<unknown>})
      .getPluginDirPath()
      .then(d => (typeof d === 'string' && d.length > 0 ? d : null))
      .catch(() => null);
  }
  return dir;
}

/** The stored value, or null when there is none or it cannot be read. */
export async function readJson<T>(name: string): Promise<T | null> {
  try {
    const d = await pluginDir();
    if (!d || !ViewNative) {
      return null;
    }
    const text = await ViewNative.readFile(`${d}/${name}`);
    return text === '' ? null : (JSON.parse(text) as T);
  } catch {
    return null;
  }
}

/** false when nothing was saved. */
export async function writeJson(name: string, value: unknown): Promise<boolean> {
  try {
    const d = await pluginDir();
    if (!d || !ViewNative) {
      return false;
    }
    return await ViewNative.writeFile(`${d}/${name}`, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** A text file anywhere on the tablet; '' when it does not exist. */
export async function readText(path: string): Promise<string> {
  if (!ViewNative) {
    throw new Error('native module missing');
  }
  return ViewNative.readFile(path);
}

/** Writes a text file anywhere on the tablet, creating its folder. */
export async function writeText(path: string, content: string): Promise<void> {
  if (!ViewNative) {
    throw new Error('native module missing');
  }
  await ViewNative.writeFile(path, content);
}
