import http from "node:http";
import { URL } from "node:url";
import { OAuth2Client } from "google-auth-library";

export interface YouTubeOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/**
 * Runs a loopback OAuth2 flow (RFC 8252): spins up a local HTTP server, hands the
 * caller the consent URL to open in the system browser, and resolves once Google
 * redirects back with an authorization code.
 */
export async function runYouTubeLoginFlow(
  creds: YouTubeOAuthCredentials,
  openUrl: (url: string) => void | Promise<void>,
): Promise<YouTubeTokens> {
  return new Promise((resolve, reject) => {
    // Captured once the server starts listening — server.address() returns
    // null after server.close(), so the redirect URI must not be recomputed
    // from it inside the request handler (which closes the server first).
    let redirectUri = "";

    const server = http.createServer((req, res) => {
      void (async () => {
        try {
          if (!req.url) return;
          const url = new URL(req.url, "http://127.0.0.1");
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end("Авторизация отклонена. Можно закрыть эту вкладку.");
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          if (!code) return;

          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end("Аккаунт подключён. Можно закрыть эту вкладку.");
          server.close();

          const client = new OAuth2Client(creds.clientId, creds.clientSecret, redirectUri);
          const { tokens } = await client.getToken(code);

          if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
            reject(
              new Error(
                "Google не вернул refresh_token. Обычно это значит, что согласие уже было выдано ранее — отзови доступ приложению в аккаунте Google и попробуй снова.",
              ),
            );
            return;
          }

          resolve({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiryDate: tokens.expiry_date,
          });
        } catch (err) {
          server.close();
          reject(err as Error);
        }
      })();
    });

    server.listen(0, "127.0.0.1", () => {
      void (async () => {
        const port = (server.address() as { port: number }).port;
        redirectUri = `http://127.0.0.1:${port}`;
        const client = new OAuth2Client(creds.clientId, creds.clientSecret, redirectUri);
        const authUrl = client.generateAuthUrl({
          access_type: "offline",
          prompt: "consent",
          scope: SCOPES,
        });
        await openUrl(authUrl);
      })();
    });
  });
}

export async function refreshYouTubeAccessToken(
  creds: YouTubeOAuthCredentials,
  refreshToken: string,
): Promise<{ accessToken: string; expiryDate: number }> {
  const client = new OAuth2Client(creds.clientId, creds.clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token || !credentials.expiry_date) {
    throw new Error("Не удалось обновить access_token для YouTube-аккаунта");
  }

  return { accessToken: credentials.access_token, expiryDate: credentials.expiry_date };
}
