"""Converte a BDGD da ANEEL (arquivo .gdb da distribuidora) em data/trafos.json para o app.

Uso:
    pip install geopandas pyogrio
    python scripts/bdgd_para_app.py Equatorial_GO_6072_2025-12-31.gdb --mun 5210000 --mun 5217708
    # opcional: potência das usinas, a partir da planilha de GD da ANEEL
    python scripts/bdgd_para_app.py ... --gd empreendimento-geracao-distribuida.parquet

A BDGD de cada distribuidora é baixada em https://dadosabertos-aneel.opendata.arcgis.com
(busque "BDGD" e o nome da distribuidora). Camadas usadas:
    UNTRMT    transformadores MT/BT (ponto, potência em kVA, tensão secundária em kV)
    EQTRMT    equipamento do trafo: código da tensão primária (tabela TTEN)
    CTMT      alimentadores; SUB subestações
    UCBT_tab  unidades consumidoras BT; CEG_GD preenchido = unidade com micro/minigeração
    SSDMT     trechos da rede de média tensão (desenhados no mapa)

A BDGD traz quais unidades têm GD (CEG_GD), mas não a potência instalada delas na baixa
tensão. A potência vem da planilha "Relação de empreendimentos de geração distribuída"
da ANEEL (dadosabertos.aneel.gov.br), cruzada pelo código CEG.
"""
import argparse
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.ops import linemerge, unary_union

# PRODIST Módulo 10, tabela TTEN (código -> kV). Os códigos 39 e 58 são tensões fase-neutro
# dos sistemas 13,8 kV e 34,5 kV (trafos monofásicos MRT).
TTEN_KV = {39: 7.97, 49: 13.8, 58: 19.92, 72: 34.5}
TTEN_SISTEMA = {39: 13.8, 49: 13.8, 58: 34.5, 72: 34.5}

MUNICIPIOS_GO = {
    "5207352": "Edealina", "5207402": "Edéia", "5217708": "Pontalina", "5222054": "Vicentinópolis",
    "5210000": "Inhumas", "5218391": "Professor Jamil", "5206503": "Cromínia", "5208707": "Goiânia",
    "5204508": "Caldas Novas", "5213806": "Morrinhos", "5200134": "Acreúna",
}
ELO = {"0": "Não informado", "": "Não informado"}


def ler(gdb, camada, **kw):
    return pyogrio.read_dataframe(gdb, layer=camada, **kw)


def lista_sql(valores):
    return ",".join(f"'{v}'" for v in valores)


def potencia_gd(caminho):
    """CEG -> kW a partir da relação de empreendimentos de GD da ANEEL (.parquet ou .csv)."""
    cols = ["CodEmpreendimento", "MdaPotenciaInstaladaKW"]
    if str(caminho).endswith(".parquet"):
        df = pd.read_parquet(caminho, columns=cols)
    else:
        df = pd.read_csv(caminho, sep=";", encoding="latin-1", dtype=str, usecols=cols)
    kw = pd.to_numeric(df["MdaPotenciaInstaladaKW"].astype(str).str.replace(",", "."), errors="coerce")
    return dict(zip(df["CodEmpreendimento"].astype(str).str.strip(), kw))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("gdb")
    ap.add_argument("--mun", action="append", required=True, help="código IBGE do município (pode repetir)")
    ap.add_argument("--local", action="append", default=[],
                    help='distrito ou povoado: "Nome|lat|lon|raio_km" (inclui trafos no raio, de qualquer município)')
    ap.add_argument("--gd", help="relação de empreendimentos de GD da ANEEL (.parquet ou .csv)")
    ap.add_argument("--saida", default="data/trafos.json")
    ap.add_argument("--fonte", default="BDGD ANEEL 2025 — Equatorial Goiás")
    a = ap.parse_args()
    muns = lista_sql(a.mun)

    tr = ler(a.gdb, "UNTRMT", where=f"MUN IN ({muns}) AND SIT_ATIV = 'AT'")
    locais = []
    for txt in a.local:
        nome, lat, lon, raio = txt.split("|")
        lat, lon, raio = float(lat), float(lon), float(raio)
        locais.append((nome, lat, lon, raio))
        d = raio / 111
        extra = ler(a.gdb, "UNTRMT", where="SIT_ATIV = 'AT'", bbox=(lon - d, lat - d, lon + d, lat + d))
        tr = pd.concat([tr, extra]).drop_duplicates("COD_ID")
    tr = gpd.GeoDataFrame(tr, geometry="geometry", crs=tr.crs).to_crs(4326)
    print(f"{len(tr)} transformadores", file=sys.stderr)
    ids = tr["COD_ID"].astype(str).tolist()

    eq = ler(a.gdb, "EQTRMT", read_geometry=False, columns=["UNI_TR_MT", "TEN_PRI"])
    eq = eq[eq["UNI_TR_MT"].isin(ids)].drop_duplicates("UNI_TR_MT").set_index("UNI_TR_MT")["TEN_PRI"]

    ct = ler(a.gdb, "CTMT", read_geometry=False, columns=["COD_ID", "NOME", "TEN_NOM", "SUB"]).set_index("COD_ID")
    sub = ler(a.gdb, "SUB", read_geometry=False, columns=["COD_ID", "NOME"]).set_index("COD_ID")["NOME"]

    todos_muns = lista_sql(sorted(set(a.mun) | set(tr["MUN"].astype(str))))
    uc = ler(a.gdb, "UCBT_tab", read_geometry=False, columns=["UNI_TR_MT", "CEG_GD", "SIT_ATIV", "MUN"],
             where=f"MUN IN ({todos_muns})")
    uc_tr = uc.groupby("UNI_TR_MT").size()
    gd = uc[uc["CEG_GD"].str.strip().fillna("") != ""]
    kw = potencia_gd(a.gd) if a.gd else {}
    usinas = gd.groupby("UNI_TR_MT")["CEG_GD"].apply(lambda s: [c.strip() for c in s]).to_dict()

    trafos = []
    for _, r in tr.iterrows():
        if r.geometry is None or r.geometry.is_empty:
            continue
        cid = str(r.COD_ID)
        c = ct.loc[r.CTMT] if r.CTMT in ct.index else None
        cod_tp = int(eq.get(cid)) if cid in eq.index and str(eq.get(cid)).isdigit() else None
        sistema = TTEN_SISTEMA.get(int(c.TEN_NOM)) if c is not None and str(c.TEN_NOM).isdigit() else None
        sistema = TTEN_SISTEMA.get(cod_tp) or sistema
        ts = float(r.TEN_LIN_SE or 0)
        cegs = usinas.get(cid, [])
        pots = [kw[x] for x in cegs if x in kw and pd.notna(kw[x])]
        fp = str(r.FAS_CON_P or "")
        se_nome = str(sub.get(r.SUB, r.SUB)) if r.SUB else ""
        trafos.append({
            "id": cid,
            "ll": [round(r.geometry.y, 6), round(r.geometry.x, 6)],
            "pot": float(r.POT_NOM or 0),
            "tp": sistema,
            "tp_fase": TTEN_KV.get(cod_tp),
            "ts": f"{round(ts * 1000)} V" if ts else "—",
            "ctmt": str(r.CTMT),
            "ctmt_nome": str(c.NOME) if c is not None else str(r.CTMT),
            "se": se_nome,
            "se_cod": str(r.SUB),
            "fp": fp,
            "fs": str(r.FAS_CON_S or ""),
            "tipo": "Trifásico" if len(fp) >= 3 else ("Bifásico" if len(fp) == 2 else "Monofásico"),
            "mrt": str(r.MRT) == "1",
            "elo": ELO.get(str(r.CAP_ELO or ""), str(r.CAP_ELO)),
            "posse": str(r.POS),
            "posto": str(r.POSTO or ""),
            "area": "Urbana" if str(r.ARE_LOC) == "UB" else "Rural",
            "ucs": int(uc_tr.get(cid, 0)),
            "usinas": len(cegs),
            "gd": [round(p, 2) for p in pots],
            "ger": round(sum(pots), 1) if (pots or not cegs) else None,
            "mun": MUNICIPIOS_GO.get(str(r.MUN), ""),
            "ibge": str(r.MUN),
            "ano": str(r.DAT_CON or "")[-4:] or None,
            "descr": str(r.DESCR or ""),
        })
        for nome, lat, lon, raio in locais:
            if ((r.geometry.y - lat) ** 2 + ((r.geometry.x - lon) * 0.95) ** 2) ** .5 * 111 <= raio:
                trafos[-1]["local"] = nome

    # rede MT dos alimentadores presentes, recortada à área dos transformadores
    ctmts = sorted({t["ctmt"] for t in trafos})
    lat = [t["ll"][0] for t in trafos]; lng = [t["ll"][1] for t in trafos]
    bbox = (min(lng) - .02, min(lat) - .02, max(lng) + .02, max(lat) + .02)
    ss = ler(a.gdb, "SSDMT", columns=["CTMT"], bbox=bbox, where=f"CTMT IN ({lista_sql(ctmts)})").to_crs(4326)
    paleta = ["#ff7a1a", "#2fb5ff", "#d36bff", "#ffd400", "#3fe0b0", "#ff4f8b", "#9be15d", "#7aa2ff"]
    feeders = []
    for i, (cod, grp) in enumerate(ss.groupby("CTMT")):
        linhas = []
        unida = linemerge(unary_union(list(grp.geometry))).simplify(0.00005)
        for parte in getattr(unida, "geoms", [unida]):
            if True:
                linhas.append([[round(y, 5), round(x, 5)] for x, y in parte.coords])
        c = ct.loc[cod] if cod in ct.index else None
        feeders.append({
            "id": str(c.NOME) if c is not None else str(cod), "cod": str(cod),
            "se": str(sub.get(c.SUB, "")) if c is not None else "",
            "ten": TTEN_SISTEMA.get(int(c.TEN_NOM), 13.8) if c is not None else 13.8,
            "cor": paleta[i % len(paleta)], "c": linhas,
        })

    out = {
        "fonte": a.fonte,
        "municipios": {m: MUNICIPIOS_GO.get(m, m) for m in a.mun},
        "localidades": [{"nome": n, "ll": [la, lo]} for n, la, lo, _ in locais],
        "center": [sorted(lat)[len(lat) // 2], sorted(lng)[len(lng) // 2]],
        "trafos": trafos, "feeders": feeders, "streets": [], "blocks": [],
    }
    Path(a.saida).parent.mkdir(parents=True, exist_ok=True)
    Path(a.saida).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    com_gd = sum(1 for t in trafos if t["usinas"])
    print(f"Gravado {a.saida}: {len(trafos)} trafos, {com_gd} com GD, {len(feeders)} alimentadores", file=sys.stderr)


if __name__ == "__main__":
    main()
