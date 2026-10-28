# Trafo Solar GO

App web (PWA, instalável no celular) para consultar os transformadores da distribuidora antes de projetar uma usina fotovoltaica. Toque num transformador no mapa e veja potência, tensões, alimentador (CTMT), subestação, fases, elo fusível, usinas já conectadas, geração conectada e a **janela para geração**.

## Funções

- Mapa com camada de satélite (Esri World Imagery) e rede de média tensão por alimentador.
- Ficha do transformador com os atributos da BDGD e atributos adicionais.
- Busca por código do transformador, alimentador ou subestação.
- Filtro "Usina que quero ligar (kW)": destaca os transformadores com janela suficiente.
- Simulador na ficha: diz se a usina cabe ou quantos kW faltam.
- Copiar os dados do transformador para o memorial/formulário de acesso.

A janela é estimada como **potência nominal do transformador (kVA) − geração já conectada (kW)**. É uma pré-análise; o parecer de acesso oficial é da distribuidora.

## Dados

Sem `data/trafos.json`, o app usa `data/exemplo.json` (dados fictícios, com aviso na tela).

Para gerar os dados reais a partir da BDGD da ANEEL:

1. Baixe a BDGD da Equatorial Goiás em <https://dadosabertos-aneel.opendata.arcgis.com> (busque "BDGD").
2. Rode:
   ```bash
   pip install geopandas pyogrio
   python scripts/bdgd_para_app.py EQUATORIAL_GO.gdb --mun 5208707   # Goiânia
   ```
3. Confira os códigos de tensão impressos pelo script (tabela TTEN do PRODIST Módulo 10).

## Rodar localmente

```bash
python -m http.server 8000
```
Abra <http://localhost:8000>.
