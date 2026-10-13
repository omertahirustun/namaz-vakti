import Foundation

/// Uygulamanın (src/widget/iosWidget.ts) yazdığı ortak alan ve anahtar
let appGroup = "group.com.adezyonmedya.haydinamaza"
let storageKey = "widgetData"

let prayerKeys = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]

let prayerNamesTr: [String: String] = [
  "Fajr": "İmsak", "Sunrise": "Güneş", "Dhuhr": "Öğle",
  "Asr": "İkindi", "Maghrib": "Akşam", "Isha": "Yatsı",
]

/// "Yatsıya 02:36" için vakit adlarının yönelme hâli
let prayerToTr: [String: String] = [
  "Fajr": "İmsaka", "Sunrise": "Güneşe", "Dhuhr": "Öğleye",
  "Asr": "İkindiye", "Maghrib": "Akşama", "Isha": "Yatsıya",
]

private let monthsTr = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]

private let hijriMonthsTr = [
  "Muharrem", "Safer", "Rebiülevvel", "Rebiülahir", "Cemaziyelevvel", "Cemaziyelahir",
  "Recep", "Şaban", "Ramazan", "Şevval", "Zilkade", "Zilhicce",
]

struct DayTimes: Codable {
  /// YYYY-MM-DD
  let date: String
  /// HH:mm, cihazın yerel saatinde
  let times: [String: String]
  let hijri: String
}

struct WidgetData: Codable {
  var themeId: String
  var placeName: String
  var latitude: Double
  var longitude: Double
  var method: Int
  var days: [DayTimes]
}

struct NextPrayer {
  let key: String
  let at: Date
}

func loadWidgetData() -> WidgetData? {
  guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: storageKey),
        let data = json.data(using: .utf8)
  else { return nil }
  return try? JSONDecoder().decode(WidgetData.self, from: data)
}

private func saveWidgetData(_ value: WidgetData) {
  guard let data = try? JSONEncoder().encode(value), let json = String(data: data, encoding: .utf8) else { return }
  UserDefaults(suiteName: appGroup)?.set(json, forKey: storageKey)
}

func dateKey(_ d: Date) -> String {
  let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
  return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

/// "2026-10-07" + "19:46" -> yerel saatte Date
func toDate(_ date: String, _ time: String) -> Date? {
  let d = date.split(separator: "-").compactMap { Int($0) }
  let t = time.split(separator: ":").compactMap { Int($0) }
  guard d.count == 3, t.count >= 2 else { return nil }
  return Calendar.current.date(from: DateComponents(year: d[0], month: d[1], day: d[2], hour: t[0], minute: t[1]))
}

func findNext(_ days: [DayTimes], _ now: Date) -> NextPrayer? {
  let today = dateKey(now)
  for day in days.filter({ $0.date >= today }).sorted(by: { $0.date < $1.date }) {
    for key in prayerKeys {
      if let s = day.times[key], let at = toDate(day.date, s), at > now { return NextPrayer(key: key, at: at) }
    }
  }
  return nil
}

/// "7 Ekim"
func dayMonthTr(_ date: String) -> String {
  let p = date.split(separator: "-").compactMap { Int($0) }
  guard p.count == 3 else { return date }
  return "\(p[2]) \(monthsTr[p[1] - 1])"
}

// MARK: - Geri sayım (src/time.ts ile aynı kurallar)

let soonSeconds = 10 * 60
let urgentSeconds = 5 * 60

enum CountdownStage { case normal, soon, urgent }

func countdownStage(_ secondsLeft: Int) -> CountdownStage {
  if secondsLeft < urgentSeconds { return .urgent }
  if secondsLeft <= soonSeconds { return .soon }
  return .normal
}

/// 1 saat ve üstü: "02:36" (saniyesiz)
func hoursMinutes(_ secondsLeft: Int) -> String {
  let s = max(0, secondsLeft)
  return String(format: "%02d:%02d", s / 3600, (s % 3600) / 60)
}

// MARK: - İnternetten vakit (uygulama uzun süre açılmazsa; src/api.ts ile aynı istek)

private struct AladhanResponse: Decodable {
  struct Day: Decodable {
    struct DateInfo: Decodable {
      struct Gregorian: Decodable { let date: String }
      struct Hijri: Decodable {
        struct Month: Decodable { let number: Int }
        let day: String
        let year: String
        let month: Month
      }
      let gregorian: Gregorian
      let hijri: Hijri
    }
    let timings: [String: String]
    let date: DateInfo
  }
  let data: [Day]
}

private func fetchMonth(_ base: WidgetData, year: Int, month: Int) async throws -> [DayTimes] {
  let url = URL(string:
    "https://api.aladhan.com/v1/calendar/\(year)/\(month)?latitude=\(base.latitude)&longitude=\(base.longitude)&method=\(base.method)"
  )!
  let (data, _) = try await URLSession.shared.data(from: url)
  let decoded = try JSONDecoder().decode(AladhanResponse.self, from: data)
  return decoded.data.map { raw in
    // "01-09-2026" -> "2026-09-01"
    let g = raw.date.gregorian.date.split(separator: "-")
    var times: [String: String] = [:]
    for key in prayerKeys {
      // "05:12 (+03)" -> "05:12"
      times[key] = String((raw.timings[key] ?? "00:00").prefix(5))
    }
    let h = raw.date.hijri
    return DayTimes(
      date: "\(g[2])-\(g[1])-\(g[0])",
      times: times,
      hijri: "\(Int(h.day) ?? 0) \(hijriMonthsTr[max(0, min(11, h.month.number - 1))]) \(h.year)"
    )
  }
}

/// Önümüzde 3 günden az vakit kaldıysa bu ayı ve gelecek ayı çekip ortak alana yazar.
func refreshIfRunningLow(_ data: WidgetData, now: Date) async -> WidgetData {
  let today = dateKey(now)
  let ahead = data.days.filter { $0.date >= today }.count
  if ahead >= 3 { return data }
  let c = Calendar.current.dateComponents([.year, .month], from: now)
  let (y, m) = (c.year!, c.month!)
  let (ny, nm) = m == 12 ? (y + 1, 1) : (y, m + 1)
  do {
    var days = try await fetchMonth(data, year: y, month: m)
    if let next = try? await fetchMonth(data, year: ny, month: nm) { days += next }
    var updated = data
    updated.days = days
    saveWidgetData(updated)
    return updated
  } catch {
    return data
  }
}
