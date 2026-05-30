# Brief de diseño — "Diseñador de ventana de paso" (FlowOS)

> Pegá este documento completo en Claude (modo diseño / artifacts) y pedile: *"Diseñá este editor visual como un prototipo interactivo en React + Tailwind (un solo archivo), respetando exactamente el sistema de diseño descrito. Priorizá estética y claridad."*

---

## 1. Contexto del producto

**FlowOS** es un BPM/ERP (software de gestión interna para empresas), de estética oscura, tech y muy cuidada. Dentro de FlowOS existe un módulo de **Procesos**: flujos de trabajo (ej. "Orden de compra", "Aprobación de gastos") compuestos por **pasos**, cada uno asignado a un puesto de la empresa.

Cada paso muestra al usuario una **ventana con un formulario**. Lo que estás diseñando es el **editor visual donde el "diseñador de procesos" arma esa ventana** — un constructor tipo Canva/Figma: arrastra elementos a un lienzo, los posiciona libremente con guías de alineación, los redimensiona y configura.

**Modelo "tren de carga":** los datos cargados en un paso se acumulan y los pasos siguientes pueden verlos. Por eso los **campos de datos** se definen a nivel del proceso (compartidos) y en cada paso se elige **cuáles mostrar y cómo se ven**.

El usuario de este editor es un **power-user** (administrador de procesos): la herramienta debe ser potente y densa, pero bien organizada. El usuario final que ejecuta el proceso solo ve la ventana resultante, simple.

---

## 2. Qué hace el editor (funcionalidad)

Es un lienzo WYSIWYG donde el diseñador:
- **Arrastra** elementos desde una paleta al lienzo.
- Los **mueve libremente** (drag) con **guías de alineación inteligentes** (estilo Canva: aparecen líneas y se imanta a bordes/centros de otros elementos).
- Los **redimensiona** con handles en las esquinas/lados.
- Hace **zoom** (alejarse/acercarse, 40%–200%).
- Selecciona un elemento → un **panel de propiedades** a la derecha edita sus atributos.
- El lienzo tiene el **ancho real de la ventana final** (WYSIWYG): lo que ves es lo que verá el usuario que ejecuta el paso.

---

## 3. Layout de la pantalla (3 columnas + header, pantalla completa)

```
┌───────────────────────────────────────────────────────────────┐
│ HEADER: ícono + "Diseñar ventana del paso · {nombre paso}"      │
│         ............................................. [✓ Listo] │
├──────────┬──────────────────────────────────────┬──────────────┤
│ PALETA   │            LIENZO (centro)           │ PROPIEDADES  │
│ (izq)    │  fondo con grilla + glows            │ (der)        │
│          │  ┌────────────────────────────────┐  │              │
│ Campos   │  │  hoja blanca/oscura WYSIWYG     │  │ del elemento │
│ del      │  │  (ancho = ventana final)       │  │ seleccionado │
│ proceso  │  │  elementos posicionados libres │  │              │
│          │  └────────────────────────────────┘  │              │
│ Elementos│       [zoom −  100%  +]               │              │
└──────────┴──────────────────────────────────────┴──────────────┘
```

- **Header:** barra superior con ícono en cuadro redondeado, subtítulo mono en mayúsculas ("DISEÑADOR DE VENTANA · {paso}"), título grande, y botón "Listo" (primario) a la derecha.
- **Paleta (izq, ~240px):** dos secciones — "CAMPOS DEL PROCESO" (lista de campos disponibles; los ya usados se marcan con check y se deshabilitan) y "ELEMENTOS VISUALES" (cada uno con ícono + nombre + descripción corta).
- **Lienzo (centro, flexible):** fondo oscuro con **grilla de 32px + glows radiales** (azul arriba-izq, violeta abajo-der). En el centro, la "hoja" (la ventana) con su propia grilla sutil de 24px, borde con tinte azul, sombra de profundidad y esquinas redondeadas. Controles de zoom flotantes abajo.
- **Propiedades (der, ~240px):** vacío con hint si no hay selección; si hay, muestra los controles del elemento + sección "Mostrar solo si…" (condición) + posición X/Y/W/H numérica + botón eliminar.

---

## 4. Elementos de la paleta

### Campos de datos (capturan información del usuario)
Cada uno tiene: **label** (etiqueta), opción **obligatorio**, opción **solo lectura en este paso**, y según el tipo, opciones extra:
- **Texto** — input de una línea.
- **Texto largo** — área de varias líneas.
- **Número** — numérico.
- **Moneda ($)** — numérico con símbolo de moneda y formato (ej. `$ 1.500,00`).
- **Fecha** — selector de fecha.
- **Selección (dropdown)** — lista desplegable; opciones manuales o dinámicas (desde empleados/departamentos de la empresa).
- **Opción única (radio)** — botones de radio.
- **Selección múltiple** — varios checkboxes; el valor es una lista.
- **Checkbox** — sí/no.
- **Archivo** — subir un archivo.

### Elementos de presentación (estructura visual, no capturan datos)
- **Título** — encabezado grande. Props: texto, tamaño de fuente, **tipografía**, alineación horizontal (izq/centro/der) y **vertical** (arriba/medio/abajo).
- **Texto** — subtítulo o instrucción de ayuda (mismas props que título, más chico).
- **Divisor** — línea fina horizontal para separar secciones.
- **Sección** — caja de fondo (borde + relleno sutil) para **agrupar campos visualmente**; va detrás de los demás elementos.
- **Imagen** — logo/diagrama/instrucción visual. Por URL o subida directa.

### Texto dinámico
En Título y Texto se puede escribir `{Nombre del campo}` y en la ejecución real se reemplaza por el valor cargado (ej. "Pedido de {Material}" → "Pedido de Madera").

### Lógica condicional ("Mostrar solo si…")
Cualquier elemento puede tener una condición: *mostrar solo si [campo] [es igual a / es distinto de / contiene / está completo / está vacío] [valor]*. En la ejecución, el elemento aparece/desaparece en vivo según lo que cargue el usuario.

---

## 5. Interacciones clave
- **Drag libre + guías de alineación** (lo más importante para el feel): al mover un elemento cerca del borde/centro de otro, aparecen líneas guía y se imanta suavemente. Estilo Canva.
- **Resize** con handles (8 puntos).
- **Zoom** 40%–200% con controles +/−/reset; el contenido se escala manteniendo el drag preciso.
- **Selección**: click en un elemento lo selecciona (outline azul + glow); click en vacío deselecciona.
- **Paleta → lienzo**: click o drag agrega el elemento.

---

## 6. SISTEMA DE DISEÑO (respetar EXACTO)

**Tema oscuro (principal).** Estética: tech, profunda, con grilla de fondo y glows de color sutiles. Limpia y premium.

### Colores (HEX exactos)
```
Fondos:
  base:      #080B12   (fondo general, el más oscuro)
  surface:   #0E1220   (paneles, header, hoja)
  elevated:  #141928   (inputs, botones secundarios, items de lista)
  overlay:   #1A2035

Bordes:
  border:        #1E2540
  border-strong: #2A3356

Texto:
  primary:     #E2E8F8   (títulos, texto fuerte)
  secondary:   #C4CFEA
  muted:       #7A8BAD   (labels, subtítulos, descripciones)
  dim:         #4A5568
  placeholder: #3A4560

Acentos:
  azul (primario):  #3D7EFF
  esmeralda:        #10D9A0
  ámbar:            #F59E0B
  rojo:             #F43F5E
  violeta:          #A855F7   (usado para "elementos visuales")
  cyan:             #06B6D4
```

### Tipografía
- **Space Grotesk** para texto general y títulos.
- **JetBrains Mono** (o cualquier monospace) para: labels de sección en MAYÚSCULAS con `letter-spacing` amplio (~0.15em), valores numéricos, chips/badges.

### Detalles de estilo (la "magia" de FlowOS)
- **Grilla de fondo:** líneas de `rgb(30 37 64 / 0.35)` cada 32px (en el área del lienzo) y 24px sutil (en la hoja).
- **Glows:** radiales muy suaves de azul `rgb(61 126 255 / 0.10)` y violeta `rgb(168 85 247 / 0.08)` en las esquinas del área del lienzo.
- **Botón primario:** fondo azul `#3D7EFF`, texto blanco, esquinas redondeadas (~8px), y un **glow**: `box-shadow: 0 0 16px rgb(61 126 255 / 0.35)`. Hover: leve `translateY(-1px)`.
- **Paneles/cards:** fondo surface, borde 1px `#1E2540`, esquinas redondeadas (8–12px). Los modales/áreas grandes: borde con tinte azul `rgb(61 126 255 / 0.25)` y sombra profunda `0 24px 80px rgb(0 0 0 / 0.6)`.
- **Íconos:** dentro de cuadraditos redondeados con fondo del color de acento al ~12-15% de opacidad (ej. ícono azul sobre `rgb(61 126 255 / 0.15)`).
- **Labels de sección:** mono, mayúsculas, `text-[9px]`, `letter-spacing` ancho, color muted.
- **Selección de elemento:** outline azul 2px + `box-shadow: 0 0 16px rgb(61 126 255 / 0.3)`.
- **Inputs:** fondo elevated, borde border, texto primary, sin outline default (focus sutil).
- Estética general: **mucho aire, bordes finos, glows sutiles, nada chillón.** Premium y oscuro.

### Iconografía
Usar **lucide-react** (o íconos lineales equivalentes). Ejemplos usados: `LayoutTemplate` (header), `Heading` (título), `Type` (texto), `Minus` (divisor), `SquareDashed` (sección), `Image` (imagen), `Plus`, `Trash2`, `Check`.

---

## 7. Lo que quiero del entregable
Un **prototipo visual interactivo** (React + Tailwind, un archivo) del editor con:
- Las 3 columnas + header descritos.
- La paleta poblada con los elementos (con íconos + descripciones).
- El lienzo con la grilla + glows + una hoja con 2-3 elementos de ejemplo ya colocados (un título, un texto, un par de campos).
- El panel de propiedades mostrando los controles de un elemento seleccionado.
- Drag/resize si es posible (si no, al menos el layout y la estética perfectos).
- **Foco total en que la estética coincida con el sistema de diseño de arriba** — esa es la prioridad.

Sentite libre de **proponer mejoras de UX y disposición** que hagan el editor más cómodo e intuitivo sin perder potencia.
