import React from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Badge,
  tokens,
  makeStyles,
  shorthands,
  Body1,
  Caption1,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Open20Regular,
  Image20Regular,
  Video20Regular,
} from '@fluentui/react-icons';
import { INewsItemModel } from '@shared/features/news/NewsDataAccessObject';

interface NewsDetailDialogProps {
  readonly newsItem: INewsItemModel;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly formatTimeAgo: (timestamp: number, currentTime: number) => string;
  readonly currentTime: number;
}

enum SentimentType {
  BULLISH = 'bullish',
  BEARISH = 'bearish',
  NEUTRAL = 'neutral',
}

const SENTIMENT_COLORS = {
  bullish: '#8bd100',
  bearish: '#f25022',
  neutral: '#8A8886',
} as const;

const useStyles = makeStyles({
  surface: {
    margin: tokens.spacingVerticalS,
    maxHeight: `calc(100vh - 2 * ${tokens.spacingVerticalS})`,
    maxWidth: `calc(100vw - 2 * ${tokens.spacingHorizontalS})`,
    boxSizing: 'border-box',
  },
  header: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  closeButton: {
    position: 'absolute',
    top: tokens.spacingVerticalM,
    right: tokens.spacingHorizontalM,
    zIndex: 1,
  },
  metadata: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
  badgeGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    marginTop: tokens.spacingVerticalS,
  },
  dialogContentWithCustomScrollbar: {
    flex: 1,
    overflowY: 'auto',
    '&::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: tokens.colorNeutralBackground3,
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: tokens.colorNeutralForeground3,
      borderRadius: '4px',
      '&:hover': {
        background: tokens.colorNeutralForeground2,
      },
    },
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralForeground3} ${tokens.colorNeutralBackground3}`,
  },
  contentWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
  },
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  precedent: {
    marginBottom: tokens.spacingVerticalM,
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalS,
  },
});

const openNewsLink = (url: string | undefined): void => {
  if (url && chrome?.tabs?.create) {
    chrome.tabs.create({ url, active: true });
  }
};

export const NewsDetailDialog: React.FC<NewsDetailDialogProps> = ({
  newsItem,
  isOpen,
  onClose,
  formatTimeAgo,
  currentTime,
}) => {
  const styles = useStyles();
  const timeAgo = formatTimeAgo(newsItem.publishedTimestamp ?? Date.now(), currentTime);
  const sentiment = newsItem.analysis?.sentiment ?? SentimentType.NEUTRAL;
  const impact = newsItem.analysis?.impactScore ?? 0;

  const sentimentStyle = () => {
    switch (sentiment.toLowerCase()) {
      case SentimentType.BULLISH:
        return { backgroundColor: SENTIMENT_COLORS.bullish, color: tokens.colorNeutralForeground1 };
      case SentimentType.BEARISH:
        return {
          backgroundColor: SENTIMENT_COLORS.bearish,
          color: tokens.colorNeutralForegroundInverted,
        };
      default:
        return {
          backgroundColor: SENTIMENT_COLORS.neutral,
          color: tokens.colorNeutralForegroundInverted,
        };
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <div className={styles.header}>
              <h3>{newsItem.title}</h3>
              <div className={styles.metadata}>
                <Caption1>
                  {newsItem.newsSource} • {timeAgo}
                </Caption1>
              </div>
              <div className={styles.badgeGroup}>
                <Badge appearance="filled" style={sentimentStyle()} shape="rounded">
                  {sentiment.toUpperCase()}
                </Badge>
                <Badge appearance="outline" shape="rounded">
                  Impact: {impact}
                </Badge>
                <Button
                  appearance="subtle"
                  icon={<Open20Regular />}
                  onClick={() => openNewsLink(newsItem.fullContentUri)}>
                  Source
                </Button>
              </div>
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                onClick={onClose}
                aria-label="Close dialog"
                className={styles.closeButton}
              />
            </div>
          </DialogTitle>

          <DialogContent className={styles.dialogContentWithCustomScrollbar}>
            <div className={styles.contentWrapper}>
              {/* Summary */}
              <section className={styles.section}>
                <h3>Summary</h3>
                <Body1>{newsItem.contentSnippet}</Body1>
              </section>

              {/* Analysis */}
              {newsItem.analysis &&
                newsItem.analysis.summary &&
                newsItem.analysis.summary !== newsItem.contentSnippet && (
                  <section className={styles.section}>
                    <h3>Analysis</h3>
                    <Body1>{newsItem.analysis.summary}</Body1>
                  </section>
                )}

              {/* Historical Precedents */}
              {Array.isArray(newsItem.analysis?.historicalPrecedents) &&
                newsItem.analysis.historicalPrecedents.length > 0 && (
                  <section className={styles.section}>
                    <h3>Historical Precedents</h3>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: tokens.spacingVerticalL,
                      }}>
                      {newsItem.analysis.historicalPrecedents.map((precedent, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: tokens.spacingVerticalS,
                          }}>
                          <Body1 block>{precedent.situation}</Body1>
                          <Body1 style={{ marginLeft: tokens.spacingHorizontalM }}>
                            <strong>Immediate Effect:</strong> {precedent.immediateMarketEffect}
                          </Body1>
                          <Body1 style={{ marginLeft: tokens.spacingHorizontalM }}>
                            <strong>One Week Effect:</strong> {precedent.oneWeekMarketEffect}
                          </Body1>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

              {/* Media Content */}
              {Array.isArray(newsItem.media) && newsItem.media.length > 0 && (
                <section className={styles.section}>
                  <h3>Media Content</h3>
                  {newsItem.media.map((mediaItem, mediaIndex) => (
                    <div key={mediaIndex} className={styles.precedent}>
                      <Body1
                        block
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: tokens.spacingHorizontalXS,
                        }}>
                        {mediaItem.mediaType === 'video' ? (
                          <>
                            <Video20Regular />
                            Transcript
                          </>
                        ) : (
                          <>
                            <Image20Regular />
                            OCR Text
                          </>
                        )}
                      </Body1>
                      <Body1>
                        <span style={{ fontFamily: tokens.fontFamilyMonospace }}>
                          {mediaItem.mediaType === 'video'
                            ? (mediaItem as { transcription?: string }).transcription ||
                              'No transcript available.'
                            : (mediaItem as { ocrText?: string }).ocrText ||
                              'No OCR text available.'}
                        </span>
                      </Body1>
                    </div>
                  ))}
                </section>
              )}

              {/* Tags */}
              {Array.isArray(newsItem.tags) && newsItem.tags.length > 0 && (
                <section className={styles.section}>
                  <h3>Tags</h3>
                  <div className={styles.tagContainer}>
                    {newsItem.tags.map((tag, tagIndex) => (
                      <Badge key={tagIndex} appearance="outline" shape="rounded">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </DialogContent>

          <DialogActions>
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
