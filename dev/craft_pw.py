#!/usr/bin/env python3
"""Backwards-compatible CLI shim for craft_dev.cli (prefer `.venv/bin/craft-pw`)."""

from craft_dev.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
