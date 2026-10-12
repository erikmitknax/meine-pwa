package io.github.erikmitknax.trainingsbuch;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Zeigt den Pausentimer als laufende Benachrichtigung mit Countdown.
 * Das System zaehlt die Zeit selbst herunter (Chronometer), die Seite muss nichts aktualisieren,
 * es funktioniert also auch bei gesperrtem Handy. Auf Android 16 kann die Anzeige zusaetzlich
 * als "Live-Update" in der Statusleiste erscheinen.
 * Leise: eigener Kanal ohne Ton und Vibration. Das Signal am Pausenende kommt weiter vom
 * LocalNotifications-Plugin.
 */
@CapacitorPlugin(name = "RestTimer")
public class RestTimerPlugin extends Plugin {
    private static final String CHANNEL_ID = "tb-live-timer";
    private static final int NOTIFICATION_ID = 4711;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Integer secObj = call.getInt("seconds");
            int seconds = secObj == null ? 0 : secObj;
            if (seconds < 1 || seconds > 3600) {
                call.resolve();
                return;
            }
            String title = call.getString("title", "Pause");
            String text = call.getString("text", "");
            Context ctx = getContext();
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || !NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
                call.resolve();
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Pausentimer (laufend)", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Zeigt die laufende Pause als Countdown. Ohne Ton und Vibration.");
                ch.setSound(null, null);
                ch.enableVibration(false);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            long endMs = System.currentTimeMillis() + seconds * 1000L;

            Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            PendingIntent pi = null;
            if (launch != null) {
                launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                pi = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            }

            int icon = ctx.getResources().getIdentifier("ic_stat_timer", "drawable", ctx.getPackageName());
            if (icon == 0) icon = android.R.drawable.ic_lock_idle_alarm;

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                    .setSmallIcon(icon)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setShowWhen(true)
                    .setWhen(endMs)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setTimeoutAfter(seconds * 1000L + 1500L);
            if (pi != null) b.setContentIntent(pi);

            // Android 16: als Live-Update in der Statusleiste anzeigen (wird auf aelteren Versionen ignoriert)
            Bundle extras = new Bundle();
            extras.putBoolean("android.requestPromotedOngoing", true);
            b.addExtras(extras);

            nm.notify(NOTIFICATION_ID, b.build());
            call.resolve();
        } catch (Throwable e) {
            call.resolve(); // Der Timer in der App laeuft auch ohne diese Anzeige weiter.
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Throwable e) {
            // nichts zu tun
        }
        call.resolve();
    }
}
