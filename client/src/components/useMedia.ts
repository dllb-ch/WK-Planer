import { useEffect, useState } from 'react';

const query = '(max-width: 767px)';

/** True on phone-sized screens (below Tailwind's md breakpoint). */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}
