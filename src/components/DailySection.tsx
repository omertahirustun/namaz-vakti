import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from './AppText';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DailyContent, getDaily } from '../daily';
import { useTheme } from '../ThemeContext';
import { radius, ThemeColors } from '../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Paylaşım iptal edilirse ya da hata olursa sessizce yutar. */
function shareText(message: string) {
  Share.share({ message }).catch(() => {});
}

type Styles = ReturnType<typeof makeStyles>;

function Card({
  icon,
  iconColor,
  title,
  onShare,
  styles,
  mutedColor,
  children,
}: {
  icon: IconName;
  iconColor: string;
  title: string;
  onShare?: () => void;
  styles: Styles;
  mutedColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: `${iconColor}1F` }]}>
          <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
        {onShare ? (
          <TouchableOpacity
            onPress={onShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.shareButton}
          >
            <Ionicons name="share-social-outline" size={20} color={mutedColor} />
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Uzun metni kısaltıp dokununca açar. */
function Expandable({ text, style, lines, moreStyle }: { text: string; style: object; lines: number; moreStyle: object }) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  return (
    <TouchableOpacity activeOpacity={0.7} disabled={!overflow} onPress={() => setOpen((o) => !o)}>
      <Text
        style={style}
        numberOfLines={open ? undefined : lines}
        onTextLayout={(e) => {
          if (!open && e.nativeEvent.lines.length >= lines) setOverflow(true);
        }}
      >
        {text}
      </Text>
      {overflow ? <Text style={moreStyle}>{open ? 'Daha az göster' : 'Devamını oku'}</Text> : null}
    </TouchableOpacity>
  );
}

export default function DailySection({ date }: { date: string }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<DailyContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDaily(date)
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (!data) {
    return loading ? <ActivityIndicator style={styles.loader} color={colors.accent} /> : null;
  }

  const offline = <Text style={styles.muted}>İnternet bağlantısı olunca görünecek.</Text>;

  return (
    <View>
      <Card
        icon="book-open-page-variant"
        iconColor={colors.accent}
        title="Günün Ayeti"
        styles={styles}
        mutedColor={colors.muted}
        onShare={
          data.verse
            ? () =>
                shareText(
                  `📖 Günün Ayeti\n\n«${data.verse!.text}»\n\n— ${data.verse!.ref}\n\nHaydi Namaza uygulamasından paylaşıldı`
                )
            : undefined
        }
      >
        {data.verse ? (
          <>
            <Text style={styles.arabic}>{data.verse.arabic}</Text>
            <Text style={styles.body}>{data.verse.text}</Text>
            <Text style={styles.ref}>{data.verse.ref}</Text>
          </>
        ) : (
          offline
        )}
      </Card>

      <Card
        icon="format-quote-open"
        iconColor={colors.highlight}
        title="Günün Hadisi"
        styles={styles}
        mutedColor={colors.muted}
        onShare={
          data.hadith
            ? () =>
                shareText(
                  `📿 Günün Hadisi\n\n«${data.hadith!.text}»\n\n— ${data.hadith!.ref}\n\nHaydi Namaza uygulamasından paylaşıldı`
                )
            : undefined
        }
      >
        {data.hadith ? (
          <>
            <Expandable text={data.hadith.text} style={styles.body} moreStyle={styles.more} lines={6} />
            <Text style={styles.ref}>{data.hadith.ref}</Text>
          </>
        ) : (
          offline
        )}
      </Card>

      <Card icon="history" iconColor={colors.history} title="Tarihte Bugün" styles={styles} mutedColor={colors.muted}>
        {data.history.length > 0
          ? data.history.map((e, i) => (
              <View key={`${e.year}-${i}`} style={[styles.event, i > 0 && styles.eventSep]}>
                <Text style={styles.year}>{e.year}</Text>
                <Text style={styles.eventText}>{e.text}</Text>
              </View>
            ))
          : offline}
        {data.history.length > 0 ? <Text style={styles.ref}>Kaynak: Vikipedi</Text> : null}
      </Card>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 24 },
  card: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  iconBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  shareButton: { padding: 2, marginLeft: 8 },
  arabic: { color: colors.text, fontSize: 22, lineHeight: 40, textAlign: 'right', writingDirection: 'rtl', marginBottom: 8 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  ref: { color: colors.muted, fontSize: 12, marginTop: 8, textAlign: 'right' },
  more: { color: colors.accent, fontSize: 13, fontWeight: '600', marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14 },
  event: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  eventSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  year: { color: colors.history, fontWeight: '700', fontSize: 14, width: 42, fontVariant: ['tabular-nums'] },
  eventText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  });
}
