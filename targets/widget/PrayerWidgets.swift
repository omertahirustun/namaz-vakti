import SwiftUI
import WidgetKit

// Android widget'larının (src/widget/PrayerWidget.tsx) iOS karşılığı: aynı tema görselleri, renkler,
// Inter yazı tipi ve geri sayım kuralları (1 saat ve üstü "02:36", altında canlı "59:59",
// son 10 dakikada kırmızımsı, son 5 dakikada koyu kırmızı ve büyük).

// MARK: - Zaman çizelgesi

struct PrayerEntry: TimelineEntry {
  let date: Date
  let data: WidgetData?
}

struct PrayerProvider: TimelineProvider {
  func placeholder(in context: Context) -> PrayerEntry {
    PrayerEntry(date: Date(), data: sampleData())
  }

  func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
    completion(PrayerEntry(date: Date(), data: loadWidgetData() ?? sampleData()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
    Task {
      let now = Date()
      var loaded = loadWidgetData()
      if let current = loaded { loaded = await refreshIfRunningLow(current, now: now) }
      guard let data = loaded, findNext(data.days, now) != nil else {
        // Veri yok: uygulama açılınca (ya da yarım saat sonra) yeniden denenir
        completion(Timeline(entries: [PrayerEntry(date: now, data: loaded)], policy: .after(now.addingTimeInterval(30 * 60))))
        return
      }
      let dates = entryDates(data.days, now: now)
      let entries = dates.map { PrayerEntry(date: $0, data: data) }
      completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(3 * 3600))))
    }
  }

  /// Görünümün değiştiği anlar: dakika başları ("02:36" saniyesiz olduğu için), vakit girişleri ve
  /// sayaç aşaması sınırları (1 saat, 10 dakika, 5 dakika kala).
  private func entryDates(_ days: [DayTimes], now: Date) -> [Date] {
    var set = Set<Date>([now])
    let horizon = now.addingTimeInterval(24 * 3600)
    let minuteStart = Calendar.current.dateInterval(of: .minute, for: now)!.end
    var t = minuteStart
    while t < horizon {
      set.insert(t)
      // İlk 3 saat dakika dakika; sonrası (uygulama/sistem zaten yeniler) 10 dakikada bir
      t = t.addingTimeInterval(t < now.addingTimeInterval(3 * 3600) ? 60 : 600)
    }
    var cursor = now
    while let next = findNext(days, cursor), next.at <= horizon {
      for offset in [-3599.0, -600, -599, -299, 0] {
        let d = next.at.addingTimeInterval(offset)
        if d > now { set.insert(d) }
      }
      cursor = next.at
    }
    // Saat göstergesi canlı sayaca dönünce (son 1 saat) dakika başlarına gerek kalmaz ama zararı da yok
    return set.sorted()
  }

  private func sampleData() -> WidgetData {
    let now = Date()
    let f = DateFormatter()
    f.dateFormat = "HH:mm"
    var times: [String: String] = [:]
    for (i, key) in prayerKeys.enumerated() {
      times[key] = f.string(from: now.addingTimeInterval(Double(i - 2) * 2.5 * 3600 + 5400))
    }
    return WidgetData(
      themeId: "default", placeName: "İstanbul", latitude: 41.0082, longitude: 28.9784, method: 13,
      days: [DayTimes(date: dateKey(now), times: times, hijri: "")]
    )
  }
}

// MARK: - Görünüm yardımcıları

extension Color {
  init(hex: String, opacity: Double = 1) {
    let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
    self.init(
      .sRGB,
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255,
      opacity: opacity
    )
  }
}

enum InterWeight: String {
  case regular = "Inter-Regular"
  case medium = "Inter-Medium"
  case semibold = "Inter-SemiBold"
  case bold = "Inter-Bold"
}

/// Sistem yazı boyutundan etkilenmez (Android'deki allowFontScaling=false gibi)
func inter(_ weight: InterWeight, _ size: CGFloat) -> Font {
  .custom(weight.rawValue, fixedSize: size)
}

struct WidgetLook {
  let image: String?
  let gradient: [Color]
  let text: Color
  let muted: Color
  let accent: Color
  /// Sıradaki vaktin sütun arka planı
  let chip: Color

  static func of(_ themeId: String?) -> WidgetLook {
    switch themeId {
    case "mecca":
      return WidgetLook(
        image: "mecca", gradient: [], text: Color(hex: "#F6EFE2"), muted: Color(hex: "#C7B89C"),
        accent: Color(hex: "#D8AF68"), chip: Color(hex: "#D8AF68", opacity: 0.28))
    case "medina":
      return WidgetLook(
        image: "medina", gradient: [], text: Color(hex: "#F3EFE2"), muted: Color(hex: "#C9D2C0"),
        accent: Color(hex: "#9CCB9F"), chip: Color(hex: "#7FB885", opacity: 0.32))
    case "aqsa":
      return WidgetLook(
        image: "aqsa", gradient: [], text: Color(hex: "#F4F1E6"), muted: Color(hex: "#C9D2E6"),
        accent: Color(hex: "#E3BC5A"), chip: Color(hex: "#E3BC5A", opacity: 0.28))
    default:
      return WidgetLook(
        image: nil, gradient: [Color(hex: "#3A55C8"), Color(hex: "#1B2D82")], text: .white,
        muted: Color.white.opacity(0.82), accent: .white, chip: Color.white.opacity(0.24))
    }
  }
}

let stageSoon = Color(hex: "#FF8A80")
let stageUrgent = Color(hex: "#C8102E")

/// Temanın fotoğrafı (koyu örtü gömülü) ya da degradesi
struct ThemeBackground: View {
  let look: WidgetLook
  var wide = false

  var body: some View {
    if let image = look.image {
      Image(wide ? image + "Wide" : image)
        .resizable()
        .scaledToFill()
    } else {
      LinearGradient(colors: look.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
  }
}

/// 1 saat ve üstü kala "02:36" (dakikada bir yeni kayıt), altında sistemin işlettiği canlı "59:59";
/// son 10 dakikada başa sıfır eklenir ("09:59"), Android'deki gibi.
func countdownText(from now: Date, to at: Date) -> Text {
  let secondsLeft = Int(at.timeIntervalSince(now))
  if secondsLeft >= 3600 { return Text(hoursMinutes(secondsLeft)) }
  let timer = Text(timerInterval: now...max(now, at), countsDown: true)
  return secondsLeft < soonSeconds ? Text("0") + timer : timer
}

/// Bir kaydın gösterdiği an için hesaplanmış her şey
struct Snapshot {
  let look: WidgetLook
  let placeName: String
  let day: DayTimes
  let next: NextPrayer
  let isToday: Bool
  let stage: CountdownStage

  init?(_ entry: PrayerEntry) {
    guard let data = entry.data, let next = findNext(data.days, entry.date) else { return nil }
    // Yatsıdan sonra yarının vakitleri gösterilir (sıradaki vakit yarının imsakı)
    let shownDate = dateKey(next.at)
    guard let day = data.days.first(where: { $0.date == shownDate }) else { return nil }
    look = WidgetLook.of(data.themeId)
    placeName = data.placeName
    self.day = day
    self.next = next
    isToday = shownDate == dateKey(entry.date)
    stage = countdownStage(Int(next.at.timeIntervalSince(entry.date)))
  }

  var countdownColor: Color {
    switch stage {
    case .normal: return look.accent
    case .soon: return stageSoon
    case .urgent: return stageUrgent
    }
  }

  var dateLine: String { (isToday ? "" : "Yarın · ") + dayMonthTr(day.date) }
}

struct OpenAppMessage: View {
  let look: WidgetLook
  var size: CGFloat = 15

  var body: some View {
    Text("Vakitleri görmek için uygulamayı aç")
      .font(inter(.semibold, size))
      .foregroundStyle(look.text)
      .multilineTextAlignment(.center)
      .padding(14)
  }
}

/// Altı vakit yan yana; sıradakinin zemini renkli
struct PrayerColumns: View {
  let snap: Snapshot
  let nameSize: CGFloat
  let timeSize: CGFloat
  let verticalPadding: CGFloat

  var body: some View {
    HStack(spacing: 0) {
      ForEach(prayerKeys, id: \.self) { key in
        let active = key == snap.next.key
        VStack(spacing: 2) {
          Text(prayerNamesTr[key] ?? key)
            .font(inter(active ? .bold : .medium, nameSize))
            .foregroundStyle(active ? snap.look.accent : snap.look.muted)
          Text(snap.day.times[key] ?? "--:--")
            .font(inter(active ? .bold : .semibold, timeSize))
            .foregroundStyle(active ? snap.look.accent : snap.look.text)
            .monospacedDigit()
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity)
        .padding(.vertical, verticalPadding)
        .background(active ? snap.look.chip : .clear, in: RoundedRectangle(cornerRadius: 12))
      }
    }
  }
}

// MARK: - Namaz Vakitleri (Android 4x2)

struct PrayerTimesView: View {
  let entry: PrayerEntry

  var body: some View {
    let look = WidgetLook.of(entry.data?.themeId)
    Group {
      if let snap = Snapshot(entry) {
        VStack(spacing: 0) {
          HStack {
            Text(snap.placeName)
              .font(inter(.semibold, 13))
              .foregroundStyle(look.text)
            Spacer(minLength: 8)
            Text(snap.dateLine + (snap.day.hijri.isEmpty ? "" : " · \(snap.day.hijri)"))
              .font(inter(.regular, 12))
              .foregroundStyle(look.muted)
          }
          .lineLimit(1)
          Spacer(minLength: 0)
          VStack(spacing: 0) {
            Text("\(prayerNamesTr[snap.next.key] ?? "") vaktine kalan")
              .font(inter(.medium, 12))
              .foregroundStyle(look.muted)
            countdownText(from: entry.date, to: snap.next.at)
              .font(inter(.bold, snap.stage == .urgent ? 32 : 26))
              .foregroundStyle(snap.countdownColor)
              .monospacedDigit()
              .multilineTextAlignment(.center)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
          PrayerColumns(snap: snap, nameSize: 11, timeSize: 14, verticalPadding: 6)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
      } else {
        OpenAppMessage(look: look)
      }
    }
    .containerBackground(for: .widget) { ThemeBackground(look: look) }
  }
}

// MARK: - Vakit Şeridi (Android 6x2)

struct PrayerStripView: View {
  let entry: PrayerEntry

  var body: some View {
    let look = WidgetLook.of(entry.data?.themeId)
    Group {
      if let snap = Snapshot(entry) {
        GeometryReader { geo in
          HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
              Text(snap.placeName)
                .font(inter(.semibold, 13))
                .foregroundStyle(look.text)
              Text("\(prayerToTr[snap.next.key] ?? "") kalan")
                .font(inter(.medium, 11))
                .foregroundStyle(look.muted)
                .padding(.top, 4)
              countdownText(from: entry.date, to: snap.next.at)
                .font(inter(.bold, snap.stage == .urgent ? 32 : 28))
                .foregroundStyle(snap.countdownColor)
                .monospacedDigit()
              Text(snap.dateLine)
                .font(inter(.regular, 11))
                .foregroundStyle(look.muted)
                .padding(.top, 2)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: geo.size.width * 0.28, alignment: .leading)
            PrayerColumns(snap: snap, nameSize: 11, timeSize: 14, verticalPadding: 8)
          }
          .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
      } else {
        OpenAppMessage(look: look, size: 14)
      }
    }
    .containerBackground(for: .widget) { ThemeBackground(look: look, wide: true) }
  }
}

// MARK: - Vakte Kalan (Android 1x1; iOS'ta küçük kare + kilit ekranı)

struct CountdownView: View {
  let entry: PrayerEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let look = WidgetLook.of(entry.data?.themeId)
    let snap = Snapshot(entry)
    switch family {
    case .accessoryInline:
      Group {
        if let snap {
          Text("\(prayerToTr[snap.next.key] ?? "") ") + countdownText(from: entry.date, to: snap.next.at)
        } else {
          Text("Haydi Namaza")
        }
      }
      .containerBackground(for: .widget) { Color.clear }
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        if let snap {
          VStack(spacing: 0) {
            Text(prayerNamesTr[snap.next.key] ?? "")
              .font(inter(.semibold, 11))
            countdownText(from: entry.date, to: snap.next.at)
              .font(inter(.bold, 14))
              .monospacedDigit()
              .multilineTextAlignment(.center)
          }
          .lineLimit(1)
          .minimumScaleFactor(0.6)
          .padding(.horizontal, 4)
        }
      }
      .containerBackground(for: .widget) { Color.clear }
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 0) {
        if let snap {
          Text("\(prayerToTr[snap.next.key] ?? "") kalan")
            .font(inter(.semibold, 13))
          countdownText(from: entry.date, to: snap.next.at)
            .font(inter(.bold, 24))
            .monospacedDigit()
          Text("\(prayerNamesTr[snap.next.key] ?? "") \(snap.day.times[snap.next.key] ?? "")")
            .font(inter(.medium, 12))
        } else {
          Text("Uygulamayı aç").font(inter(.semibold, 13))
        }
      }
      .lineLimit(1)
      .frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(for: .widget) { Color.clear }
    default:
      Group {
        if let snap {
          VStack(spacing: 0) {
            Text(snap.placeName)
              .font(inter(.medium, 12))
              .foregroundStyle(look.muted)
            Spacer(minLength: 0)
            Text(prayerToTr[snap.next.key] ?? "")
              .font(inter(.semibold, 15))
              .foregroundStyle(look.text)
            countdownText(from: entry.date, to: snap.next.at)
              .font(inter(.bold, snap.stage == .urgent ? 40 : 36))
              .foregroundStyle(snap.countdownColor)
              .monospacedDigit()
              .multilineTextAlignment(.center)
            Spacer(minLength: 0)
            Text("\(prayerNamesTr[snap.next.key] ?? "") \(snap.day.times[snap.next.key] ?? "")")
              .font(inter(.medium, 12))
              .foregroundStyle(look.muted)
          }
          .lineLimit(1)
          .minimumScaleFactor(0.6)
          .padding(14)
        } else {
          OpenAppMessage(look: look, size: 13)
        }
      }
      .containerBackground(for: .widget) { ThemeBackground(look: look) }
    }
  }
}

// MARK: - Widget tanımları (adlar Android'deki app.json widget adlarıyla aynı)

struct PrayerTimesWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerTimes", provider: PrayerProvider()) { entry in
      PrayerTimesView(entry: entry)
    }
    .configurationDisplayName("Namaz Vakitleri")
    .description("Sıradaki vakit ve günün vakitleri, seçili temayla")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct PrayerCountdownWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerCountdown", provider: PrayerProvider()) { entry in
      CountdownView(entry: entry)
    }
    .configurationDisplayName("Vakte Kalan")
    .description("Sıradaki vakte kalan süre")
    .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    .contentMarginsDisabled()
  }
}

struct PrayerStripWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerStrip", provider: PrayerProvider()) { entry in
      PrayerStripView(entry: entry)
    }
    .configurationDisplayName("Vakit Şeridi")
    .description("Sıradaki vakte kalan süre ve yan yana günün vakitleri")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

@main
struct PrayerWidgetsBundle: WidgetBundle {
  var body: some Widget {
    PrayerTimesWidget()
    PrayerCountdownWidget()
    PrayerStripWidget()
  }
}
