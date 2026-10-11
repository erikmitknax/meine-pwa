#!/usr/bin/env python3
"""Passt das von 'npx cap add android' erzeugte Projekt an (Version, Icons, fester Signaturschluessel)."""
import os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RES_SRC = os.path.join(ROOT, 'resources')
# Gleicher fester Debug-Schluessel wie beim Trainingsbuch (liegt in android-app/resources)
KEYSTORE = os.path.join(ROOT, '..', 'android-app', 'resources', 'debug.keystore')
APP = os.path.join(ROOT, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
run = os.environ.get('RUN_NUMBER', '1')

# 1) Versionsnummer = Build-Nummer (damit Updates ueber die alte App installiert werden koennen)
bg = os.path.join(APP, 'build.gradle')
g = open(bg, encoding='utf-8').read()
g, n = re.subn(r'versionCode\s+\d+', 'versionCode ' + run, g, count=1)
assert n == 1, 'versionCode nicht gefunden'
g = re.sub(r'versionName\s+"[^"]*"', 'versionName "1.0.%s"' % run, g, count=1)
open(bg, 'w', encoding='utf-8').write(g)

# 2) Launcher-Icon (Fehler hier sind nicht kritisch)
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

# 3) Festen Signaturschluessel direkt in der Gradle-Konfiguration eintragen
ks = os.path.abspath(KEYSTORE).replace('\\', '/')
assert os.path.exists(ks), 'Schluessel nicht gefunden: ' + ks
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

# 4) Vibration fuer den Timer erlauben
mf = os.path.join(MAIN, 'AndroidManifest.xml')
m = open(mf, encoding='utf-8').read()
if 'android.permission.VIBRATE' not in m:
    m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>', 1)
    open(mf, 'w', encoding='utf-8').write(m)
    print('VIBRATE-Berechtigung eingetragen')

# 5) Eigenes Plug-in: Dateien direkt in den Ordner "Download" speichern (Export)
pkg = 'io.github.erikmitknax.lernwerkstatt'
jdir = os.path.join(MAIN, 'java', *pkg.split('.'))
open(os.path.join(jdir, 'LwDownloadPlugin.java'), 'w', encoding='utf-8').write("""package %s;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "LwDownload")
public class LwDownloadPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("filename");
        String data = call.getString("data");
        String mime = call.getString("mime", "application/octet-stream");
        if (name == null || data == null) {
            call.reject("Dateiname oder Inhalt fehlt");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Direktes Speichern wird erst ab Android 10 unterstuetzt");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("Datei konnte nicht angelegt werden");
                return;
            }
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) {
                call.reject("Datei konnte nicht geschrieben werden");
                return;
            }
            try {
                out.write(bytes);
            } finally {
                out.close();
            }
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Speichern fehlgeschlagen: " + e.getMessage());
        }
    }
}
""" % pkg)
open(os.path.join(jdir, 'MainActivity.java'), 'w', encoding='utf-8').write("""package %s;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LwDownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
""" % pkg)
print('Download-Plug-in eingetragen')
