#!/usr/bin/env python3
"""Passt das von 'npx cap add android' erzeugte Projekt an (Rechte, Version, Sound, Icons)."""
import os, re, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RES_SRC = os.path.join(ROOT, 'resources')
APP = os.path.join(ROOT, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
run = os.environ.get('RUN_NUMBER', '1')

# 1) Rechte im Manifest
mf = os.path.join(MAIN, 'AndroidManifest.xml')
s = open(mf, encoding='utf-8').read()
perms = [
    '<uses-permission android:name="android.permission.VIBRATE" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
]
add = ''.join('    ' + p + '\n' for p in perms if p.split('"')[1] not in s)
assert '</manifest>' in s
s = s.replace('</manifest>', add + '</manifest>', 1)
open(mf, 'w', encoding='utf-8').write(s)

# 2) Versionsnummer = Build-Nummer (damit Updates ueber die alte App installiert werden koennen)
bg = os.path.join(APP, 'build.gradle')
g = open(bg, encoding='utf-8').read()
g, n = re.subn(r'versionCode\s+\d+', 'versionCode ' + run, g, count=1)
assert n == 1, 'versionCode nicht gefunden'
g = re.sub(r'versionName\s+"[^"]*"', 'versionName "1.0.%s"' % run, g, count=1)
open(bg, 'w', encoding='utf-8').write(g)

# 3) Stiller Ton fuer den Benachrichtigungskanal (nur vibrieren, nicht klingeln)
raw = os.path.join(MAIN, 'res', 'raw')
os.makedirs(raw, exist_ok=True)
shutil.copy(os.path.join(RES_SRC, 'silent.wav'), os.path.join(raw, 'silent.wav'))

# 4) Launcher-Icon (Fehler hier sind nicht kritisch)
try:
    big = Image.open(os.path.join(RES_SRC, 'icon-512.png')).convert('RGBA')
    mask = Image.open(os.path.join(RES_SRC, 'icon-maskable-512.png')).convert('RGBA')
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for d in legacy:
        folder = os.path.join(MAIN, 'res', 'mipmap-' + d)
        big.resize((legacy[d],) * 2, Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
        big.resize((legacy[d],) * 2, Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_round.png'))
        mask.resize((adaptive[d],) * 2, Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_foreground.png'))
    px = mask.getpixel((2, 2))
    color = '#%02X%02X%02X' % px[:3]
    colors = os.path.join(MAIN, 'res', 'values', 'ic_launcher_background.xml')
    open(colors, 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">%s</color>\n</resources>\n' % color)
except Exception as e:  # noqa
    print('Icon-Anpassung uebersprungen:', e, file=sys.stderr)

# 5) Langes, kraeftiges Vibrationsmuster fuer den Benachrichtigungskanal (das Plugin kennt nur an/aus)
import glob
cands = glob.glob(os.path.join(ROOT, 'node_modules', '@capacitor', 'local-notifications', 'android', '**', 'NotificationChannelManager.java'), recursive=True)
assert cands, 'NotificationChannelManager.java nicht gefunden'
jp = cands[0]
j = open(jp, encoding='utf-8').read()
needle = 'notificationChannel.enableVibration(channel.getBool(CHANNEL_VIBRATE));'
assert needle in j, 'Vibrations-Zeile im Plugin nicht gefunden'
# Muster je Kanal-ID (tb-<muster>-<ton>-), passend zu settings-theme.js
PATTERNS = {
    'kurz':  [600],
    'lang':  [1200, 150, 1200, 150, 1200, 150, 1200],
    'dauer': [6000],
    'puls':  [250, 150] * 7 + [250],
    'herz':  [180, 120, 500, 600, 180, 120, 500, 600, 180, 120, 500],
    'sos':   [150, 100, 150, 100, 150, 300, 500, 100, 500, 100, 500, 300, 150, 100, 150, 100, 150],
}
def jarr(a):
    return 'new long[]{0, ' + ', '.join(str(x) for x in a) + '}'
java = ('if (channel.getBool(CHANNEL_VIBRATE)) { String cidv = channel.getString(CHANNEL_ID); long[] pat = %s; ' % jarr(PATTERNS['lang'])
        + 'if (cidv != null) { '
        + ' else '.join('if (cidv.contains("-%s-")) pat = %s;' % (k, jarr(v)) for k, v in PATTERNS.items())
        + ' } notificationChannel.setVibrationPattern(pat); }')
if 'setVibrationPattern' not in j:
    j = j.replace(needle, needle + '\n            ' + java, 1)
    open(jp, 'w', encoding='utf-8').write(j)
    print('Vibrationsmuster je Kanal im Plugin gesetzt')

# 6) Festen Signaturschluessel direkt in der Gradle-Konfiguration eintragen
ks = os.path.join(RES_SRC, 'debug.keystore').replace('\\', '/')
g = open(bg, encoding='utf-8').read()
block = (
    "    signingConfigs {\n"
    "        debug {\n"
    "            storeFile file('%s')\n"
    "            storePassword 'android'\n"
    "            keyAlias 'androiddebugkey'\n"
    "            keyPassword 'android'\n"
    "        }\n"
    "    }\n" % ks
)
assert re.search(r'^android\s*\{', g, re.M), 'android-Block nicht gefunden'
if 'signingConfigs' not in g:
    g = re.sub(r'^(android\s*\{\s*\n)', lambda m: m.group(1) + block, g, count=1, flags=re.M)
    open(bg, 'w', encoding='utf-8').write(g)
    print('Signaturschluessel eingetragen')

print('Android-Projekt angepasst, Build-Nummer', run)
