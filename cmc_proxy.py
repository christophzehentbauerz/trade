import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen


HOST = os.environ.get("CMC_PROXY_HOST", "127.0.0.1")
PORT = int(os.environ.get("CMC_PROXY_PORT", "8788"))
CMC_API_KEY = os.environ.get("CMC_API_KEY", "").strip()
CMC_URL = "https://pro-api.coinmarketcap.com/v3/fear-and-greed/historical"


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


class CoinMarketCapProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/cmc/fear-and-greed/historical":
            json_response(self, 404, {"error": "not_found"})
            return

        if not CMC_API_KEY:
            json_response(
                self,
                500,
                {
                    "error": "missing_api_key",
                    "message": "Setze die Umgebungsvariable CMC_API_KEY vor dem Start."
                }
            )
            return

        params = parse_qs(parsed.query)
        limit = params.get("limit", ["8"])[0]
        query = urlencode({"limit": limit})
        request = Request(
            f"{CMC_URL}?{query}",
            headers={
                "Accept": "application/json",
                "X-CMC_PRO_API_KEY": CMC_API_KEY
            }
        )

        try:
            with urlopen(request, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))
                json_response(self, 200, payload)
        except HTTPError as error:
            message = error.read().decode("utf-8", errors="replace")
            json_response(
                self,
                error.code,
                {
                    "error": "cmc_http_error",
                    "status": error.code,
                    "message": message[:500]
                }
            )
        except URLError as error:
            json_response(
                self,
                502,
                {
                    "error": "cmc_unreachable",
                    "message": str(error.reason)
                }
            )

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), CoinMarketCapProxyHandler)
    print(f"CMC proxy running on http://{HOST}:{PORT}/api/cmc/fear-and-greed/historical")
    server.serve_forever()
