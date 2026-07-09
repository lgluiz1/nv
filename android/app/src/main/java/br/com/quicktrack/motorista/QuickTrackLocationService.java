package br.com.quicktrack.motorista;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.NetworkCapabilities;

public class QuickTrackLocationService extends Service {
    private static final String TAG = "QuickTrackGPS";
    private LocationManager locationManager;
    private String baseUrl;
    private String manifestoId;
    private String deviceToken;

    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            Log.d(TAG, "Location received natively: " + location.getLatitude() + ", " + location.getLongitude());
            sendLocationToBackend(location);
        }
        @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
    };

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @SuppressLint("MissingPermission")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            if ("STOP".equals(intent.getAction())) {
                stopTracking();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }
            if (intent.hasExtra("baseUrl")) {
                baseUrl = intent.getStringExtra("baseUrl");
            }
            if (intent.hasExtra("manifestoId")) {
                manifestoId = intent.getStringExtra("manifestoId");
            }
            if (intent.hasExtra("deviceToken")) {
                deviceToken = intent.getStringExtra("deviceToken");
            }
        }
        startForegroundService();
        startTracking();
        return START_STICKY; // Mantém o serviço imortal no Android
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // Quando o usuário arrasta o app para fechar (mata o processo 100%)
        Log.d(TAG, "App removido dos recentes. Parando GPS.");
        stopTracking();
        stopForeground(true);
        stopSelf();
    }

    private void startForegroundService() {
        String channelId = "quicktrack_gps_channel";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "Rastreamento de Viagem",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }

        Notification notification = new NotificationCompat.Builder(this, channelId)
                .setContentTitle("QuickTrack Ativo")
                .setContentText("Coletando GPS em segundo plano...")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= 34) { // Android 14+
            startForeground(1991, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1991, notification);
        }
    }

    @SuppressLint("MissingPermission")
    private void startTracking() {
        try {
            if (locationManager != null) {
                // Solicita coordenadas a cada 30 segundos usando GPS e Rede
                locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        30000,
                        0,
                        locationListener
                );
                locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        30000,
                        0,
                        locationListener
                );
                Log.d(TAG, "Native Tracking Started");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start location updates", e);
        }
    }

    private void stopTracking() {
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
            Log.d(TAG, "Native Tracking Stopped");
        }
    }

    private void sendLocationToBackend(Location location) {
        if (baseUrl == null || manifestoId == null) return;
        
        new Thread(() -> {
            try {
                String urlString = baseUrl;
            if (urlString != null && urlString.endsWith("/")) {
                urlString = urlString.substring(0, urlString.length() - 1);
            }
            URL url = new URL(urlString + "/api/manifesto/app/tracking-heartbeat/");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setDoOutput(true);
                
                long timestamp = System.currentTimeMillis();
                
                // Ler nível da bateria
                int batteryPct = -1;
                Intent batteryStatus = getApplicationContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (batteryStatus != null) {
                    int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                    if (level >= 0 && scale > 0) {
                        batteryPct = (int) ((level / (float) scale) * 100);
                    }
                }
                
                // Ler status da rede
                String networkType = "OFFLINE";
                try {
                    ConnectivityManager cm = (ConnectivityManager) getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                    if (cm != null) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            android.net.Network network = cm.getActiveNetwork();
                            if (network != null) {
                                NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
                                if (capabilities != null) {
                                    if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                                        networkType = "WIFI";
                                    } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                                        networkType = "4G/5G";
                                    }
                                }
                            }
                        } else {
                            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
                            if (activeNetwork != null && activeNetwork.isConnectedOrConnecting()) {
                                if (activeNetwork.getType() == ConnectivityManager.TYPE_WIFI) {
                                    networkType = "WIFI";
                                } else if (activeNetwork.getType() == ConnectivityManager.TYPE_MOBILE) {
                                    networkType = "4G/5G";
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to get network status", e);
                }

                String jsonInputString = "{\"manifesto_id\": \"" + manifestoId + "\", \"lat\": " + location.getLatitude() + ", \"lng\": " + location.getLongitude() + ", \"timestamp\": \"" + timestamp + "\"";
                
                if (batteryPct >= 0) {
                    jsonInputString += ", \"battery\": " + batteryPct;
                }
                jsonInputString += ", \"network\": \"" + networkType + "\"";
                
                if (deviceToken != null && !deviceToken.isEmpty()) {
                    jsonInputString += ", \"device_token\": \"" + deviceToken + "\"";
                }
                jsonInputString += "}";
                
                try(OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInputString.getBytes("utf-8");
                    os.write(input, 0, input.length);			
                }
                
                int code = conn.getResponseCode();
                Log.d(TAG, "Heartbeat sent NATIVELY. Response Code: " + code);
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Failed to send native heartbeat", e);
            }
        }).start();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        stopTracking();
    }
}
