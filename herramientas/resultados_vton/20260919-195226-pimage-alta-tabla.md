# VTON con prunaai:p-image@try-on (persona alta)

Corrida 2026-09-19 19:53.

| Camisa | Salida | Costo real | Cambio medio / cabeza | Latencia |
|---|---|---|---|---|
| bordado-fino | 1125×1688 | $0.0045 | 4.3 / 0.3 | 13.2s |
| texto-limpio | 1125×1688 | $0.0045 | 3.4 / 0.3 | 11.9s |
| estampado-grande | 1125×1688 | $0.0045 | 16.5 / 0.3 | 11.0s |
| dos-colores | 1125×1688 | $0.0045 | 6.9 / 0.3 | 11.1s |

Semilla fija **20260919**, sin prompt, `preserveInputSize` en true. Persona `high_qual_test.jpg`, mandada a 1125×1688.

Precio antes de correr: catálogo $0.0069, ficha $0.0150. **Gastado real: $0.0180** en 4 llamadas.

## Criterios, escritos antes de mirar

- **bordado-fino**: ¿Queda en el pecho izquierdo una figura reconocible de caballo con jinete, o quedó una mancha del color correcto?
- **texto-limpio**: ¿Se lee YOUR LOGO, en dos renglones, con las letras separadas? Este es el criterio duro: o se lee o no se lee.
- **estampado-grande**: ¿Se lee 007 y se reconoce el cañón de la pistola? Y aparte: ¿el cuello dejó de ser polo y quedó redondo, o le dejó el cuello de la camisa vieja?
- **dos-colores**: ¿Sobreviven el cuello azul marino y las mangas azules con el vivo rojo, o se volvió una camisa blanca lisa? ¿Se lee YOUR DESIGN?