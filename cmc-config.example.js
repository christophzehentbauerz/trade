window.CMC_CONFIG = {
    // Empfehlung: Nutze einen kleinen Server-/Proxy-Endpunkt, damit dein API-Key
    // nicht im Browser offengelegt wird. Lokales Beispiel:
    // python cmc_proxy.py
    // proxyUrl: 'http://127.0.0.1:8788/api/cmc/fear-and-greed/historical',
    proxyUrl: 'http://127.0.0.1:8788/api/cmc/fear-and-greed/historical',

    // Nur fuer lokale private Nutzung. Im Browser ist der Key sichtbar.
    apiKey: '',

    // Nur auf true setzen, wenn du den Key bewusst direkt im Browser senden willst.
    allowBrowserKey: false
};
