# Actualización compatible de dependencias, 30 de septiembre de 2026

La auditoría detectó avisos nuevos en el lock que había pasado la puerta anterior.
Se actualizaron sólo las dependencias implicadas; NestJS y Prisma mantienen sus
versiones. No se ejecutó `npm audit fix --force` ni se redujo el umbral de CI.

- `brace-expansion`: ramas 1.1.21, 2.1.7 y 5.0.12, respetando los rangos de sus
  consumidores. Corrigen los avisos de complejidad y recursión de septiembre.
- `fast-uri`: 3.1.8, dentro de su rama compatible, para corregir el análisis de
  autoridades y puertos.
- `multer`: override 2.4.0. La rama 2.3.0 conservaba un fallo de limpieza de
  archivos ante cargas multipart abortadas. Se conserva el major 2 y se elimina
  el override vulnerable.

La instalación terminó con cero vulnerabilidades en la auditoría npm. Este
resultado corresponde a los avisos disponibles ese día, no garantiza ausencia
de vulnerabilidades futuras ni sustituye las pruebas de integración.

Referencias: [Multer](https://github.com/advisories/GHSA-3pph-fpjx-jg34),
[brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[fast-uri](https://github.com/advisories/GHSA-qw65-cvwx-89v3).

No se cambiaron contratos, migraciones ni datos reales y no se desplegó ningún
componente.
