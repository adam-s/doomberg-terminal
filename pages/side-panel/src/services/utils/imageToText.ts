import { IImageToTextService } from '@src/side-panel/worker/imageToText/imageToText.service';
import { VSBuffer } from 'vs/base/common/buffer';

export const imageToText = async (
  imageUrl: string,
  imageToTextService: IImageToTextService,
): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const vsBuffer = VSBuffer.wrap(new Uint8Array(arrayBuffer));
    if (vsBuffer.byteLength === 0) {
      return 'Error: Fetched image is empty.';
    }
    const imageAnalysis = await imageToTextService.textFromBuffer(vsBuffer);
    // Combine OCR text and detailed caption into a single string
    const combinedText = `OCR: ${imageAnalysis.ocrText}\nDescription: ${imageAnalysis.moreDetailedCaption}`;
    console.log('Image to text:', combinedText);
    return combinedText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error generating text from image: ${errorMessage}`;
  }
};
