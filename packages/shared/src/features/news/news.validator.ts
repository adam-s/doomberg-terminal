import {
  INewsItemModel,
  MediaType,
  AnalysisSentiment,
  INewMediaItem,
  INewsItemAnalysis,
} from './NewsDataAccessObject';

export class ValidationError extends Error {
  public readonly errors: string[];

  public constructor(errors: string[]) {
    super(`Validation failed: ${errors.join('; ')}`);
    this.errors = errors;
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NewsValidator {
  public static validate(item: Partial<INewsItemModel>, isNew: boolean): void {
    const errors: string[] = [];
    this.validateTitle(item, isNew, errors);
    this.validateMedia(item, isNew, errors);
    this.validateAnalysis(item, errors);
    this.validateTimestamps(item, errors);
    this.validateTags(item, errors);
    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  private static validateTitle(
    item: Partial<INewsItemModel>,
    isNew: boolean,
    errors: string[],
  ): void {
    if (isNew || item.title !== undefined) {
      if (!item.title || item.title.trim() === '') {
        errors.push('Title is required and cannot be empty.');
      }
    }
  }

  private static validateMedia(
    item: Partial<INewsItemModel>,
    isNew: boolean,
    errors: string[],
  ): void {
    if (isNew || item.media !== undefined) {
      if (!Array.isArray(item.media)) {
        errors.push('Media must be an array.');
        return;
      }
      item.media.forEach((mediaItem, index) => {
        this.validateSingleMediaItem(mediaItem, index, errors);
      });
    }
  }

  private static validateSingleMediaItem(
    mediaItem: INewMediaItem,
    index: number,
    errors: string[],
  ): void {
    if (!mediaItem.uri || mediaItem.uri.trim() === '') {
      errors.push(`Media item ${index}: URI is required.`);
    }
    if (
      !mediaItem.mediaType ||
      !Object.values(MediaType).includes(mediaItem.mediaType as MediaType)
    ) {
      errors.push(`Media item ${index}: Valid media type is required.`);
    }
  }

  private static validateAnalysis(item: Partial<INewsItemModel>, errors: string[]): void {
    if (item.analysis !== undefined) {
      if (item.analysis === null) {
        return;
      }
      if (typeof item.analysis !== 'object' || item.analysis === null) {
        errors.push('Analysis must be an object or null.');
        return;
      }
      const analysis = item.analysis as INewsItemAnalysis;
      if (!analysis.summary || analysis.summary.trim() === '') {
        errors.push('Analysis description is required.');
      }
      if (
        !analysis.sentiment ||
        !Object.values(AnalysisSentiment).includes(analysis.sentiment as AnalysisSentiment)
      ) {
        errors.push('Analysis sentiment is required and must be a valid sentiment.');
      }

      // Validate impactScore
      if (analysis.impactScore !== undefined) {
        if (typeof analysis.impactScore !== 'number') {
          errors.push('Analysis impact score must be a number.');
        } else if (
          analysis.impactScore < 1 ||
          analysis.impactScore > 5 ||
          !Number.isInteger(analysis.impactScore)
        ) {
          errors.push('Analysis impact score must be an integer between 1 and 5.');
        }
      }

      // Validate historicalPrecedents
      if (analysis.historicalPrecedents !== undefined) {
        if (!Array.isArray(analysis.historicalPrecedents)) {
          errors.push('Analysis historical precedents must be an array.');
        } else {
          analysis.historicalPrecedents.forEach((precedent, index) => {
            if (typeof precedent !== 'object' || precedent === null) {
              errors.push(`Historical precedent ${index} must be an object.`);
              return;
            }
            if (
              !precedent.situation ||
              typeof precedent.situation !== 'string' ||
              precedent.situation.trim() === ''
            ) {
              errors.push(
                `Historical precedent ${index}: situation is required and must be a non-empty string.`,
              );
            }
            if (
              !precedent.immediateMarketEffect ||
              typeof precedent.immediateMarketEffect !== 'string' ||
              precedent.immediateMarketEffect.trim() === ''
            ) {
              errors.push(
                `Historical precedent ${index}: immediateMarketEffect is required and must be a non-empty string.`,
              );
            }
            if (
              !precedent.oneWeekMarketEffect ||
              typeof precedent.oneWeekMarketEffect !== 'string' ||
              precedent.oneWeekMarketEffect.trim() === ''
            ) {
              errors.push(
                `Historical precedent ${index}: oneWeekMarketEffect is required and must be a non-empty string.`,
              );
            }
          });
        }
      }
    }
  }

  private static validateTimestamps(item: Partial<INewsItemModel>, errors: string[]): void {
    if (item.retrievedTimestamp !== undefined && typeof item.retrievedTimestamp !== 'number') {
      errors.push('Retrieved timestamp must be a number.');
    }
    if (item.publishedTimestamp !== undefined && typeof item.publishedTimestamp !== 'number') {
      errors.push('Published timestamp must be a number.');
    }
  }

  private static validateTags(item: Partial<INewsItemModel>, errors: string[]): void {
    if (item.tags !== undefined) {
      if (!Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === 'string')) {
        errors.push('Tags must be an array of strings.');
      }
    }
  }
}
