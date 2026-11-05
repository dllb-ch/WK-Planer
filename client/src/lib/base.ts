// Where the app lives and whether it is the browser demo (GitHub Pages: base «/WK-Planer/», server in the page).
import { useEffect, useState } from 'react';

/** True in the demo build (`npm run build:demo`): the API runs in this browser, no server. */
export const DEMO = import.meta.env.MODE === 'demo';

/** Path prefix of the app without trailing slash: '' normally, '/WK-Planer' on GitHub Pages. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Path of the current page within the app (without BASE). */
export const appPath = () => location.pathname.slice(BASE.length) || '/';

/**
 * URL for a file of the API in a link or image. Normally the URL itself; in the demo the browser cannot load it
 * from a server, so the file is fetched (answered in the page) and shown as an object URL.
 */
export function useFileUrl(url: string) {
  const [src, setSrc] = useState(DEMO ? '' : url);
  useEffect(() => {
    if (!DEMO) return setSrc(url);
    let alive = true;
    let objectUrl = '';
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        if (alive) setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return src;
}
