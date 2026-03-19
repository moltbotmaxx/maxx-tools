window.DAILY_TRACKER_X_FEED = {
    enabled: false,
    bridgeUrl: `${window.location.origin}/rss-bridge/`,
    context: 'By keyword or hashtag',
    query: '"artificial intelligence" OR AI OR ChatGPT OR OpenAI OR Anthropic OR Claude OR Gemini OR robotics',
    maxResults: 12,
    hideReplies: true,
    hideRetweets: true,
    hidePinned: true,
    onlyMedia: false,
    hideProfilePictures: true,
    hideTweetImages: false,
    hideExternalLinkPreview: false,
    useTweetIdAsTitle: false,
    ...(window.DAILY_TRACKER_X_FEED || {})
};
