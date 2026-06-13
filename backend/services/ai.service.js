const axios = require('axios');
const { pool } = require('../db');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const AiService = {
    async clasificarPerfil(perfil) {
        const response = await axios.post(`${AI_SERVICE_URL}/profile/segment`, { perfil }, { timeout: 8000 });
        const segmento = response.data?.data;
        if (!segmento?.segment_id || !segmento?.segment_name) {
            throw new Error('El servicio Python devolvio una clasificacion financiera incompleta.');
        }
        return segmento;
    },

    /**
     * Upsert del segmento (una fila por usuario). Acepta un client de pg para
     * participar en una transacción; si no, usa el pool.
     */
    async guardarSegmento(usuarioId, segmento, client = null) {
        const { segment_id, segment_name, profile_score, summary } = segmento;
        const db = client || pool;

        // El índice UNIQUE en "UsuarioId" garantiza exactamente una fila por usuario.
        await db.query(`
            INSERT INTO "SegmentosFinancierosUsuario"
                ("UsuarioId", "SegmentId", "SegmentName", "ProfileScore", "Summary", "FechaCreacion", "FechaActualizacion")
            VALUES ($1, $2, $3, $4, $5, now(), now())
            ON CONFLICT ("UsuarioId") DO UPDATE SET
                "SegmentId"          = EXCLUDED."SegmentId",
                "SegmentName"        = EXCLUDED."SegmentName",
                "ProfileScore"       = EXCLUDED."ProfileScore",
                "Summary"            = EXCLUDED."Summary",
                "FechaActualizacion" = now()
        `, [usuarioId, segment_id, segment_name, profile_score, summary]);
        return segmento;
    },
};

module.exports = AiService;
