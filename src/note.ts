/**
 * Writing a block of text on the page of the note the plugin was opened
 * from. Only a note can take it: a document has no text layer of its own.
 */
import {Image} from 'react-native';
import {
  PluginCommAPI,
  PluginFileAPI,
  PluginNoteAPI,
} from 'sn-plugin-lib';

/** Page pixels per unit of font size, per line of text. */
const LINE = 5 / 3;
/** Width of one character of a fixed-width font, per unit of font size. */
const ADVANCE = 0.6;
const MARGIN = 80;
/** Left and top: clear of the note's side bar and top bar, about 1 cm more. */
const INSET = 200;
const MAX_FONT = 40;
const MIN_FONT = 18;

const result = (answer: any) => (answer && answer.success ? answer.result : undefined);

/** The note the plugin was opened from, or null when it is a document. */
export async function currentNote(): Promise<string | null> {
  try {
    const path = result(await PluginCommAPI.getCurrentFilePath());
    return typeof path === 'string' && /\.note$/i.test(path) ? path : null;
  } catch {
    return null;
  }
}

async function pageSize(): Promise<{width: number; height: number}> {
  try {
    const size: any = result(await (PluginCommAPI as any).getPageDisplaySize());
    if (size?.width > 0 && size?.height > 0) {
      return {width: size.width, height: size.height};
    }
  } catch {}
  return {width: 1404, height: 1872};
}

/** The plugin's fixed-width font, so the columns of the text line up. */
function monoFontPath(): string {
  try {
    const uri = Image.resolveAssetSource(
      require('../assets/fonts/IBMPlexMono-Regular.ttf'),
    ).uri;
    return uri.startsWith('file://') ? uri.slice(7) : '';
  } catch {
    return '';
  }
}

/**
 * Puts the text at the top of the page shown, sized so that its longest
 * line fits the width. It is a text box: a tap selects it to move it.
 * Throws with the reason when it cannot.
 */
export async function copyToNote(text: string): Promise<void> {
  const path = await currentNote();
  if (!path) {
    throw new Error('open CryptoView from a note to copy into it');
  }
  const page = await pageSize();
  const lines = text.split('\n');
  const longest = Math.max(...lines.map(line => line.length), 1);
  const width = page.width - INSET - MARGIN;
  const fontSize = Math.max(
    MIN_FONT,
    Math.min(MAX_FONT, Math.floor(width / (longest * ADVANCE))),
  );
  const height = Math.min(
    Math.round(lines.length * fontSize * LINE),
    page.height - INSET - MARGIN,
  );
  const textRect = {
    left: INSET,
    top: INSET,
    right: INSET + width,
    bottom: INSET + height,
  };
  const box = {
    textContentFull: text,
    textRect,
    fontSize,
    textAlign: 0,
    textFrameWidthType: 0,
    textFrameStyle: 0,
    textEditable: 0,
  };
  const fontPath = monoFontPath();
  let answer: any = fontPath
    ? await PluginNoteAPI.insertText({...box, fontPath})
    : null;
  const usedFont = !!answer?.success;
  if (!usedFont) {
    answer = await PluginNoteAPI.insertText(box);
  }
  if (!answer?.success) {
    throw new Error(answer?.error?.message ?? 'the note refused the text');
  }
  await PluginNoteAPI.saveCurrentNote().catch(() => {});
  // A new text box keeps a default size until it is laid out again; writing
  // its geometry back does that. Best effort: the text is already there.
  try {
    const element: any = result(await PluginFileAPI.getLastElement());
    if (element?.textBox) {
      const shown = result(await PluginCommAPI.getCurrentPageNum());
      const pageNum =
        typeof element.pageNum === 'number' && element.pageNum >= 0
          ? element.pageNum
          : typeof shown === 'number'
          ? shown
          : 0;
      await PluginFileAPI.modifyElements(path, pageNum, [
        {
          ...element,
          pageNum,
          layerNum: element.layerNum ?? 0,
          textBox: {
            ...element.textBox,
            textRect,
            fontSize,
            textFrameWidthType: 0,
            ...(usedFont ? {fontPath} : {}),
          },
        },
      ]);
      await PluginNoteAPI.saveCurrentNote().catch(() => {});
    }
  } catch {}
}
