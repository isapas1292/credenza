const axios = require('axios');
const sql = require('mssql');

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

    async guardarSegmento(usuarioId, segmento, transaction = null) {
        const { segment_id, segment_name, profile_score, summary } = segmento;
        const req = transaction ? new sql.Request(transaction) : new sql.Request();
        req.input('UsuarioId', sql.Int, usuarioId);
        req.input('SegmentId', sql.Int, segment_id);
        req.input('SegmentName', sql.NVarChar(150), segment_name);
        req.input('ProfileScore', sql.Decimal(10, 2), profile_score);
        req.input('Summary', sql.NVarChar(1000), summary);

        // HOLDLOCK + indice UNIQUE garantizan exactamente una fila por usuario,
        // incluso si dos actualizaciones llegan al mismo tiempo.
        await req.query(`
            MERGE SegmentosFinancierosUsuario WITH (HOLDLOCK) AS target
            USING (SELECT @UsuarioId AS UsuarioId) AS source
                ON target.UsuarioId = source.UsuarioId
            WHEN MATCHED THEN
                UPDATE SET
                    SegmentId = @SegmentId,
                    SegmentName = @SegmentName,
                    ProfileScore = @ProfileScore,
                    Summary = @Summary,
                    FechaActualizacion = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (UsuarioId, SegmentId, SegmentName, ProfileScore, Summary, FechaCreacion, FechaActualizacion)
                VALUES (@UsuarioId, @SegmentId, @SegmentName, @ProfileScore, @Summary, GETDATE(), GETDATE());
        `);
        return segmento;
    },

};

module.exports = AiService;
