import { useEffect, useState } from "react";
import type { AccountSummary } from "./env.d.ts";

export function App() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [title, setTitle] = useState("Тестовое видео");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const refreshAccounts = () => {
    window.api.accounts.list().then(setAccounts);
  };

  useEffect(() => {
    refreshAccounts();
  }, []);

  const connectYoutube = async () => {
    setConnecting(true);
    setStatus("Открой браузер и войди в аккаунт Google…");
    try {
      await window.api.accounts.connectYoutube("YouTube");
      setStatus("Аккаунт подключён.");
      refreshAccounts();
    } catch (err) {
      setStatus(`Ошибка подключения: ${(err as Error).message}`);
    } finally {
      setConnecting(false);
    }
  };

  const pickFile = async () => {
    const path = await window.api.video.pickFile();
    setFilePath(path);
  };

  const upload = async (accountId: string) => {
    if (!filePath) {
      setStatus("Сначала выбери видеофайл.");
      return;
    }
    setUploadingId(accountId);
    setStatus("Загружаю на YouTube…");
    try {
      const { videoId } = await window.api.video.uploadToYoutube({
        accountId,
        filePath,
        title,
      });
      setStatus(`Загружено: https://youtube.com/watch?v=${videoId}`);
    } catch (err) {
      setStatus(`Ошибка загрузки: ${(err as Error).message}`);
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 640 }}>
      <h1>AutoUploader</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Аккаунты</h2>
        <button onClick={connectYoutube} disabled={connecting}>
          {connecting ? "Подключаю…" : "Подключить YouTube"}
        </button>
        <ul>
          {accounts.map((a) => (
            <li key={a.id} style={{ marginTop: 8 }}>
              [{a.platform}] {a.label}{" "}
              <button onClick={() => upload(a.id)} disabled={uploadingId === a.id}>
                {uploadingId === a.id ? "Загружаю…" : "Загрузить видео сюда"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Видео</h2>
        <button onClick={pickFile}>Выбрать файл</button>
        {filePath && <p>Выбрано: {filePath}</p>}
        <label>
          Заголовок:{" "}
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </section>

      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </div>
  );
}
