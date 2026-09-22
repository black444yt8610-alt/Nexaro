"""Optional local helpers for Nexaro AI development. The website does not require Python."""
from __future__ import annotations
import ast
import operator as op
import pathlib

OPS = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
       ast.Mod: op.mod, ast.Pow: op.pow, ast.USub: op.neg, ast.UAdd: op.pos}

def calculate(expr: str) -> float:
    tree = ast.parse(expr, mode="eval")
    def visit(node):
        if isinstance(node, ast.Expression): return visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)): return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in OPS: return OPS[type(node.op)](visit(node.left), visit(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in OPS: return OPS[type(node.op)](visit(node.operand))
        raise ValueError("Unsupported expression")
    value = visit(tree)
    if not isinstance(value, (int, float)):
        raise ValueError("Invalid result")
    return value

def read_text(path: str, limit: int = 180_000) -> str:
    p = pathlib.Path(path)
    return p.read_text(encoding="utf-8", errors="replace")[:limit]

if __name__ == "__main__":
    print(calculate("(12 + 8) * 3 / 2"))
