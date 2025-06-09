/**
 * Formats a duration in milliseconds to a human-readable string with minutes and seconds
 * @param ms Duration in milliseconds
 * @returns Formatted duration string in the format "mm:ss"
 */
export function formatDuration(ms: number): string {
  // Convert milliseconds to total seconds
  const totalSeconds = Math.floor(ms / 1000);

  // Calculate minutes and remaining seconds
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Format with leading zeros if needed
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');

  // Return in the format "mm:ss"
  return `${formattedMinutes}:${formattedSeconds}`;
}
