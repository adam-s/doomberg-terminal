/**
 * Resizes an image to a maximum dimension while maintaining aspect ratio.
 * @param url The URL of the image to resize.
 * @param maxDimension The maximum width or height for the resized image.
 * @returns A Promise that resolves with a data URL (JPEG format) of the resized image.
 */
export async function resizeImage(url: string, maxDimension: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error(`Failed to load image from URL: ${url}`));
    };
    image.src = url;
  });

  const width = img.width;
  const height = img.height;
  if (!width || !height) {
    throw new Error('Image has invalid dimensions.');
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height, 1);
  const targetWidth = Math.round(width * ratio);
  const targetHeight = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get 2D rendering context from canvas.');
  }
  context.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/jpeg', 0.8);
}
