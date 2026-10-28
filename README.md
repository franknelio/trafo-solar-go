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

`data/trafos.json` traz os transformadores ativos da BDGD 2025 da Equatorial Goiás em Edealina, Edéia, Pontalina, Vicentinópolis, Inhumas, Professor Jamil e Cromínia (5.613 trafos, 1.094 com micro/minigeração).

A BDGD informa quais unidades têm GD, mas não a potência delas na baixa tensão. Enquanto a planilha de GD da ANEEL não for cruzada (`--gd`), esses trafos aparecem em cinza como "GD a confirmar".

`dist/trafo-solar-go.html` é o app inteiro num arquivo só, para abrir com dois cliques. Gere de novo com `python scripts/gerar_arquivo_unico.py`.

Sem `data/trafos.json`, o app usa `data/exemplo.json` (dados fictícios, com aviso na tela).

Para gerar os dados reais a partir da BDGD da ANEEL:

1. Baixe a BDGD da Equatorial Goiás em <https://dadosabertos-aneel.opendata.arcgis.com> (busque "BDGD").
2. Rode:
   ```bash
   pip install geopandas pyogrio
   python scripts/bdgd_para_app.py Equatorial_GO_6072_2025-12-31.gdb \
     --mun 5207352 --mun 5207402 --mun 5217708 --mun 5222054 --mun 5210000 --mun 5218391 --mun 5206503
   ```
3. Códigos de tensão (TTEN) conferidos contra `TEN_LIN_SE`: 49 = 13,8 kV, 72 = 34,5 kV, 39 e 58 = fase-neutro desses sistemas.

## Rodar localmente

```bash
python -m http.server 8000
```
Abra <http://localhost:8000>.
