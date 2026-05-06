Generación de imágenes (ai-image-gen)
Este proyecto incluye un script que genera automáticamente imágenes con IA en public/images/ para los artículos que referencian rutas tipo /images/<nombre>.png.

Cómo funciona (importante)
npm run ai-image-gen no “hace magia” por sí solo: npm únicamente ejecuta el script definido en package.json.
El trabajo real lo hace scripts/ai-image-gen.mjs:
Escanea tus archivos para encontrar referencias a /images/<slug>.(png|jpg|jpeg|webp)
Genera un prompt (algunos slugs tienen prompt específico; si no, usa un prompt automático)
Llama a Replicate (modelo black-forest-labs/flux-schnell) usando REPLICATE_API_TOKEN
Guarda el resultado como public/images/<slug>.png
Requisitos
Tener configurado REPLICATE_API_TOKEN (Replicate).
Opción 1: variable de entorno en tu sistema.
Opción 2: archivo .env en la raíz del proyecto con:
REPLICATE_API_TOKEN=tu_token_aqui
Node.js 18+ (para fetch nativo).
Qué archivos escanea
Páginas: src/pages/greek-recipes/*.astro
Artículos: src/content/articles/**/*.{md,mdx}
El script busca referencias como:

image: "/images/what-is-keto-diet.png" (frontmatter)
o cualquier texto que contenga /images/<nombre>.png|jpg|jpeg|webp
Si existe public/images/<nombre>.png, lo deja en SKIP. Si no existe, lo genera.

Cómo usarlo (paso a paso)
En cada artículo que quieras con imagen, asegúrate de tener una referencia:
En frontmatter (recomendado):
image: "/images/mi-slug.png"
Ejecuta:
npm run ai-image-gen
Las imágenes quedan en:
public/images/mi-slug.png
Reusar el script en otro proyecto / GitHub
Puedes copiar este sistema a cualquier repo y usarlo después de un git clone sin problema.

Copia el archivo:
scripts/ai-image-gen.mjs
En el nuevo proyecto, agrega este script en package.json:
"ai-image-gen": "node ./scripts/ai-image-gen.mjs"
Asegúrate de tener la carpeta destino:
public/images/ (el script la crea si no existe)
Configura REPLICATE_API_TOKEN en el entorno o en .env (no lo subas a Git).
Ejecuta:
npm run ai-image-gen
Si tu nuevo proyecto usa carpetas diferentes a estas:

src/pages/greek-recipes/*.astro
src/content/articles/**/*.{md,mdx}
entonces solo cambia las rutas al inicio del archivo scripts/ai-image-gen.mjs para que escanee tus directorios reales.

Qué decirle a la IA cuando crees artículos nuevos
Si vas a crear 20 artículos y quieres que el script genere sus imágenes automáticamente, dile a la IA algo así (cópialo tal cual):

Para cada artículo en src/content/articles/<Categoria>/, agrega en el frontmatter image: "/images/<slug>.png" usando el mismo <slug> del archivo (sin extensión). No inventes rutas diferentes. Luego yo ejecutaré npm run ai-image-gen para que se generen automáticamente las imágenes faltantes.

Notas importantes:

Si un artículo no tiene ninguna referencia a /images/..., el script no tiene cómo saber qué imagen crear.
El nombre recomendado es que coincida con el archivo:
Archivo: what-is-keto-diet.md
Imagen: /images/what-is-keto-diet.png
Para evitar generar imágenes equivocadas, mantén el slug consistente entre nombre de archivo y image:.
No subas tokens a GitHub: deja .env fuera del repositorio y usa variables de entorno en producción.