#!/usr/bin/env python3
"""Registro MINIMO de SUU en la allowlist Docker del MCP Dell V12.2.

No instala contenedores ni amplia permisos del runner/MCP. Conserva la política
real y falla si no coincide el esquema esperado.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import tempfile

CONTAINER = "suu-llm"

def prepare(data):
    if not isinstance(data, dict):
        raise ValueError("La política no es un objeto JSON")
    if not isinstance(data.get("docker"), list) or not all(
        isinstance(name, str) for name in data["docker"]
    ):
        raise ValueError("Esquema 'docker' desconocido: abortado, sin cambios")
    # V11/V12 installations may encode catalog as a mapping keyed by recipe,
    # or as an array. It is left completely unchanged in either case.
    if "catalog" in data and not isinstance(data["catalog"], (list, dict)):
        raise ValueError(
            "Esquema 'catalog' desconocido (" +
            type(data["catalog"]).__name__ + "): abortado, sin cambios"
        )
    if "projects" in data and not isinstance(data["projects"], dict):
        raise ValueError("Esquema 'projects' desconocido: abortado, sin cambios")
    result = json.loads(json.dumps(data))
    if CONTAINER not in result["docker"]:
        result["docker"].append(CONTAINER)
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", type=Path, required=True,
                        help="Ruta REAL de policy.json usado por el servicio systemd")
    parser.add_argument("--apply", action="store_true",
                        help="Requiere aprobación del propietario en sesión SSH")
    args = parser.parse_args()
    path = args.policy
    if path.is_symlink() or not path.is_file():
        parser.error("La política no existe o es enlace simbólico")
    raw = path.read_bytes()
    data = json.loads(raw)
    updated = prepare(data)
    print("Archivo:", path)
    print("Claves de política:", sorted(data.keys()))
    print("Docker permitido (nombres):", data["docker"])
    catalog = data.get("catalog", [])
    print("Catálogo:", type(catalog).__name__,
          "entradas:", len(catalog) if isinstance(catalog, (list, dict)) else "desconocido")
    print("Único cambio propuesto: añadir suu-llm a la allowlist Docker")
    print("Instalaciones desde MCP: NO habilitadas por este cambio")
    if raw == (json.dumps(updated, indent=2, ensure_ascii=False)+"\n").encode() and args.apply:
        print("Ya estaba registrado")
        return
    if not args.apply:
        print("MODO DIAGNÓSTICO: no se ha escrito nada. Usar --apply con autorización del propietario.")
        return
    if not os.access(path, os.W_OK):
        parser.error("No hay permiso de escritura sobre policy.json; usar sudo desde SSH")
    if updated == data:
        print("Sin cambios")
        return
    suffix = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(path.name + ".bak." + suffix)
    if backup.exists():
        parser.error("Existe backup con el mismo nombre, abortado")
    shutil.copy2(path, backup)
    payload = (json.dumps(updated, ensure_ascii=False, indent=2) + "\n").encode()
    fd, tmp = tempfile.mkstemp(prefix=".policy-suu-", dir=path.parent)
    try:
        os.fchmod(fd, path.stat().st_mode & 0o777)
        os.fchown(fd, path.stat().st_uid, path.stat().st_gid)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print("Actualizado. Respaldo:", backup)
    print("Reiniciar innova-admin-agent.service DESDE SSH tras validar JSON y política.")

if __name__ == "__main__":
    main()
