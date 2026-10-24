/**
 * A permission declared in PluginConfig.json must also be granted at run
 * time: without INTERNET every request fails with "Network request failed",
 * without FILE:READ a file of the tablet cannot be opened, without FILE:WRITE
 * none can be created outside the plugin's own folder.
 */
import {PluginManager} from 'sn-plugin-lib';

const INTERNET = 'plugin.permission.INTERNET';
const FILE_READ = 'plugin.permission.FILE:READ';
const FILE_WRITE = 'plugin.permission.FILE:WRITE';

const asking: Record<string, Promise<boolean>> = {};

/**
 * Asked each time it is needed, so that a refusal or an "allow once" is not
 * remembered against the user; two needs at the same moment share one
 * question.
 */
function ensure(permission: string, why: string): Promise<boolean> {
  if (!(permission in asking)) {
    asking[permission] = (async () => {
      const pm = PluginManager as unknown as {
        hasPermission: (p: string) => Promise<number>;
        requestPermission: (p: string, d?: string) => Promise<number>;
      };
      try {
        // hasPermission: 0 not granted, 1 granted.
        if ((await pm.hasPermission(permission)) === 1) {
          return true;
        }
        // requestPermission: 0 deny, 1 allow once, 2 always allow.
        const answer = await pm.requestPermission(permission, why);
        return answer === 1 || answer === 2;
      } catch {
        // An older host has no permission system: nothing to ask.
        return true;
      } finally {
        delete asking[permission];
      }
    })();
  }
  return asking[permission];
}

/** Throws when the plugin may not use the network. */
export async function requireInternet(): Promise<void> {
  if (
    !(await ensure(
      INTERNET,
      'CryptoView reads public prices and balances from the internet.',
    ))
  ) {
    throw new Error('internet permission refused');
  }
}

/** true when the plugin may read a file of the tablet. */
export const ensureFileRead = (): Promise<boolean> =>
  ensure(FILE_READ, 'CryptoView reads the text file that lists your public addresses.');

/** true when the plugin may write a file of the tablet. */
export const ensureFileWrite = (): Promise<boolean> =>
  ensure(
    FILE_WRITE,
    'CryptoView writes the text file of your public addresses, and the figures you copy to a note.',
  );
