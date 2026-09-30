import AsyncStorage from '@react-native-async-storage/async-storage';

/** Günlük okumaya uygun, bağlamından kopmayan ayetler (sure adı, sure:ayet). */
const VERSES: [string, string][] = [
  ['Bakara', '2:45'], ['Bakara', '2:152'], ['Bakara', '2:153'], ['Bakara', '2:186'], ['Bakara', '2:201'],
  ['Bakara', '2:255'], ['Bakara', '2:286'], ['Âl-i İmrân', '3:8'], ['Âl-i İmrân', '3:134'],
  ['Âl-i İmrân', '3:139'], ['Âl-i İmrân', '3:159'], ['Âl-i İmrân', '3:190'], ['Nisâ', '4:36'],
  ['Mâide', '5:8'], ['En\'âm', '6:162'], ['A\'râf', '7:56'], ['A\'râf', '7:199'], ['Enfâl', '8:46'],
  ['Tevbe', '9:51'], ['Hûd', '11:115'], ['Ra\'d', '13:28'], ['İbrâhîm', '14:7'], ['Hicr', '15:99'],
  ['Nahl', '16:90'], ['Nahl', '16:97'], ['Nahl', '16:125'], ['İsrâ', '17:23'], ['İsrâ', '17:24'],
  ['İsrâ', '17:80'], ['Kehf', '18:10'], ['Tâhâ', '20:25'], ['Tâhâ', '20:114'], ['Nûr', '24:35'],
  ['Furkân', '25:63'], ['Lokmân', '31:17'], ['Lokmân', '31:18'], ['Ahzâb', '33:41'], ['Ahzâb', '33:70'],
  ['Zümer', '39:53'], ['Mü\'min', '40:60'], ['Fussilet', '41:34'], ['Şûrâ', '42:40'], ['Hucurât', '49:10'],
  ['Hucurât', '49:12'], ['Hucurât', '49:13'], ['Kâf', '50:16'], ['Zâriyât', '51:56'], ['Rahmân', '55:13'],
  ['Hadîd', '57:4'], ['Haşr', '59:18'], ['Teğâbün', '64:16'], ['Mülk', '67:2'], ['Duhâ', '93:5'],
  ['İnşirâh', '94:5'], ['İhlâs', '112:1'],
];

const QURAN_API = 'https://api.alquran.cloud/v1/ayah';
const HADITH_URL = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/tur-nawawi.min.json';
const HISTORY_API = 'https://tr.wikipedia.org/api/rest_v1/feed/onthisday';

const DAILY_KEY = 'daily:v2';
const HADITH_KEY = 'hadith:nawawi:v1';
const HISTORY_LIMIT = 5;
// Wikimedia, tanımsız istemcileri (okhttp) 403 ile reddediyor.
const WIKI_HEADERS = { 'User-Agent': 'NamazVakti/1.0 (com.omertahirustun.namazvakti)' };

export interface Verse {
  arabic: string;
  text: string;
  /** "Bakara 2:255" */
  ref: string;
}

export interface Hadith {
  text: string;
  /** "Nevevi, 40 Hadis · 13" */
  ref: string;
}

export interface HistoryEvent {
  year: number;
  text: string;
}

export interface DailyContent {
  date: string;
  verse: Verse | null;
  hadith: Hadith | null;
  history: HistoryEvent[];
}

/** Tarihten sabit bir gün numarası: aynı gün herkese aynı içerik. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fetchVerse(n: number): Promise<Verse> {
  const [sure, ref] = VERSES[n % VERSES.length];
  const json = await fetchJson(`${QURAN_API}/${ref}/editions/quran-uthmani,tr.diyanet`);
  const [ar, tr] = json.data as { text: string }[];
  return { arabic: ar.text, text: tr.text, ref: `${sure} ${ref}` };
}

/** 40 Hadis bir kez indirilir ve kalıcı olarak saklanır. */
async function fetchHadith(n: number): Promise<Hadith> {
  let list: { hadithnumber: number; text: string }[] | null = null;
  try {
    const cached = await AsyncStorage.getItem(HADITH_KEY);
    if (cached) list = JSON.parse(cached);
  } catch {
    // önbellek okunamazsa indir
  }
  if (!list) {
    const json = await fetchJson(HADITH_URL);
    list = (json.hadiths as { hadithnumber: number; text: string }[]).filter((h) => h.text?.trim());
    await AsyncStorage.setItem(HADITH_KEY, JSON.stringify(list)).catch(() => {});
  }
  const h = list[n % list.length];
  return { text: h.text.trim(), ref: `Nevevi, 40 Hadis · ${h.hadithnumber}` };
}

async function fetchHistory(date: string): Promise<HistoryEvent[]> {
  const [, mm, dd] = date.split('-');
  const json = await fetchJson(`${HISTORY_API}/selected/${mm}/${dd}`, WIKI_HEADERS);
  let items = (json.selected ?? []) as { year: number; text: string }[];
  if (items.length === 0) {
    const all = await fetchJson(`${HISTORY_API}/events/${mm}/${dd}`, WIKI_HEADERS);
    items = all.events ?? [];
  }
  return items
    .filter((e) => typeof e.year === 'number' && e.text)
    .sort((a, b) => b.year - a.year)
    .slice(0, HISTORY_LIMIT)
    .map((e) => ({ year: e.year, text: e.text }));
}

/**
 * O günün içeriğini döndürür. Gün içinde önbellekten gelir; internet yoksa
 * alınamayan bölümler boş kalır.
 */
export async function getDaily(date: string): Promise<DailyContent> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as DailyContent;
      if (cached.date === date && cached.verse && cached.hadith && cached.history.length > 0) return cached;
    }
  } catch {
    // önbellek okunamazsa yeniden çek
  }

  const n = dayNumber(date);
  const [verse, hadith, history] = await Promise.all([
    fetchVerse(n).catch(() => null),
    fetchHadith(n).catch(() => null),
    fetchHistory(date).catch(() => [] as HistoryEvent[]),
  ]);
  const content: DailyContent = {
    date,
    verse,
    hadith,
    history,
  };
  if (verse || hadith || history.length > 0) {
    await AsyncStorage.setItem(DAILY_KEY, JSON.stringify(content)).catch(() => {});
  }
  return content;
}
