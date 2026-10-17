import { useEffect, useState } from 'react';

/**
 * Şimdiki zaman; `stepMs` sınırlarında (saniye ya da dakika başında) güncellenir. Vakitler dakika başında girdiği için
 * dakikalık adım vakit geçişlerini kaçırmaz; saniyelik sayaç yalnız onu gösteren küçük bileşende kullanılmalı ki
 * ekranın tamamı saniyede bir yeniden çizilmesin.
 */
export function useNow(stepMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(new Date(t));
      // Bir sonraki sınıra hizala (setInterval zamanla kayar; 20 ms pay sınırı geçmiş olmayı garantiler)
      timer = setTimeout(tick, stepMs - (t % stepMs) + 20);
    };
    timer = setTimeout(tick, stepMs - (Date.now() % stepMs) + 20);
    return () => clearTimeout(timer);
  }, [stepMs]);
  return now;
}
