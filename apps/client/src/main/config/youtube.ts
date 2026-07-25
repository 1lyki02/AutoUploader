export interface YoutubeOAuthEnvCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Dev-only: reads shared OAuth credentials from .env. Ahead of release each user
 * will connect their own Google Cloud project via an in-app wizard instead (see
 * docs/youtube-api-setup.md) — this is a stand-in for that during early development.
 */
export function getYoutubeOAuthCredentials(): YoutubeOAuthEnvCredentials {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET не заданы — скопируй apps/client/.env.example в .env и заполни значениями из Google Cloud Console",
    );
  }

  return { clientId, clientSecret };
}
