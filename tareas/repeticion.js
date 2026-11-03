// tareas/repeticion.js
// Calcula el día de la SIGUIENTE vez de una tarea que se repite (Fase 6, paso 6.5).
// Es la misma regla que usaba el frontend (siguienteFecha en frase.ts), ahora en el servidor:
//   - cada día      → el día siguiente
//   - cada semana   → el próximo día de los elegidos (lunes y jueves...) o, si no hay días, 7 días después
//   - cada mes      → el mismo día del mes siguiente (el 31 de enero pasa al último día de febrero)
//
// Las fechas son textos "AAAA-MM-DD" (así las da la base de datos con dateStrings).
// Se calcula en UTC a propósito: así el resultado NO depende de la zona horaria del servidor
// (Render está en UTC y tú en España, y con UTC los dos calculan exactamente lo mismo).

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2026-11-03" → milisegundos de ese día a las 00:00 UTC
function aMilisegundos(texto) {
    const partes = PATRON_FECHA.exec(String(texto).slice(0, 10));
    if (!partes) throw new Error('Fecha no válida');
    return Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
}

// milisegundos → "2026-11-03"
function aTexto(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

const UN_DIA = 24 * 60 * 60 * 1000;
const sumarDias = (texto, dias) => aTexto(aMilisegundos(texto) + dias * UN_DIA);
// 0 = domingo ... 6 = sábado (igual que dias_semana en la base de datos)
const diaDeLaSemana = (texto) => new Date(aMilisegundos(texto)).getUTCDay();

function siguienteFecha(fecha, repeticion, dias) {
    if (repeticion === 'diaria') return sumarDias(fecha, 1);

    if (repeticion === 'semanal') {
        if (Array.isArray(dias) && dias.length > 0) {
            for (let i = 1; i <= 7; i++) {
                const candidata = sumarDias(fecha, i);
                if (dias.includes(diaDeLaSemana(candidata))) return candidata;
            }
        }
        return sumarDias(fecha, 7);
    }

    if (repeticion === 'mensual') {
        const d = new Date(aMilisegundos(fecha));
        const anio = d.getUTCFullYear();
        const mes = d.getUTCMonth() + 1; // el mes siguiente (0 = enero, así que +1)
        // Día 0 del mes de después = último día del mes siguiente
        const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
        return aTexto(Date.UTC(anio, mes, Math.min(d.getUTCDate(), ultimoDia)));
    }

    return null; // no se repite
}

module.exports = { siguienteFecha };
