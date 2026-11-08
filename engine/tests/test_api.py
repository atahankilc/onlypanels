"""The API file must load: no test imported it, so a broken line once reached main."""
import importlib.util
from pathlib import Path


def test_api_loads_with_its_routes():
    spec = importlib.util.spec_from_file_location("api_main", Path(__file__).resolve().parents[2] / "api" / "main.py")
    main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(main)
    routes = {r.path for r in main.app.routes}
    assert {"/api/design", "/api/refine", "/api/scores", "/api/site/homes/{name}", "/api/site/solids/{name}"} <= routes
    # A chosen home, a point or a typed address never reaches this server: the page works them out itself.
    assert not any(r.endswith(("/search", "/reverse", "/area", "/squares")) or "/sun/" in r or "/home/" in r or "/square/" in r for r in routes)
    assert "/api/draft" not in routes
