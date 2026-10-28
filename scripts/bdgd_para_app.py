"""Converte a BDGD da ANEEL (arquivo .gdb da distribuidora) em data/trafos.json para o app.

Uso:
    pip install geopandas pyogrio
    python scripts/bdgd_para_app.py caminho/EQUATORIAL_GO_xxxx.gdb --mun 5208707 --mun 5201405

A BDGD de cada distribuidora é baixada em https://dadosabertos-aneel.opendata.arcgis.com
(busque "BDGD" e o nome da distribuidora). Camadas usadas:
    UNTRMT  (ou UNTRD nas versões antigas)  transformadores de distribuição, com geometria
    EQTRMT                                  equipamento do trafo: tensões primária e secundária
    CTMT                                    circuitos de média tensão (alimentadores)
    SUB                                     subestações
    UGBT_tab                                usinas de GD na baixa tensão, ligadas ao trafo por UNI_TR_MT

Vários campos da BDGD são códigos de tabelas de domínio do PRODIST Módulo 10. O script
imprime os códigos encontrados para conferência; os não mapeados aparecem como "cód. N".
"""
import argparse
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

# PRODIST Módulo 10, tabela TTEN (código -> volts). Conferir com a saída de diagnóstico.
TTEN = {
    6: 127, 7: 208, 10: 220, 11: 230, 13: 240, 14: 254, 15: 380, 16: 400, 17: 440,
    43: 13200, 46: 13800, 49: 14190, 50: 14400, 59: 22000, 63: 24000, 69: 33000, 70: 34500,
}
POSSE = {"PD": "PD", "PT": "PT"}
IBGE_NOME = {}  # preenchido a partir da coluna MUN quando houver nome; senão fica só o código


def ler(gdb, *nomes, **kw):
    camadas = {n.upper(): n for n, _ in pyogrio.list_layers(gdb)}
    for n in nomes:
        if n.upper() in camadas:
            return gpd.read_file(gdb, layer=camadas[n.upper()], **kw)
    sys.exit(f"Nenhuma das camadas {nomes} existe no arquivo. Camadas: {sorted(camadas)}")


def volts(cod):
    try:
        cod = int(cod)
    except (TypeError, ValueError):
        return None
    return TTEN.get(cod)


def fmt_ten(v):
    if v is None:
        return "—"
    return f"{v/1000:.1f} kV".replace(".", ",") if v >= 1000 else f"{v} V"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("gdb")
    ap.add_argument("--mun", action="append", help="código IBGE do município (pode repetir); sem ele, exporta tudo")
    ap.add_argument("--saida", default="data/trafos.json")
    ap.add_argument("--fonte", default="BDGD ANEEL — Equatorial Goiás")
    a = ap.parse_args()

    tr = ler(a.gdb, "UNTRMT", "UNTRD")
    if a.mun:
        tr = tr[tr["MUN"].astype(str).isin(a.mun)]
    tr = tr.to_crs(4326)
    print(f"{len(tr)} transformadores", file=sys.stderr)

    eq = ler(a.gdb, "EQTRMT", "EQTRD", read_geometry=False)
    eq = eq.drop_duplicates("UNI_TR_MT" if "UNI_TR_MT" in eq else "UNI_TR_D")
    eq = eq.rename(columns={"UNI_TR_D": "UNI_TR_MT"}).set_index("UNI_TR_MT")

    ct = ler(a.gdb, "CTMT", read_geometry=False).set_index("COD_ID")
    sub = ler(a.gdb, "SUB", read_geometry=False).set_index("COD_ID")

    ug = ler(a.gdb, "UGBT_tab", "UGBT", read_geometry=False)
    ug = ug.rename(columns={"UNI_TR_D": "UNI_TR_MT"})
    ug["POT_INST"] = pd.to_numeric(ug["POT_INST"], errors="coerce").fillna(0)
    gd = ug.groupby("UNI_TR_MT")["POT_INST"].apply(lambda s: [round(x, 2) for x in s]).to_dict()

    print("Códigos de tensão encontrados (EQTRMT):", file=sys.stderr)
    for col in ("TEN_PRI", "TEN_SEC"):
        if col in eq:
            cods = sorted(eq[col].dropna().unique().tolist())
            print(f"  {col}: " + ", ".join(f"{c}->{volts(c) or '?'}" for c in cods), file=sys.stderr)

    trafos = []
    for _, r in tr.iterrows():
        if r.geometry is None or r.geometry.is_empty:
            continue
        p = r.geometry if r.geometry.geom_type == "Point" else r.geometry.centroid
        e = eq.loc[r.COD_ID] if r.COD_ID in eq.index else None
        c = ct.loc[r.CTMT] if r.CTMT in ct.index else None
        s = sub.loc[r.SUB] if "SUB" in r and r.SUB in sub.index else None
        tp = volts(e.TEN_PRI) if e is not None and "TEN_PRI" in e else None
        ts = volts(e.TEN_SEC) if e is not None and "TEN_SEC" in e else None
        pot = float(pd.to_numeric(r.get("POT_NOM"), errors="coerce") or 0)
        usinas = gd.get(r.COD_ID, [])
        fp = str(r.get("FAS_CON_P") or "")
        trafos.append({
            "id": str(r.COD_ID),
            "ll": [round(p.y, 6), round(p.x, 6)],
            "pot": pot,
            "tp": round(tp / 1000, 1) if tp else None,
            "ts": fmt_ten(ts),
            "sec": fmt_ten(ts),
            "ctmt": str(r.CTMT),
            "ctmt_nome": str(c.NOME) if c is not None and "NOME" in c else str(r.CTMT),
            "se": str(s.NOME) if s is not None and "NOME" in s else str(r.get("SUB", "")),
            "se_cod": str(r.get("SUB", "")),
            "fp": fp,
            "fs": str(r.get("FAS_CON_S") or ""),
            "tipo": "Trifásico" if len(fp.replace("N", "")) >= 3 else "Monofásico",
            "elo": str(r.get("CAP_ELO") or "Não informado"),
            "posse": POSSE.get(str(r.get("POS")), str(r.get("POS"))),
            "usinas": len(usinas),
            "gd": usinas,
            "ger": round(sum(usinas), 1),
            "mun": IBGE_NOME.get(str(r.MUN), ""),
            "ibge": str(r.MUN),
            "inst": str(r.get("POSTO_TRAN") or ""),
            "ano": None,
        })

    out = {"fonte": a.fonte, "trafos": trafos, "streets": [], "blocks": [], "feeders": []}
    if trafos:
        lat = sorted(t["ll"][0] for t in trafos)[len(trafos) // 2]
        lng = sorted(t["ll"][1] for t in trafos)[len(trafos) // 2]
        out["center"] = [lat, lng]
    Path(a.saida).parent.mkdir(parents=True, exist_ok=True)
    Path(a.saida).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Gravado {a.saida} com {len(trafos)} transformadores", file=sys.stderr)


if __name__ == "__main__":
    main()
