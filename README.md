# BCCR FX Tracker (CRC vs USD/EUR)

Mini app para trackear tipo de cambio con fuente oficial del BCCR.

## Qué hace
- Dashboard de USD/CRC y EUR/CRC
- Tendencia (últimos 30 puntos)
- Noticias/comunicados oficiales relacionados con tipo de cambio e intervenciones
- Deploy en GitHub Pages
- Actualización automática cada 30 min con GitHub Actions

## Configuración requerida (Secrets del repo)
En **Settings → Secrets and variables → Actions**:
- `BCCR_EMAIL` (correo suscrito al webservice del BCCR)
- `BCCR_TOKEN` (token del webservice)
- `BCCR_ID_USD_BUY` (default recomendado: 317)
- `BCCR_ID_USD_SELL` (default recomendado: 318)
- `BCCR_ID_EUR_BUY` (código de euro compra según catálogo BCCR)
- `BCCR_ID_EUR_SELL` (código de euro venta según catálogo BCCR)

Si no hay secrets, la página carga pero muestra N/D.

## Webservice BCCR
Suscripción: https://www.bccr.fi.cr/indicadores-economicos/servicio-web
