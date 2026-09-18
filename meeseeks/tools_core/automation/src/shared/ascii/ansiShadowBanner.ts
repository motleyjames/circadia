import fs from 'node:fs';
import path from 'node:path';

type FigletGlyph = ReadonlyArray<string>;

type FigletFont = {
  hardblank: string;
  height: number;
  glyphs: Map<string, FigletGlyph>;
};

export type RenderAnsiShadowBannerOptions = {
  /**
   * Output height to return. The ANSI Shadow font is 7 lines tall, but the
   * The ANSI Shadow FIGlet font banner uses the top 5 lines.
   */
  outputHeight?: number;
  /**
   * Trim trailing whitespace on each returned line.
   */
  trimRight?: boolean;
  /**
   * Character to render when the input contains an unsupported glyph.
   */
  unknownChar?: string;
};

let cachedAnsiShadowFont: FigletFont | null = null;

function parseFigletFont(flfContents: string): FigletFont {
  const lines = flfContents.replace(/\r\n/g, '\n').split('\n');
  if (lines.length === 0 || lines[0].trim() === '') {
    throw new Error('Invalid FIGlet font: missing header line');
  }

  const headerParts = lines[0].trimEnd().split(/\s+/);
  const signature = headerParts[0] ?? '';
  if (!signature.startsWith('flf2a')) {
    throw new Error(`Invalid FIGlet font: unsupported signature "${signature}"`);
  }

  const hardblank = signature.slice(-1);
  const height = Number.parseInt(headerParts[1] ?? '', 10);
  const commentLines = Number.parseInt(headerParts[5] ?? '', 10);

  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`Invalid FIGlet font: bad height "${headerParts[1]}"`);
  }
  if (!Number.isFinite(commentLines) || commentLines < 0) {
    throw new Error(`Invalid FIGlet font: bad commentLines "${headerParts[5]}"`);
  }

  let idx = 1 + commentLines;
  const glyphs = new Map<string, FigletGlyph>();

  // Standard FIGlet fonts define glyphs for ASCII 32..126 inclusive.
  for (let code = 32; code <= 126; code += 1) {
    const raw = lines.slice(idx, idx + height);
    idx += height;

    // Some fonts may end with a trailing newline; fail fast if missing glyph data.
    if (raw.length !== height) {
      throw new Error(`Invalid FIGlet font: missing glyph data for ASCII ${code}`);
    }

    // Endmark is the last character of each raw line (usually '@').
    const endmark = raw[0].slice(-1);
    const cleaned = raw.map((line, lineIdx) => {
      let out = line;

      if (lineIdx === height - 1) {
        // Last line ends with endmark twice.
        if (out.endsWith(endmark + endmark)) out = out.slice(0, -2);
        else if (out.endsWith(endmark)) out = out.slice(0, -1);
      } else {
        if (out.endsWith(endmark)) out = out.slice(0, -1);
      }

      // `String.prototype.replaceAll` isn't available under this project's TS lib target.
      return out.split(hardblank).join(' ');
    });

    glyphs.set(String.fromCharCode(code), cleaned);
  }

  return { hardblank, height, glyphs };
}

function loadAnsiShadowFont(): FigletFont {
  if (cachedAnsiShadowFont) return cachedAnsiShadowFont;

  const fontPath = path.join(__dirname, 'fonts', 'ansi-shadow.flf');
  const contents = fs.readFileSync(fontPath, 'utf8');
  cachedAnsiShadowFont = parseFigletFont(contents);
  return cachedAnsiShadowFont;
}

function renderSingleLine(font: FigletFont, text: string, unknownChar: string): string[] {
  const out = Array.from({ length: font.height }, () => '');

  for (const ch of text) {
    const glyph =
      font.glyphs.get(ch) ??
      font.glyphs.get(ch.toUpperCase()) ??
      font.glyphs.get(unknownChar) ??
      font.glyphs.get('?') ??
      font.glyphs.get(' ')!;

    for (let i = 0; i < font.height; i += 1) {
      out[i] += glyph[i] ?? '';
    }
  }

  return out;
}

/**
 * Render a banner using the "ANSI Shadow" FIGlet font.
 */
export function renderAnsiShadowBanner(
  text: string,
  options: RenderAnsiShadowBannerOptions = {},
): string {
  const font = loadAnsiShadowFont();

  const outputHeight = options.outputHeight ?? 5;
  const trimRight = options.trimRight ?? false;
  const unknownChar = options.unknownChar ?? '?';

  const textLines = text.split(/\r?\n/);
  const renderedLines: string[] = [];

  for (let lineIdx = 0; lineIdx < textLines.length; lineIdx += 1) {
    const line = textLines[lineIdx] ?? '';
    const block = renderSingleLine(font, line, unknownChar).slice(0, outputHeight);

    for (const blockLine of block) {
      renderedLines.push(trimRight ? blockLine.replace(/\s+$/g, '') : blockLine);
    }

    if (lineIdx !== textLines.length - 1) renderedLines.push('');
  }

  return renderedLines.join('\n');
}

