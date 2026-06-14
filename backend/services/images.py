"""Image-provider abstraction for presentation slide images (services/slides.py).

`get_image_provider()` returns a singleton implementing
`get_image(query: str) -> {"url", "alt", "credit": {"name", "link"}} | None`.
UnsplashProvider (free tier) is the current implementation. To add an
AI-image-generation provider later: implement a class with the same
`get_image()` signature, return it from `get_image_provider()` based on
IMAGE_PROVIDER, and set IMAGE_PROVIDER (+ its own API key) in .env — no
changes needed in services/slides.py or the frontend.
"""

import os

import requests

_UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"


class ImageProvider:
    """get_image(query) -> {"url", "alt", "credit": {"name", "link"}} | None."""

    def get_image(self, query: str) -> dict | None:
        raise NotImplementedError


class UnsplashProvider(ImageProvider):
    """Unsplash Search API (free tier: 50 requests/hour).

    Results (including "no match" misses) are cached per query string for the
    life of the process. Generated decks tend to reuse similar English search
    phrases across slides/decks (e.g. "business meeting", "data analytics"),
    so this both guarantees at most one request per distinct query within a
    single deck and reduces repeat calls across decks — keeping real-world
    usage well under the hourly limit.
    """

    def __init__(self, access_key: str):
        self._access_key = access_key
        self._cache: dict[str, dict | None] = {}

    def get_image(self, query: str) -> dict | None:
        query = (query or "").strip()
        if not query:
            return None
        if query in self._cache:
            return self._cache[query]

        image = self._fetch(query)
        self._cache[query] = image
        return image

    def _fetch(self, query: str) -> dict | None:
        try:
            resp = requests.get(
                _UNSPLASH_SEARCH_URL,
                params={"query": query, "per_page": 1, "orientation": "landscape"},
                headers={"Authorization": f"Client-ID {self._access_key}"},
                timeout=6,
            )
            resp.raise_for_status()
            results = (resp.json() or {}).get("results") or []
            if not results:
                return None
            photo = results[0]
            user = photo.get("user") or {}
            return {
                "url": photo["urls"]["regular"],
                "alt": photo.get("alt_description") or query,
                "credit": {
                    "name": user.get("name") or "Unsplash",
                    "link": (user.get("links") or {}).get("html") or "https://unsplash.com",
                },
            }
        except Exception as exc:
            print(f"[Images] Unsplash request failed for query={query!r}: {exc}")
            return None


class NullProvider(ImageProvider):
    """No-op — active when no image-provider backend is configured/keyed."""

    def get_image(self, query: str) -> dict | None:
        return None


_provider_instance: ImageProvider | None = None


def get_image_provider() -> ImageProvider:
    """Singleton accessor — selects the provider via IMAGE_PROVIDER (default 'unsplash').

    'unsplash' with no UNSPLASH_ACCESS_KEY set, or any unrecognized
    IMAGE_PROVIDER value (e.g. a future 'ai' provider not yet implemented),
    falls back to NullProvider — get_image() always returns None and callers
    (services/slides.py::_attach_images) leave slides without an "image" key.
    """
    global _provider_instance
    if _provider_instance is None:
        provider_name = os.getenv("IMAGE_PROVIDER", "unsplash").strip().lower()
        if provider_name == "unsplash":
            access_key = os.getenv("UNSPLASH_ACCESS_KEY", "").strip()
            _provider_instance = UnsplashProvider(access_key) if access_key else NullProvider()
        else:
            _provider_instance = NullProvider()
    return _provider_instance
