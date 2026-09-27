from pathlib import Path

import chromadb

DATA_DIR = Path(__file__).parent.parent / "data"
CHROMADB_DIR = DATA_DIR / "chromadb"

# Searched in this order; the Kenya guideline is the primary reference.
COLLECTIONS = ("kenya_fp", "who_mec", "aphrc")


def get_chroma_client():
    CHROMADB_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMADB_DIR))


def query_knowledge_base(query: str, collection_name: str = "who_mec", num_results: int = 3) -> dict:
    try:
        client = get_chroma_client()
        collection = client.get_collection(name=collection_name)
        return collection.query(query_texts=[query], n_results=num_results)
    except Exception:
        return {}


def _citation(meta: dict) -> str:
    source = meta.get("source", "unknown")
    page = meta.get("page")
    return f"{source}, p. {page}" if page else source


def retrieve(query: str, k: int = 5, per_collection: int = 4, max_distance: float = 0.75) -> list[dict]:
    """Return the k most relevant chunks across all collections, closest first.

    Each hit: {"text", "citation", "source", "page", "chapter", "distance"}.
    Hits further than `max_distance` (cosine) are dropped as off-topic.
    """
    hits: list[dict] = []
    for name in COLLECTIONS:
        res = query_knowledge_base(query, collection_name=name, num_results=per_collection)
        if not res or not res.get("documents"):
            continue
        for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
            meta = meta or {}
            if dist is not None and dist > max_distance:
                continue
            hits.append(
                {
                    "text": text,
                    "citation": _citation(meta),
                    "source": meta.get("source", name),
                    "page": meta.get("page"),
                    "chapter": meta.get("chapter"),
                    "distance": dist,
                }
            )
    hits.sort(key=lambda h: h["distance"] if h["distance"] is not None else 1.0)
    return hits[:k]


def query_all_collections(query: str, num_results: int = 3) -> list[str]:
    return [h["text"] for h in retrieve(query, k=num_results * len(COLLECTIONS), per_collection=num_results)]
