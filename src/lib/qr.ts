import qrcode from 'qrcode-generator';

// Plain codes use level M. A code with a logo in the middle uses level H,
// so the logo can cover part of the code and it still scans.
export type QrLevel = 'L' | 'M' | 'Q' | 'H';

export const LOGO_MAX_SHARE = 0.18;

export type QrLogo = { href: string };

export function makeQrMatrix(value: string, level: QrLevel = 'M'): boolean[][] {
  const qr = qrcode(0, level);
  qr.addData(value);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => qr.isDark(y, x)),
  );
}

// The logo sits in the centre, no wider than 18 percent of the code, on a
// white rounded square with a half-module margin. Returns its box in modules.
export function logoBox(moduleCount: number) {
  const side = Math.floor(moduleCount * LOGO_MAX_SHARE);
  const backing = side + 1;
  const start = Math.floor((moduleCount - backing) / 2);
  return {
    backing: { x: start, y: start, size: backing },
    logo: { x: start + 0.5, y: start + 0.5, size: side },
  };
}

export function qrSvg(
  value: string,
  foreground = '#1f3027',
  background = '#ffffff',
  logo?: QrLogo,
) {
  const matrix = makeQrMatrix(value, logo ? 'H' : 'M');
  const quiet = 4;
  const count = matrix.length;
  const size = count + quiet * 2;
  const cells = matrix
    .flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`] : [])),
    )
    .join('');
  let overlay = '';
  if (logo) {
    const box = logoBox(count);
    const b = box.backing;
    const l = box.logo;
    overlay =
      `<rect x="${b.x + quiet}" y="${b.y + quiet}" width="${b.size}" height="${b.size}" rx="1" fill="#ffffff"/>` +
      `<image x="${l.x + quiet}" y="${l.y + quiet}" width="${l.size}" height="${l.size}" preserveAspectRatio="xMidYMid meet" href="${logo.href}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="${background}"/><g fill="${foreground}">${cells}</g>${overlay}</svg>`;
}

export async function downloadQrPng(
  value: string,
  filename: string,
  foreground = '#1f3027',
  background = '#ffffff',
  logo?: QrLogo,
) {
  const svg = new Blob([qrSvg(value, foreground, background, logo)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width * 4; canvas.height = image.height * 4;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not export this QR code.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export this QR code.')), 'image/png'));
    const link = document.createElement('a'); link.href = URL.createObjectURL(png); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
  } finally { URL.revokeObjectURL(url); }
}
