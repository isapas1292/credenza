const axios = require('axios');
const sql = require('mssql');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

const AiService = {
    async clasificarYGuardarSegmento(usuarioId, perfil) {
        try {
            console.log(`[AI] Llamando al servicio Python para usuario ${usuarioId}...`);
            const response = await axios.post(`${AI_SERVICE_URL}/profile/segment`, { perfil }, { timeout: 8000 });
            console.log(`[AI] Respuesta del servicio Python:`, JSON.stringify(response.data));

            const { segment_id, segment_name, profile_score, summary } = response.data.data;

            const req = new sql.Request();
            req.input('UsuarioId', sql.Int, usuarioId);
            req.input('SegmentId', sql.Int, segment_id);
            req.input('SegmentName', sql.NVarChar(255), segment_name);
            req.input('ProfileScore', sql.Decimal(5, 2), profile_score);
            req.input('Summary', sql.NVarChar(500), summary);

            console.log(`[AI] Ejecutando UPSERT en SegmentosFinancierosUsuario para UsuarioId=${usuarioId}...`);

            // Upsert: si ya existe un segmento para este usuario, actualizar
            await req.query(`
                IF EXISTS (SELECT 1 FROM SegmentosFinancierosUsuario WHERE UsuarioId = @UsuarioId)
                    UPDATE SegmentosFinancierosUsuario
                    SET SegmentId          = @SegmentId,
                        SegmentName        = @SegmentName,
                        ProfileScore       = @ProfileScore,
                        Summary            = @Summary,
                        FechaActualizacion = GETDATE()
                    WHERE UsuarioId = @UsuarioId
                ELSE
                    INSERT INTO SegmentosFinancierosUsuario
                        (UsuarioId, SegmentId, SegmentName, ProfileScore, Summary, FechaCreacion, FechaActualizacion)
                    VALUES
                        (@UsuarioId, @SegmentId, @SegmentName, @ProfileScore, @Summary, GETDATE(), GETDATE())
            `);

            console.log(`[AI] ✅ Usuario ${usuarioId} → Segmento: "${segment_name}" (score: ${profile_score}) guardado en BD.`);
            return { segment_id, segment_name, profile_score, summary };
        } catch (err) {
            console.error(`[AI] ❌ Error al clasificar/guardar segmento para usuario ${usuarioId}:`);
            console.error('  Mensaje:', err.message);
            if (err.response) {
                console.error('  Respuesta AI service:', JSON.stringify(err.response.data));
            }
            return null;
        }
    }
};

module.exports = AiService;
