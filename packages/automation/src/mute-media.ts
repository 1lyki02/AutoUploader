export async function mutePageMedia(page: {
  addInitScript(fn: () => void): Promise<unknown>;
}): Promise<void> {
  await page.addInitScript(muteMediaInitScript);
}

export async function muteContextMedia(context: {
  addInitScript(fn: () => void): Promise<unknown>;
}): Promise<void> {
  await context.addInitScript(muteMediaInitScript);
}

function muteMediaInitScript(): void {
  const silence = (el: HTMLMediaElement) => {
    try {
      el.muted = true;
      el.volume = 0;
      el.defaultMuted = true;
    } catch {
      // ignore cross-origin / detached nodes
    }
  };

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (
    this: HTMLMediaElement,
    ...args: Parameters<HTMLMediaElement["play"]>
  ) {
    silence(this);
    return originalPlay.apply(this, args);
  };

  const observe = () => {
    document.querySelectorAll("video, audio").forEach((node) => silence(node as HTMLMediaElement));
  };

  if (document.documentElement) {
    new MutationObserver(observe).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  observe();
  document.addEventListener("DOMContentLoaded", observe, true);
}
