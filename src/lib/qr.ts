const DATA_CODEWORDS = [19, 34, 55, 80, 108];
const ECC_CODEWORDS = [7, 10, 15, 20, 26];
const ALIGNMENT = [[], [6, 18], [6, 22], [6, 26], [6, 30]];

function multiply(x: number, y: number) {
  let product = 0;
  for (let i = 7; i >= 0; i--) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((y >>> i) & 1) * x;
  }
  return product;
}
function generator(degree: number) {
  let result = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = Array(result.length + 1).fill(0) as number[];
    result.forEach((coefficient, index) => { next[index]! ^= coefficient; next[index + 1]! ^= multiply(coefficient, root); });
    result = next;
    root = multiply(root, 2);
  }
  return result;
}
function errorCorrection(data: number[], count: number) {
  const poly = generator(count);
  const remainder = Array(count).fill(0) as number[];
  for (const value of data) {
    const factor = value ^ remainder[0]!;
    remainder.shift(); remainder.push(0);
    remainder.forEach((_, index) => { remainder[index]! ^= multiply(poly[index + 1]!, factor); });
  }
  return remainder;
}
function formatBits(mask: number) {
  const data = (1 << 3) | mask;
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit--) if (((remainder >>> bit) & 1) !== 0) remainder ^= 0x537 << (bit - 10);
  return ((data << 10) | remainder) ^ 0x5412;
}

export function makeQrMatrix(value: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(value));
  const version = DATA_CODEWORDS.findIndex(capacity => 4 + 8 + bytes.length * 8 <= capacity * 8) + 1;
  if (version < 1 || version > 5) throw new Error('This demo QR link is too long.');
  const dataLimit = DATA_CODEWORDS[version - 1]!;
  const bits: number[] = [];
  const append = (valueBits: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((valueBits >>> i) & 1); };
  append(4, 4); append(bytes.length, 8); bytes.forEach(byte => append(byte, 8));
  for (let i = 0, limit = Math.min(4, dataLimit * 8 - bits.length); i < limit; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  for (let pad = 0; data.length < dataLimit; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
  const codewords = data.concat(errorCorrection(data, ECC_CODEWORDS[version - 1]!));
  const size = 17 + 4 * version;
  const matrix = Array.from({ length: size }, () => Array(size).fill(false) as boolean[]);
  const fixed = Array.from({ length: size }, () => Array(size).fill(false) as boolean[]);
  const setFunction = (x: number, y: number, dark: boolean) => { matrix[y]![x] = dark; fixed[y]![x] = true; };
  const finder = (x0: number, y0: number) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const x = x0 + dx; const y = y0 + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)));
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  for (let i = 8; i < size - 8; i++) { setFunction(i, 6, i % 2 === 0); setFunction(6, i, i % 2 === 0); }
  for (const y of ALIGNMENT[version - 1]!) for (const x of ALIGNMENT[version - 1]!) {
    if (fixed[y]![x]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const bitsFormat = formatBits(0);
  for (let i = 0; i <= 5; i++) setFunction(8, i, ((bitsFormat >>> i) & 1) !== 0);
  setFunction(8, 7, ((bitsFormat >>> 6) & 1) !== 0); setFunction(8, 8, ((bitsFormat >>> 7) & 1) !== 0); setFunction(7, 8, ((bitsFormat >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, ((bitsFormat >>> i) & 1) !== 0);
  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, ((bitsFormat >>> i) & 1) !== 0);
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, ((bitsFormat >>> i) & 1) !== 0);
  setFunction(8, size - 8, true);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (!fixed[y]![x]) {
          const dark = bitIndex < codewords.length * 8 && ((codewords[bitIndex >>> 3]! >>> (7 - (bitIndex & 7))) & 1) !== 0;
          matrix[y]![x] = dark !== ((x + y) % 2 === 0);
          bitIndex++;
        }
      }
    }
  }
  return matrix;
}

export function qrSvg(value: string, foreground = '#1f3027', background = '#ffffff') {
  const matrix = makeQrMatrix(value);
  const quiet = 4; const size = matrix.length + quiet * 2;
  const cells = matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`] : [])).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="${background}"/><g fill="${foreground}">${cells}</g></svg>`;
}

export async function downloadQrPng(value: string, filename: string) {
  const svg = new Blob([qrSvg(value)], { type: 'image/svg+xml' });
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
