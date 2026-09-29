"""Private, owned SearXNG process for one local research execution."""
import argparse
import importlib.metadata
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--settings", required=True)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    settings = Path(args.settings).resolve()
    config = json.loads(settings.read_text())
    if config["server"]["bind_address"] != "127.0.0.1" or config["server"]["port"] != args.port:
        raise ValueError("Loopback-only search configuration required")
    if settings.stat().st_mode & 0o077:
        raise ValueError("Private search settings required")
    os.environ["SEARXNG_SETTINGS_PATH"] = str(settings)
    from searx.webapp import app
    from werkzeug.serving import make_server

    @app.get("/tkg-healthz", endpoint="tkg_research_health")
    def tkg_research_health():
        return {
            "service": "tech-knowledge-search/v1",
            "owner": os.environ["TKG_SEARCH_OWNER"],
            "config_sha256": os.environ["TKG_SEARCH_CONFIG_HASH"],
            "pid": os.getpid(),
            "version": importlib.metadata.version("searxng"),
        }

    server = make_server("127.0.0.1", args.port, app, threaded=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
