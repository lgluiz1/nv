package br.com.quicktrack.motorista;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QuickTrackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
