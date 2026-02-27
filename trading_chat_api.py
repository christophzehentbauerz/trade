import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from trading_chat_service import answer_trading_question

WEB_ROOT = Path(__file__).parent / "web"


class TradingChatHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, status_code: int, html: str) -> None:
        body = html.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in {"/", "/index.html"}:
            page = WEB_ROOT / "trader_coach.html"
            if page.exists():
                self._send_html(200, page.read_text(encoding="utf-8"))
                return
            self._send_html(404, "<h1>TraderCoach UI not found</h1>")
            return
        if self.path == "/health":
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"error": "Unknown endpoint"})

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(200, {"ok": True})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/chat":
            self._send_json(404, {"error": "Unknown endpoint"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            data = json.loads(raw_body.decode("utf-8"))
            question = str(data.get("question", "")).strip()
            context = data.get("context") if isinstance(data.get("context"), dict) else None
            if not question:
                self._send_json(400, {"error": "question is required"})
                return
            response = answer_trading_question(question, context=context)
            self._send_json(200, response)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON payload"})
        except Exception as exc:  # pragma: no cover
            self._send_json(500, {"error": f"Internal error: {exc}"})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def run_server(host: str = "127.0.0.1", port: int = 8787) -> None:
    server = ThreadingHTTPServer((host, port), TradingChatHandler)
    print(f"Trading Chat API running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
