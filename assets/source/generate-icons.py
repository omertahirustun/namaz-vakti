# Cami ikonunu farklı kullanımlar için SVG olarak üretir.
# Kullanım: python3 generate-icons.py <klasör>  →  rsvg-convert ile PNGye çevrilir.
import sys

# Cami silueti (1024 tuvalde, yaklaşık x 150..874, y 205..830)
SHAPES = """
  <!-- minareler -->
  <path d="M170 800 V400 L200 300 L230 400 V800 Z"/>
  <rect x="156" y="470" width="88" height="22" rx="8"/>
  <rect x="176" y="560" width="48" height="14" rx="6"/>
  <path d="M794 800 V400 L824 300 L854 400 V800 Z"/>
  <rect x="780" y="470" width="88" height="22" rx="8"/>
  <rect x="800" y="560" width="48" height="14" rx="6"/>
  <!-- ana bina -->
  <rect x="262" y="560" width="500" height="250" rx="10"/>
  <!-- kubbe -->
  <path d="M322 572 C300 470 410 395 512 345 C614 395 724 470 702 572 Z"/>
  <rect x="306" y="555" width="412" height="28" rx="12"/>
  <!-- alem -->
  <rect x="506" y="275" width="12" height="80" rx="6"/>
  <circle cx="512" cy="238" r="34"/>
  <!-- zemin -->
  <rect x="140" y="800" width="744" height="30" rx="15"/>
"""
# Kesikler: kapı, pencereler, hilal boşluğu
CUTS = """
  <path d="M462 810 V705 A50 50 0 0 1 562 705 V810 Z"/>
  <path d="M318 740 V672 A26 26 0 0 1 370 672 V740 Z"/>
  <path d="M654 740 V672 A26 26 0 0 1 706 672 V740 Z"/>
  <path d="M190 700 V650 A10 10 0 0 1 210 650 V700 Z"/>
  <path d="M814 700 V650 A10 10 0 0 1 834 650 V700 Z"/>
  <circle cx="527" cy="228" r="29"/>
"""

def svg(fill, bg, scale=1.0, size=1024, dy=0):
    grad = """<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0EA58B"/><stop offset="1" stop-color="#1FB6C9"/></linearGradient>"""
    bgrect = f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ''
    t = f'translate(512 {512+dy}) scale({scale}) translate(-512 -518)'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">
  <defs>{grad}
    <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="black"/>
      <g fill="white">{SHAPES}</g>
      <g fill="black">{CUTS}</g>
    </mask>
  </defs>
  {bgrect}
  <g transform="{t}"><rect width="1024" height="1024" fill="{fill}" mask="url(#m)"/></g>
</svg>"""

out = sys.argv[1]
variants = {
    'icon': svg('url(#g)', '#FFFFFF', 0.86),               # iOS / genel ikon
    'adaptive-icon': svg('url(#g)', None, 0.64),          # Android ön plan (güvenli alan %66)
    'splash-icon': svg('url(#g)', None, 1.0),             # açılış ekranı
    'notification-icon': svg('#FFFFFF', None, 1.0),      # Android bildirim: beyaz siluet
    'favicon': svg('url(#g)', '#FFFFFF', 0.9),
}
for name, content in variants.items():
    open(f'{out}/{name}.svg', 'w').write(content)
