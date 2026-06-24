package com.quicktrack.motorista;

import android.os.Bundle;
import android.webkit.WebView;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Habilita pull-to-refresh nativo no WebView
        try {
            WebView webView = getBridge().getWebView();
            ViewGroup parent = (ViewGroup) webView.getParent();

            if (parent != null && !(parent instanceof SwipeRefreshLayout)) {
                int index = parent.indexOfChild(webView);
                parent.removeView(webView);

                SwipeRefreshLayout swipeRefresh = new SwipeRefreshLayout(this);
                swipeRefresh.setLayoutParams(new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));

                swipeRefresh.addView(webView);
                parent.addView(swipeRefresh, index);

                // Cores do indicador de refresh (azul QuickTrack)
                swipeRefresh.setColorSchemeColors(0xFF0d6efd, 0xFF198754, 0xFFffc107);

                swipeRefresh.setOnRefreshListener(() -> {
                    webView.reload();
                    // Para o indicador após 2 segundos
                    webView.postDelayed(() -> swipeRefresh.setRefreshing(false), 2000);
                });
            }
        } catch (Exception e) {
            // Se falhar, o app continua sem pull-to-refresh
            e.printStackTrace();
        }
    }
}
