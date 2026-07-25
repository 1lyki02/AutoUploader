import { useState } from "react";

export function App() {
  const [reply, setReply] = useState<string>("");

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>AutoUploader</h1>
      <button onClick={() => window.api.ping().then(setReply)}>Ping main process</button>
      {reply && <p>Ответ: {reply}</p>}
    </div>
  );
}
