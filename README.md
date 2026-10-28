# Trafo Solar GO

App web (PWA, instalável no celular) para consultar os transformadores da distribuidora antes de projetar uma usina fotovoltaica. Toque num transformador no mapa e veja potência, tensões, alimentador (CTMT), subestação, fases, elo fusível, usinas já conectadas, geração conectada e a **janela para geração**.

## Funções

- Mapa com camada de satélite (Esri World Imagery) e rede de média tensão por alimentador.
- Ficha do transformador com os atributos da BDGD e atributos adicionais.
- Busca por endereço (OpenStreetMap), coordenada, município, distrito, código do transformador, alimentador ou subestação. Ao achar o ponto, abre o transformador mais próximo.
- Botão "Minha localização" (GPS) para uso em campo.
- Filtro "Usina que quero ligar (kW)": destaca os transformadores com janela suficiente.
- Simulador na ficha: diz se a usina cabe ou quantos kW faltam.
- Copiar os dados do transformador para o memorial/formulário de acesso.

A janela é estimada como **potência nominal do transformador (kVA) − geração já conectada (kW)**. É uma pré-análise; o parecer de acesso oficial é da distribuidora.

## Dados

`data/trafos.json` traz os transformadores ativos da BDGD 2025 da Equatorial Goiás em Edealina, Edéia, Pontalina, Vicentinópolis, Inhumas, Professor Jamil, Cromínia, Caldas Novas, Morrinhos e Acreúna, mais os distritos de Dois Irmãos (Pontalina) e Arantina (Acreúna), que aparecem na busca (11.858 trafos, 2.717 com micro/minigeração).

A BDGD informa quais unidades têm GD (`CEG_GD`), mas não a potência delas na baixa tensão. A potência vem da relação de empreendimentos de GD da ANEEL (`--gd empreendimento-geracao-distribuida.parquet`, de dadosabertos.aneel.gov.br), cruzada pelo código CEG. Trafos com usina sem potência encontrada aparecem em cinza como "GD a confirmar".

`dist/trafo-solar-go.html` é o app inteiro num arquivo só, para abrir com dois cliques. Gere de novo com `python scripts/gerar_arquivo_unico.py`.

Sem `data/trafos.json`, o app usa `data/exemplo.json` (dados fictícios, com aviso na tela).

Para gerar os dados reais a partir da BDGD da ANEEL:

1. Baixe a BDGD da Equatorial Goiás em <https://dadosabertos-aneel.opendata.arcgis.com> (busque "BDGD").
2. Rode:
   ```bash
   pip install geopandas pyogrio
   python scripts/bdgd_para_app.py Equatorial_GO_6072_2025-12-31.gdb \
     --mun 5207352 --mun 5207402 --mun 5217708 --mun 5222054 --mun 5210000 --mun 5218391 --mun 5206503 --mun 5204508 --mun 5213806 --mun 5200134 \
     --local "Dois Irmãos (Pontalina)|-17.4817|-49.3278|2.5" --local "Arantina (Acreúna)|-17.531|-50.196|2.5" \
     --gd empreendimento-geracao-distribuida.parquet
   ```
3. Códigos de tensão (TTEN) conferidos contra `TEN_LIN_SE`: 49 = 13,8 kV, 72 = 34,5 kV, 39 e 58 = fase-neutro desses sistemas.

## Rodar localmente

```bash
python -m http.server 8000
```
Abra <http://localhost:8000>.
