from typing import List, Tuple, Dict

def generate_activity_heatmap(
    timestamps: List[int],
    counts: List[int],
    buckets: int = 10,
    normalize: bool = True
) -> List[float]:
    """
    Bucket activity counts into 'buckets' time intervals,
    returning either raw counts or normalized [0.0–1.0].
    - timestamps: list of epoch ms timestamps.
    - counts: list of integer counts per timestamp.
    """
    if not timestamps:
        return []

    t_min, t_max = min(timestamps), max(timestamps)
    span = t_max - t_min or 1
    bucket_size = span / buckets

    agg = [0] * buckets
    for t, c in zip(timestamps, counts):
        idx = min(buckets - 1, int((t - t_min) / bucket_size))
        agg[idx] += c

    if normalize:
        m = max(agg) or 1
        return [round(val / m, 4) for val in agg]
    return agg


def generate_activity_heatmap_with_edges(
    timestamps: List[int],
    counts: List[int],
    buckets: int = 10,
    normalize: bool = True
) -> Tuple[List[float], List[Tuple[int, int]]]:
    """
    Same as generate_activity_heatmap but also returns the bucket time ranges.
    """
    if not timestamps:
        return [], []

    t_min, t_max = min(timestamps), max(timestamps)
    span = t_max - t_min or 1
    bucket_size = span / buckets

    agg = [0] * buckets
    edges: List[Tuple[int, int]] = []
    for i in range(buckets):
        start = int(t_min + i * bucket_size)
        end = int(t_min + (i + 1) * bucket_size)
        edges.append((start, end))

    for t, c in zip(timestamps, counts):
        idx = min(buckets - 1, int((t - t_min) / bucket_size))
        agg[idx] += c

    if normalize:
        m = max(agg) or 1
        agg = [round(val / m, 4) for val in agg]

    return agg, edges


def summarize_heatmap(values: List[float]) -> Dict[str, float]:
    """
    Provide summary statistics of a heatmap array.
    """
    if not values:
        return {"max": 0, "min": 0, "avg": 0}
    return {
        "max": max(values),
        "min": min(values),
        "avg": round(sum(values) / len(values), 4),
    }
