package br.com.quicktrack.motorista;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.Manifest;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "QuickTrackPlugin",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class QuickTrackPlugin extends Plugin {

    @PluginMethod
    public void startTracking(PluginCall call) {
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermsCallback");
        } else {
            startTrackingInternal(call);
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        if (getPermissionState("location") == com.getcapacitor.PermissionState.GRANTED) {
            startTrackingInternal(call);
        } else {
            call.reject("Permissão de localização negada pelo usuário.");
        }
    }

    private void startTrackingInternal(PluginCall call) {
        String manifestoId = call.getString("manifestoId");
        String baseUrl = call.getString("baseUrl");
        String deviceToken = call.getString("deviceToken");

        if (manifestoId == null || baseUrl == null) {
            call.reject("Must provide manifestoId and baseUrl");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, QuickTrackLocationService.class);
        intent.putExtra("manifestoId", manifestoId);
        intent.putExtra("baseUrl", baseUrl);
        if (deviceToken != null) intent.putExtra("deviceToken", deviceToken);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }

        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, QuickTrackLocationService.class);
        intent.setAction("STOP");
        context.startService(intent);
        call.resolve();
    }
}
