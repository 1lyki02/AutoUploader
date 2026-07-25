import { useEffect, useState } from "react";
import type { AccountSummary, ProxyConfig } from "./env.d.ts";

function AccountRow({
  account,
  onChanged,
  onUpload,
  uploading,
}: {
  account: AccountSummary;
  onChanged: () => void;
  onUpload: (accountId: string) => void;
  uploading: boolean;
}) {
  const [server, setServer] = useState(account.proxy?.server ?? "");
  const [username, setUsername] = useState(account.proxy?.username ?? "");
  const [password, setPassword] = useState(account.proxy?.password ?? "");
  const [saving, setSaving] = useState(false);

  const saveProxy = async () => {
    setSaving(true);
    try {
      const proxy: ProxyConfig | null = server.trim()
        ? { server: server.trim(), username: username || undefined, password: password || undefined }
        : null;
      await window.api.accounts.updateProxy(account.id, proxy);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await window.api.accounts.delete(account.id);
    onChanged();
  };

  return (
    <li style={{ marginTop: 12, borderTop: "1px solid #ddd", paddingTop: 8 }}>
      <div>
        [{account.platform}] {account.label}{" "}
        <button onClick={() => onUpload(account.id)} disabled={uploading}>
          {uploading ? "Загружаю…" : "Загрузить видео сюда"}
        </button>{" "}
        <button onClick={remove}>Удалить</button>
      </div>
      <div style={{ marginTop: 4, fontSize: 14 }}>
        Прокси:{" "}
        <input
          placeholder="host:port"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          style={{ width: 140 }}
        />{" "}
        <input
          placeholder="логин (опц.)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: 100 }}
        />{" "}
        <input
          placeholder="пароль (опц.)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: 100 }}
        />{" "}
        <button onClick={saveProxy} disabled={saving}>
          Сохранить
        </button>
      </div>
    </li>
  );
}

export function App() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [title, setTitle] = useState("Тестовое видео");
  const [privacyStatus, setPrivacyStatus] = useState<"private" | "unlisted" | "public">(
    "private",
  );
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
        privacyStatus,
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
        <ul style={{ listStyle: "none", paddingLeft: 0 }}>
          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              onChanged={refreshAccounts}
              onUpload={upload}
              uploading={uploadingId === a.id}
            />
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
        <br />
        <label>
          Приватность:{" "}
          <select
            value={privacyStatus}
            onChange={(e) => setPrivacyStatus(e.target.value as typeof privacyStatus)}
          >
            <option value="private">Приватное (рекомендуется для теста)</option>
            <option value="unlisted">По ссылке</option>
            <option value="public">Публичное</option>
          </select>
        </label>
      </section>

      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </div>
  );
}
