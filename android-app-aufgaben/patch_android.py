#!/usr/bin/env python3
"""Passt das von 'npx cap add android' erzeugte Projekt an:
Version, Icons, fester Signaturschluessel und das Benachrichtigungs-Plug-in (lautlos, bleibt bis "Erledigt",
kommt nach dem Wegwischen nach 15 Minuten wieder)."""
import os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RES_SRC = os.path.join(ROOT, 'resources')
# Gleicher fester Debug-Schluessel wie bei den anderen Apps (liegt in android-app/resources)
KEYSTORE = os.path.join(ROOT, '..', 'android-app', 'resources', 'debug.keystore')
APP = os.path.join(ROOT, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
run = os.environ.get('RUN_NUMBER', '1')
PKG = 'io.github.erikmitknax.aufgaben'

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

# 4) Manifest: Benachrichtigungs-Berechtigung, Neustart-Empfaenger
mf = os.path.join(MAIN, 'AndroidManifest.xml')
m = open(mf, encoding='utf-8').read()
assert '</application>' in m and '</manifest>' in m, 'Manifest unerwartet'
receiver = (
    '        <receiver android:name="%s.AufgabenReceiver" android:exported="false">\n'
    '            <intent-filter>\n'
    '                <action android:name="android.intent.action.BOOT_COMPLETED" />\n'
    '            </intent-filter>\n'
    '        </receiver>\n' % PKG
)
perms = (
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
    '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />\n'
)
m = m.replace('</application>', receiver + '    </application>', 1)
m = m.replace('</manifest>', perms + '</manifest>', 1)
open(mf, 'w', encoding='utf-8').write(m)
print('Manifest angepasst')

# 5) Java: Speicher, Benachrichtigungen, Empfaenger, Plug-in, MainActivity
jdir = os.path.join(MAIN, 'java', *PKG.split('.'))
assert os.path.isdir(jdir), 'Java-Ordner fehlt: ' + jdir


def write_java(name, src):
    open(os.path.join(jdir, name + '.java'), 'w', encoding='utf-8').write(src.replace('PKG', PKG))


write_java('NStore', r"""package PKG;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Kleiner Speicher der Aufgaben auf der Android-Seite (damit Erinnerungen auch ohne offene App klappen). */
final class NStore {
    private NStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("aufgaben_native", Context.MODE_PRIVATE);
    }

    static JSONArray tasks(Context c) {
        try {
            return new JSONArray(p(c).getString("tasks", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void saveTasks(Context c, JSONArray a) {
        p(c).edit().putString("tasks", a.toString()).apply();
    }

    static JSONObject find(Context c, String id) {
        JSONArray a = tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    static void remove(Context c, String id) {
        JSONArray a = tasks(c);
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) out.put(o);
        }
        saveTasks(c, out);
    }

    /** Zeitpunkt, vor dem die Aufgabe nicht wieder angezeigt wird (nach dem Wegwischen). */
    static void setNext(Context c, String id, long next) {
        JSONArray a = tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) {
                try {
                    o.put("next", next);
                } catch (Exception ignored) {
                    // egal
                }
            }
        }
        saveTasks(c, a);
    }

    private static JSONArray doneList(Context c) {
        try {
            return new JSONArray(p(c).getString("done", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** In der Benachrichtigung abgehakt: merken, bis die Seite es abholt. */
    static void addDone(Context c, String id) {
        JSONArray d = doneList(c);
        d.put(id);
        p(c).edit().putString("done", d.toString()).apply();
    }

    static JSONArray pendingDone(Context c) {
        return doneList(c);
    }

    static JSONArray takeDone(Context c) {
        JSONArray d = doneList(c);
        p(c).edit().putString("done", "[]").apply();
        return d;
    }
}
""")

write_java('Notifier', r"""package PKG;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

final class Notifier {
    private Notifier() {}

    static final String CHANNEL = "aufgaben_leise";
    static final String ACT_DONE = "PKG.DONE";
    static final String ACT_DISMISSED = "PKG.DISMISSED";
    static final String ACT_SHOW = "PKG.SHOW";
    // Nach dem Wegwischen kommt die Aufgabe nach dieser Zeit zurueck
    static final long REPEAT_MS = 15L * 60L * 1000L;

    static int nid(String id) {
        return id.hashCode();
    }

    private static void ensureChannel(Context c) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Aufgaben (lautlos)", NotificationManager.IMPORTANCE_LOW);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private static PendingIntent receiverIntent(Context c, String action, String id, int slot) {
        Intent i = new Intent(c, AufgabenReceiver.class).setAction(action).putExtra("id", id);
        return PendingIntent.getBroadcast(c, nid(id) * 4 + slot, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Zeigt die Benachrichtigung: lautlos, "laufend", mit Erledigt-Knopf. */
    static void show(Context c, String id, String title) {
        ensureChannel(c);
        Notification.Action done = new Notification.Action.Builder(
                Icon.createWithResource(c, android.R.drawable.checkbox_on_background),
                "Erledigt",
                receiverIntent(c, ACT_DONE, id, 0)).build();

        PendingIntent open = null;
        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch != null) {
            open = PendingIntent.getActivity(c, nid(id) * 4 + 3, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        Notification.Builder b = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_agenda)
                .setContentTitle(title)
                .setContentText("Offen – mit „Erledigt“ abhaken")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setDeleteIntent(receiverIntent(c, ACT_DISMISSED, id, 1))
                .addAction(done);
        if (open != null) b.setContentIntent(open);

        c.getSystemService(NotificationManager.class).notify(nid(id), b.build());
    }

    static boolean isShown(Context c, String id) {
        for (StatusBarNotification s : c.getSystemService(NotificationManager.class).getActiveNotifications()) {
            if (s.getId() == nid(id)) return true;
        }
        return false;
    }

    /** Plant, dass die Aufgabe zur angegebenen Zeit (wieder) erscheint. */
    static void schedule(Context c, String id, long atMillis) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, receiverIntent(c, ACT_SHOW, id, 2));
    }

    static void cancelAlarm(Context c, String id) {
        c.getSystemService(AlarmManager.class).cancel(receiverIntent(c, ACT_SHOW, id, 2));
    }

    static void cancelNotification(Context c, String id) {
        c.getSystemService(NotificationManager.class).cancel(nid(id));
    }

    /** Alles wiederherstellen (nach Neustart): Faelliges zeigen, Kuenftiges planen. */
    static void restore(Context c) {
        long now = System.currentTimeMillis();
        JSONArray a = NStore.tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject t = a.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id");
            long at = Math.max(t.optLong("due", 0), t.optLong("next", 0));
            if (at <= now) show(c, id, t.optString("title")); else schedule(c, id, at);
        }
    }
}
""")

write_java('AufgabenReceiver', r"""package PKG;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class AufgabenReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String action = i.getAction();
        String id = i.getStringExtra("id");

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            Notifier.restore(c);
            return;
        }
        if (id == null) return;

        if (Notifier.ACT_DONE.equals(action)) {
            // "Erledigt" getippt: merken, bis die Seite es abholt und mit Firebase abgleicht
            NStore.addDone(c, id);
            NStore.remove(c, id);
            Notifier.cancelAlarm(c, id);
            Notifier.cancelNotification(c, id);
        } else if (Notifier.ACT_DISMISSED.equals(action)) {
            // Weggewischt: in 15 Minuten wieder anzeigen, falls noch offen
            if (NStore.find(c, id) != null) {
                long next = System.currentTimeMillis() + Notifier.REPEAT_MS;
                NStore.setNext(c, id, next);
                Notifier.schedule(c, id, next);
            }
        } else if (Notifier.ACT_SHOW.equals(action)) {
            JSONObject t = NStore.find(c, id);
            if (t != null) {
                NStore.setNext(c, id, 0);
                Notifier.show(c, id, t.optString("title"));
            }
        }
    }
}
""")

write_java('AufgabenPlugin', r"""package PKG;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "AufgabenNative")
public class AufgabenPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    /** Die Seite gibt die aktuelle Liste offener Aufgaben; hier werden Benachrichtigungen und Alarme angepasst. */
    @PluginMethod
    public void setTasks(PluginCall call) {
        JSArray arr = call.getArray("tasks");
        if (arr == null) {
            call.reject("tasks fehlt");
            return;
        }
        Context c = getContext();
        try {
            // Gerade in der Benachrichtigung abgehakte, noch nicht abgeholte Aufgaben nicht wieder anlegen
            Set<String> skip = new HashSet<>();
            JSONArray pend = NStore.pendingDone(c);
            for (int i = 0; i < pend.length(); i++) skip.add(pend.optString(i));

            Map<String, Long> oldNext = new HashMap<>();
            JSONArray old = NStore.tasks(c);
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.optJSONObject(i);
                if (o != null) oldNext.put(o.optString("id"), o.optLong("next", 0));
            }

            JSONArray fresh = new JSONArray();
            Set<String> keep = new HashSet<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.getJSONObject(i);
                String id = t.getString("id");
                if (skip.contains(id)) continue;
                JSONObject o = new JSONObject();
                o.put("id", id);
                o.put("title", t.optString("title"));
                o.put("due", t.optLong("due"));
                Long n = oldNext.get(id);
                o.put("next", n == null ? 0L : n);
                fresh.put(o);
                keep.add(id);
            }

            for (String id : oldNext.keySet()) {
                if (!keep.contains(id)) {
                    Notifier.cancelAlarm(c, id);
                    Notifier.cancelNotification(c, id);
                }
            }

            NStore.saveTasks(c, fresh);

            long now = System.currentTimeMillis();
            for (int i = 0; i < fresh.length(); i++) {
                JSONObject o = fresh.getJSONObject(i);
                String id = o.getString("id");
                long at = Math.max(o.optLong("due"), o.optLong("next"));
                if (at <= now) {
                    if (!Notifier.isShown(c, id)) Notifier.show(c, id, o.optString("title"));
                } else {
                    Notifier.schedule(c, id, at);
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("setTasks fehlgeschlagen: " + e.getMessage());
        }
    }

    /** In der Benachrichtigung abgehakte Aufgaben abholen. */
    @PluginMethod
    public void takeDone(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ids", NStore.takeDone(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void permissionState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", granted());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(final PluginCall call) {
        if (!granted() && Build.VERSION.SDK_INT >= 33 && getActivity() != null) {
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4711);
                }
            });
        }
        call.resolve();
    }
}
""")

write_java('MainActivity', r"""package PKG;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AufgabenPlugin.class);
        super.onCreate(savedInstanceState);
        // Zurueck-Taste/-Geste: erst in der Seite zurueck, erst dann App beenden
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv != null && wv.canGoBack()) {
                    wv.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }
}
""")
print('Benachrichtigungs-Plug-in eingetragen, Build-Nummer', run)
