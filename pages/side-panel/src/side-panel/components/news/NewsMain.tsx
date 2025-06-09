import React, { useEffect, useState } from 'react';
import {
  makeStyles,
  Card,
  CardHeader,
  CardFooter,
  Text,
  Caption1,
  tokens,
  Badge,
  Button,
} from '@fluentui/react-components';
import { Open20Regular, Image20Regular, Video20Regular } from '@fluentui/react-icons';
import { VirtualizerScrollViewDynamic } from '@fluentui/react-components/unstable';
import { useNews } from '../../hooks/useNews';
import { INewsItemModel } from '@shared/features/news/NewsDataAccessObject';
import { DarkScrollContainer } from '../common/DarkScrollContainer';
import { useTextStyles } from '../common/textStyles';
import { NewsDetailDialog } from './NewsDetailDialog';

const NEWS_ITEM_HEIGHT = 100;
const BUFFER_ITEMS = 2;
const BUFFER_SIZE = 24;

enum SentimentType {
  BULLISH = 'bullish',
  BEARISH = 'bearish',
  NEUTRAL = 'neutral',
}

const SENTIMENT_COLORS = {
  bullish: '#8bd100', // Green for calls
  bearish: '#f25022', // Red for puts
  neutral: '#8A8886', // Neutral gray
} as const;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    padding: '10px',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    gap: tokens.spacingHorizontalS,
  },
  header: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#777',
  },
  content: {
    fontSize: '14px',
    color: '#777',
  },
  virtualizerContainer: {
    flex: 1,
    minHeight: 0,
  },
  newsItem: {
    margin: '8px 0',
    width: '100%',
    boxSizing: 'border-box',
  },
  newsCard: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    gap: tokens.spacingVerticalS,
    width: '100%',
    cursor: 'pointer',
    transition: 'transform 0.2s ease-in-out',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: tokens.shadow16,
    },
  },
  sentimentBadge: {
    marginRight: tokens.spacingHorizontalXS,
  },
  bullishBadge: {
    backgroundColor: SENTIMENT_COLORS.bullish,
    color: '#000000',
    fontWeight: tokens.fontWeightSemibold,
  },
  bearishBadge: {
    backgroundColor: SENTIMENT_COLORS.bearish,
    color: '#ffffff',
    fontWeight: tokens.fontWeightSemibold,
  },
  neutralBadge: {
    backgroundColor: SENTIMENT_COLORS.neutral,
    color: '#ffffff',
    fontWeight: tokens.fontWeightSemibold,
  },
  metaText: {
    fontSize: '12px',
    color: '#777',
    fontFamily: 'Arial, sans-serif',
  },
  body: {
    padding: `0`,
  },
  snippet: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  footer: {
    padding: `0 0 ${tokens.spacingVerticalS}`,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  scoreBadge: {
    fontWeight: tokens.fontWeightSemibold,
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  titleSection: {
    flex: 1,
    minWidth: 0,
  },
  openLinkButton: {
    flexShrink: 0,
    marginLeft: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    '&:hover': {
      color: tokens.colorBrandForeground1,
    },
  },
  mediaIcons: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    marginLeft: tokens.spacingHorizontalXS,
  },
  mediaIcon: {
    color: tokens.colorNeutralForeground3,
  },
});

const formatTimeAgo = (timestamp: number, currentTime: number): string => {
  const diffMs = currentTime - timestamp;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else {
    return `${diffDays}d`;
  }
};

const openNewsLink = (url: string | undefined): void => {
  if (url && chrome?.tabs?.create) {
    chrome.tabs.create({
      url,
      active: true,
    });
  }
};

const hasImageMedia = (newsItem: INewsItemModel): boolean => {
  if (!newsItem.media || newsItem.media.length === 0) {
    return false;
  }

  return newsItem.media.some((mediaItem: { mediaType?: string }) => {
    const mediaType = mediaItem.mediaType?.toLowerCase() || '';
    return mediaType === 'image';
  });
};

const hasVideoMedia = (newsItem: INewsItemModel): boolean => {
  if (!newsItem.media || newsItem.media.length === 0) {
    return false;
  }

  return newsItem.media.some((mediaItem: { mediaType?: string }) => {
    const mediaType = mediaItem.mediaType?.toLowerCase() || '';
    return mediaType === 'video';
  });
};

const getSentimentBadgeStyle = (sentiment: string) => {
  switch (sentiment?.toLowerCase()) {
    case SentimentType.BULLISH:
      return {
        backgroundColor: SENTIMENT_COLORS.bullish,
        color: '#000000',
        fontWeight: 'semibold' as const,
      };
    case SentimentType.BEARISH:
      return {
        backgroundColor: SENTIMENT_COLORS.bearish,
        color: '#ffffff',
        fontWeight: 'semibold' as const,
      };
    case SentimentType.NEUTRAL:
      return {
        backgroundColor: SENTIMENT_COLORS.neutral,
        color: '#ffffff',
        fontWeight: 'semibold' as const,
      };
    default:
      return {
        backgroundColor: '#ffb900',
        color: '#000000',
        fontWeight: 'semibold' as const,
      };
  }
};

export const NewsMain: React.FC = () => {
  const styles = useStyles();
  const textStyles = useTextStyles();
  const { news: originalNews, isApiKeyMissing } = useNews();
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [selectedNewsItem, setSelectedNewsItem] = useState<INewsItemModel | undefined>(undefined);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState<boolean>(false);

  // Update current time every minute to refresh "time ago" display
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(intervalId);
  }, []);

  const handleNewsItemClick = (newsItem: INewsItemModel): void => {
    setSelectedNewsItem(newsItem);
    setIsDetailDialogOpen(true);
  };

  const handleCloseDetailDialog = (): void => {
    setIsDetailDialogOpen(false);
    setSelectedNewsItem(undefined);
  };

  if (isApiKeyMissing === undefined) {
    // Still checking API key status
    return (
      <div data-test-id="news-main" className={styles.root}>
        <div className={textStyles.symbolText}>News Main</div>
        <p className={styles.content}>Loading configuration...</p>
      </div>
    );
  }

  if (isApiKeyMissing) {
    return (
      <div data-test-id="news-main" className={styles.root}>
        <div className={textStyles.symbolText}>News Main</div>
        <p className={styles.content}>
          Truth Social news analysis requires a Google Gemini API key. Please configure it in the
          application settings to enable this feature.
        </p>
      </div>
    );
  }

  if (originalNews === undefined) {
    return (
      <div data-test-id="news-main" className={styles.root}>
        <div className={textStyles.symbolText}>News Main</div>
        <p className={styles.content}>Loading news...</p>
      </div>
    );
  }

  if (originalNews.length === 0) {
    return (
      <div data-test-id="news-main" className={styles.root}>
        <div className={textStyles.symbolText}>News Main</div>
        <p className={styles.content}>No news items to display.</p>
      </div>
    );
  }

  return (
    <div data-test-id="news-main" className={styles.root}>
      <div className={textStyles.symbolText}>News Main ({originalNews.length} items)</div>
      <DarkScrollContainer
        className={styles.virtualizerContainer}
        role="list"
        aria-label={`News list with ${originalNews.length} items`}
        tabIndex={0}
        style={{ height: '100%' }}>
        <VirtualizerScrollViewDynamic
          numItems={originalNews.length}
          itemSize={NEWS_ITEM_HEIGHT}
          bufferItems={BUFFER_ITEMS}
          bufferSize={BUFFER_SIZE}>
          {(index: number) => {
            const newsItem = originalNews[index];
            const sentiment = newsItem.analysis?.sentiment || 'neutral';
            const impactScore = newsItem.analysis?.impactScore || 0;
            const timeAgo = formatTimeAgo(newsItem.publishedTimestamp || Date.now(), currentTime);
            const hasImage = hasImageMedia(newsItem);
            const hasVideo = hasVideoMedia(newsItem);

            return (
              <div
                role="listitem"
                aria-posinset={index + 1}
                aria-setsize={originalNews.length}
                key={newsItem.id}
                className={styles.newsItem}>
                <Card
                  className={styles.newsCard}
                  appearance="filled-alternative"
                  size="small"
                  onClick={() => handleNewsItemClick(newsItem)}>
                  {/* ─── HEADER ─── */}
                  <CardHeader
                    header={
                      <div className={styles.headerContent}>
                        <div className={styles.titleSection}>
                          <Text weight="semibold" size={300}>
                            {newsItem.title}
                          </Text>
                        </div>
                        <div className={styles.mediaIcons}>
                          {hasImage && <Image20Regular className={styles.mediaIcon} />}
                          {hasVideo && <Video20Regular className={styles.mediaIcon} />}
                        </div>
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<Open20Regular />}
                          className={styles.openLinkButton}
                          onClick={e => {
                            e.stopPropagation();
                            openNewsLink(newsItem.fullContentUri);
                          }}
                          aria-label="Open news article in new tab"
                        />
                      </div>
                    }
                    description={
                      <Caption1 className={styles.metaText}>
                        {newsItem.newsSource} • {timeAgo}
                      </Caption1>
                    }
                  />

                  {/* ─── BODY ─── */}
                  <div className={styles.body}>
                    <Text
                      className={styles.snippet}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                      {newsItem.contentSnippet && newsItem.contentSnippet.length > 80
                        ? `${newsItem.contentSnippet.substring(0, 80)}...`
                        : newsItem.contentSnippet || 'Recent news update'}
                    </Text>
                  </div>

                  {/* ─── FOOTER ─── */}
                  <CardFooter className={styles.footer}>
                    <Badge
                      size="small"
                      className={styles.sentimentBadge}
                      style={getSentimentBadgeStyle(sentiment)}
                      shape="rounded">
                      {sentiment}
                    </Badge>
                    <Badge size="small" appearance="outline" shape="rounded">
                      Impact: {impactScore}
                    </Badge>
                  </CardFooter>
                </Card>
              </div>
            );
          }}
        </VirtualizerScrollViewDynamic>
      </DarkScrollContainer>

      {/* News Detail Dialog */}
      {selectedNewsItem && (
        <NewsDetailDialog
          newsItem={selectedNewsItem}
          isOpen={isDetailDialogOpen}
          onClose={handleCloseDetailDialog}
          formatTimeAgo={formatTimeAgo}
          currentTime={currentTime}
        />
      )}
    </div>
  );
};
