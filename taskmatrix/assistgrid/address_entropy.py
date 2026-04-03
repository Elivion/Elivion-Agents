import math
from typing import List, Dict, Any

def compute_shannon_entropy(addresses: List[str]) -> float:
    """
    Compute Shannon entropy (bits) of an address sequence.
    """
    if not addresses:
        return 0.0
    freq: Dict[str, int] = {}
    for a in addresses:
        freq[a] = freq.get(a, 0) + 1
    total = len(addresses)
    entropy = 0.0
    for count in freq.values():
        p = count / total
        entropy -= p * math.log2(p)
    return round(entropy, 4)


def entropy_breakdown(addresses: List[str]) -> Dict[str, Any]:
    """
    Return detailed breakdown of Shannon entropy calculation.
    """
    if not addresses:
        return {"entropy": 0.0, "distribution": {}, "total": 0}
    freq: Dict[str, int] = {}
    for a in addresses:
        freq[a] = freq.get(a, 0) + 1
    total = len(addresses)
    distribution: Dict[str, float] = {}
    entropy = 0.0
    for addr, count in freq.items():
        p = count / total
        distribution[addr] = round(p, 4)
        entropy -= p * math.log2(p)
    return {
        "entropy": round(entropy, 4),
        "distribution": distribution,
        "total": total,
        "unique": len(freq),
    }


def classify_entropy(entropy: float, max_bits: float) -> str:
    """
    Classify entropy relative to max possible bits.
    """
    if max_bits <= 0:
        return "Undefined"
    ratio = entropy / max_bits
    if ratio > 0.8:
        return "High"
    if ratio > 0.4:
        return "Medium"
    return "Low"
