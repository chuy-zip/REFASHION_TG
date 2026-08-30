# Diagramas del sistema

> Diagramas en Mermaid, que GitHub y VS Code renderizan directo en este archivo.
> El código también se puede importar a draw.io (*Arrange → Insert → Advanced → Mermaid*)
> para retocar iconos y disposición.
>
> **Cada diagrama responde una sola pregunta**, que es lo que los mantiene legibles:
>
> | # | Pregunta | Tipo | Sección del documento |
> |---|---|---|---|
> | 1 | ¿Qué piezas hay y quién habla con quién? | Estructural | 7.2 Arquitectura del sistema |
> | 2 | ¿En qué orden ocurre, y por dónde viaja el binario? | Secuencia | 7.4 Gestión de catálogos |
> | 3 | ¿Cómo se relacionan los datos? | Entidad-relación | 7.3 Modelo de datos |
>
> **Fuente de verdad del esquema:** las migraciones `001` a `015` de esta misma carpeta. Si
> una migración nueva cambia una tabla, este archivo queda desactualizado hasta que se corrija.
> Estado reflejado aquí: migración `015`.

---

## 1. Arquitectura del sistema

Este diagrama responde una sola pregunta: **qué piezas hay y quién habla con quién.** No
describe el orden de las operaciones; para eso está el diagrama 2.

```mermaid
flowchart TB
    subgraph NAV["Navegador"]
        direction TB
        UI["Interfaz gráfica<br/>navegación de catálogos"]
        LIENZO["Lienzo interactivo<br/>composición y máscaras"]
    end

    subgraph VER["Vercel · funciones de servidor"]
        API["API interna REST<br/>única poseedora<br/>de las credenciales"]
    end

    subgraph EXT["Servicios externos"]
        direction TB
        SUPA[("Supabase<br/>PostgreSQL + Auth")]
        R2[("Cloudflare R2<br/>bucket privado")]
        RW["Runware<br/>inferencia generativa"]
    end

    UI -->|"JSON"| API
    LIENZO -->|"JSON"| API
    API -->|"metadatos y claves"| SUPA
    API -->|"solicitudes de generación"| RW
    NAV <==>|"binarios de imagen,<br/>sin pasar por la API"| R2
    RW -.->|"deposita el resultado"| R2

    classDef browserNode fill:#eef2ff,stroke:#6366f1,stroke-width:1.5px,color:#312e81
    classDef serverNode fill:#f5f3ff,stroke:#7c3aed,stroke-width:1.5px,color:#4c1d95
    classDef supaNode fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#065f46
    classDef r2Node fill:#fff7ed,stroke:#f97316,stroke-width:1.5px,color:#7c2d12
    classDef rwNode fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e3a8a

    class UI,LIENZO browserNode
    class API serverNode
    class SUPA supaNode
    class R2 r2Node
    class RW rwNode

    style NAV fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px
    style VER fill:#faf5ff,stroke:#c4b5fd,stroke-width:1px
    style EXT fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,stroke-dasharray: 3 3

    linkStyle 4 stroke:#f97316,stroke-width:3px
    linkStyle 5 stroke:#94a3b8,stroke-width:1.5px,stroke-dasharray:5 5
```

**Cómo leer los colores**

| Color | Capa |
|---|---|
| Índigo (navegador) | Todo lo que corre en el cliente |
| Morado (Vercel) | La única capa que ve credenciales y orquesta llamadas externas |
| Verde (Supabase) | Metadatos: usuarios, diseños, claves de objetos |
| Naranja (Cloudflare R2) | Binarios de imagen |
| Azul (Runware) | Inferencia generativa |

**Lo que la forma del dibujo dice por sí sola**

1. **Solo una caja toca los servicios de pago.** Todas las flechas hacia Runware y las llaves
   de R2 salen de la API. El navegador no tiene ninguna.
2. **Hay un camino que esquiva la API.** La flecha gruesa naranja entre el navegador y R2 es
   el único trazo del diagrama que no pasa por Vercel, y por ahí van los binarios. Es un
   hecho estructural, no una secuencia: no necesita número de paso para entenderse.
3. **Los dos almacenes están separados.** Supabase guarda la clave del objeto; R2 guarda el
   objeto.

> La flecha gris punteada de Runware hacia R2 corresponde a los módulos 2 y 3, todavía sin
> construir. El proveedor deposita el resultado en el bucket sin rebotar por el servidor.

---

## 2. Recorrido de una imagen

Aquí sí importa el orden, y por eso es un diagrama de secuencia y no un diagrama de cajas.
Lo que hay que ver es que **ninguna flecha del binario cruza la columna de la API**: lo único
que la API entrega es una autorización firmada de unos cientos de bytes.

> **Nota de color.** Mermaid no permite colorear cada `participant` por separado de forma
> confiable entre GitHub, VS Code y draw.io — solo existe una variable de tema global que
> pintaría a todos los actores igual, así que no serviría para distinguir capas como en el
> diagrama 1. En su lugar, cada `rect` de fase lleva un tinte de la misma paleta.

```mermaid
sequenceDiagram
    autonumber
    participant N as Navegador
    participant A as API interna
    participant B as Base de datos
    participant R as Almacenamiento R2

    rect rgb(238, 242, 255)
    Note over N,R: Subir una imagen al catálogo
    N->>A: solicita autorización de subida
    A->>A: construye la clave y la firma
    A-->>N: URL prefirmada, vence en minutos
    N->>R: envía el binario
    Note right of N: el archivo no atraviesa la API
    R-->>N: confirmación
    N->>A: avisa que la subida terminó
    A->>B: registra la clave y los metadatos
    end

    rect rgb(236, 253, 245)
    Note over N,R: Mostrarla más tarde
    N->>A: pide el catálogo
    A->>B: consulta las claves
    A-->>N: URLs de lectura temporales
    N->>R: pide el binario
    R-->>N: la imagen
    end
```

**Por qué el binario no pasa por el servidor.** Atravesar la función consumiría su tiempo de
ejecución y chocaría con el límite de tamaño de una petición. El patrón de URL prefirmada
traslada la transferencia al navegador y deja al servidor solo la decisión de autorizarla,
que es la parte que exige credenciales.

## 3. Modelo entidad-relación

Ocho tablas propias más `auth.users`, que administra Supabase Auth y que este esquema nunca
modifica: `profiles` la extiende uno a uno.

La cadena de acceso es `auth.users → client_members → clients → projects → designs → assets`.
Toda política de seguridad a nivel de fila la recorre para decidir qué ve cada usuario.

> **Nota de estilo.** Mermaid no soporta `classDef`/`style` sobre entidades dentro de un
> `erDiagram` en ningún renderer estable todavía, así que este diagrama no lleva colores por
> tabla — cualquier intento se ve inconsistente entre GitHub, VS Code y draw.io.

```mermaid
erDiagram
    auth_users ||--|| profiles : "extiende 1 a 1"
    roles ||--o{ profiles : "clasifica"

    auth_users ||--o{ client_members : "es miembro"
    clients ||--o{ client_members : "tiene miembros"

    clients ||--o{ projects : "agrupa"
    projects ||--o{ designs : "contiene"

    clients ||--o{ assets : "catálogo del cliente"
    designs ||--o{ assets : "recursos del diseño"

    designs ||--o{ design_layers : "apila"
    assets ||--o{ design_layers : "respalda la capa"

    assets ||--o{ assets : "parent_asset_id · linaje"
    designs ||--o{ designs : "parent_design_id · iteración"
    assets ||--o{ designs : "base_asset_id y current_asset_id"

    auth_users {
        uuid id PK "gestionada por Supabase Auth"
    }

    roles {
        smallint id PK
        text name UK "admin, editor, viewer"
        text description
    }

    profiles {
        uuid id PK "FK a auth.users"
        text first_name
        text last_name
        smallint role_id FK "rol global"
        text email "denormalizado (005)"
        timestamptz created_at
        timestamptz updated_at
    }

    clients {
        uuid id PK
        text name
        text nit
        text phone "009"
        text email "009"
        text address
        text city
        text country "default Guatemala"
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    client_members {
        uuid client_id PK "y FK a clients"
        uuid user_id PK "y FK a auth.users"
        text role "owner, editor, viewer"
        timestamptz created_at
    }

    projects {
        uuid id PK
        uuid client_id FK
        text name
        text description
        text status "draft, active, closed"
        timestamptz created_at
        timestamptz updated_at
    }

    designs {
        uuid id PK
        uuid project_id FK
        text name
        text garment_type "default shirt"
        smallint version "derivada del padre"
        uuid parent_design_id FK "iteración (010)"
        uuid base_asset_id FK "imagen de partida (010)"
        uuid current_asset_id FK "imagen de trabajo (013)"
        text status "draft, active, completed (011)"
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    assets {
        uuid id PK
        uuid client_id FK "catálogo, o nulo"
        uuid design_id FK "diseño, o nulo"
        text asset_type "12 valores permitidos"
        text r2_key UK "clave del objeto, no el binario"
        text mime_type
        bigint file_size_bytes
        text original_filename "008"
        text origin "upload, derived (012), generated"
        uuid runware_task_id "tarea de inferencia"
        numeric cost_usd "costo de la generación"
        text generation_prompt
        uuid parent_asset_id FK "linaje de derivación"
        timestamptz created_at
    }

    design_layers {
        uuid id PK
        uuid design_id FK
        uuid asset_id FK "el logotipo"
        float x_ratio "centro, fracción del ancho"
        float y_ratio "centro, fracción del alto"
        float width_ratio "fracción del ancho"
        float rotation_deg
        int z_index "orden de apilamiento"
        timestamptz created_at
        timestamptz updated_at
    }
```

**Decisiones de modelado que el diagrama deja ver**

| Qué se ve | Por qué está así |
|---|---|
| `clients` no tiene columna de propietario | El acceso se modela por membresía en `client_members`. Sumar un usuario es una fila, no una migración de esquema |
| `assets` cuelga de `clients` **o** de `designs` | Son dos ciclos de vida: el catálogo existe antes de cualquier proyecto; los recursos de un diseño nacen y mueren con él. Una restricción exige que al menos uno esté presente |
| `assets` y `designs` se referencian a sí mismas | `parent_asset_id` reconstruye la cadena de transformaciones de una imagen; `parent_design_id` distingue una propuesta de su iteración siguiente |
| `designs` apunta dos veces a `assets` | `base_asset_id` es de dónde partió; `current_asset_id` es sobre qué se trabaja ahora. Dejan de coincidir en cuanto corre un módulo generativo |
| Las capas están en tabla y no en un campo JSON | La llave foránea hacia `assets` hace que «qué diseños usan este logotipo» sea una consulta directa, que es lo que necesita el aviso previo al borrado |
| Las coordenadas son fracciones y no píxeles | La capa se reaplica sobre cualquiera que sea la imagen de trabajo, y su resolución cambia a lo largo del flujo |

> **Nota sobre el tipo de las coordenadas.** En el esquema son `double precision`; aquí
> aparecen como `float` porque Mermaid no admite el nombre compuesto.

---

## Mantenimiento

Al agregar una migración que cambie tablas o columnas, actualizar el bloque
`erDiagram` y la línea de «Estado reflejado aquí» del encabezado. Un diagrama que miente es
peor que ninguno.