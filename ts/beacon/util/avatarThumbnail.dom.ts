// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A small square JPEG (data: URL) of a profile photo, for showing an
 * account's picture in other accounts' menus. Other processes can't read
 * this account's attachment files, so the picture travels as data.
 */

const SIZE = 64;
const cache = new Map<string, Promise<string | undefined>>();

async function render(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    const bitmap = await window.createImageBitmap(await response.blob());
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = new window.OffscreenCanvas(SIZE, SIZE);
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE
    );
    bitmap.close();
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.85,
    });
    return await new Promise(resolve => {
      const reader = new window.FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export function getAvatarThumbnail(
  url: string | undefined
): Promise<string | undefined> {
  if (!url) {
    return Promise.resolve(undefined);
  }
  let result = cache.get(url);
  if (!result) {
    result = render(url);
    cache.set(url, result);
  }
  return result;
}
