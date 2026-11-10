// Turns the owner's chosen image into the two files we store: a 512 px PNG for the page and a
// white-background JPEG for print. Runs in the browser only (it uses canvas).

export const LOGO_PAGE_SIZE = 512;

export type LogoFiles = { png: Uint8Array; printJpeg: Uint8Array };

async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not convert that image."))),
      type,
      quality,
    );
  });
}

/** Fit the image inside a square, keeping its shape. Returns the drawn size. */
function fitSquare(width: number, height: number, side: number) {
  const scale = Math.min(side / width, side / height, 1);
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  return {
    drawWidth,
    drawHeight,
    x: Math.round((side - drawWidth) / 2),
    y: Math.round((side - drawHeight) / 2),
  };
}

/** Convert the upload to the page PNG (transparent) and the print JPEG (white background). */
export async function convertLogo(file: File): Promise<LogoFiles> {
  const bitmap = await loadBitmap(file);
  const side = LOGO_PAGE_SIZE;

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = side;
  pageCanvas.height = side;
  const pageContext = pageCanvas.getContext("2d");
  if (!pageContext) throw new Error("Could not read that image.");
  const pageFit = fitSquare(bitmap.width, bitmap.height, side);
  pageContext.drawImage(bitmap, pageFit.x, pageFit.y, pageFit.drawWidth, pageFit.drawHeight);

  const printCanvas = document.createElement("canvas");
  printCanvas.width = side;
  printCanvas.height = side;
  const printContext = printCanvas.getContext("2d");
  if (!printContext) throw new Error("Could not read that image.");
  printContext.fillStyle = "#ffffff";
  printContext.fillRect(0, 0, side, side);
  printContext.drawImage(bitmap, pageFit.x, pageFit.y, pageFit.drawWidth, pageFit.drawHeight);
  bitmap.close();

  const png = new Uint8Array(await (await canvasBlob(pageCanvas, "image/png")).arrayBuffer());
  const printJpeg = new Uint8Array(
    await (await canvasBlob(printCanvas, "image/jpeg", 0.9)).arrayBuffer(),
  );
  return { png, printJpeg };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
